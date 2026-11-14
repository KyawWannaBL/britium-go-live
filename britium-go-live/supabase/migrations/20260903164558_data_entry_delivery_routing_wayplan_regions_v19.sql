begin;

-- V19 applies one delivery-region contract at Calculate, Save, bulk Save, and
-- Wayplan boundaries. Google coordinates are required only for the three core
-- operating regions. Outside-core parcels use Royal when an item price exists;
-- otherwise an explicitly selected highway-terminal handoff is required.

insert into public.be_data_entry_service_providers(
  provider_code,display_name,provider_type,is_active,updated_at
) values (
  'H.TERMINAL DROP-OFF','Highway Terminal Drop-off','TERMINAL',true,now()
) on conflict(provider_code) do update set
  display_name=excluded.display_name,
  provider_type=excluded.provider_type,
  is_active=true,
  updated_at=now();

alter table public.be_data_entry_parcel_details
  add column if not exists delivery_region text,
  add column if not exists delivery_route_mode text,
  add column if not exists location_required boolean not null default true,
  add column if not exists handoff_station_code text,
  add column if not exists handoff_station_name text;

alter table public.be_data_entry_parcel_details
  drop constraint if exists be_data_entry_delivery_region_v19_ck,
  drop constraint if exists be_data_entry_delivery_mode_v19_ck,
  drop constraint if exists be_data_entry_handoff_station_v19_ck;

alter table public.be_data_entry_parcel_details
  add constraint be_data_entry_delivery_region_v19_ck check (
    delivery_region is null or delivery_region in ('YANGON','MANDALAY','NAYPYITAW','OUTSIDE_CORE')
  ),
  add constraint be_data_entry_delivery_mode_v19_ck check (
    delivery_route_mode is null or delivery_route_mode in ('DOORSTEP_MAP','ROYAL_EXPRESS','HIGHWAY_BUS_STATION')
  ),
  add constraint be_data_entry_handoff_station_v19_ck check (
    delivery_route_mode is null
    or (
      delivery_route_mode='DOORSTEP_MAP'
      and location_required
      and handoff_station_code is null
      and handoff_station_name is null
    )
    or (
      delivery_route_mode='ROYAL_EXPRESS'
      and not location_required
      and handoff_station_code is null
      and handoff_station_name is null
    )
    or (
      delivery_route_mode='HIGHWAY_BUS_STATION'
      and not location_required
      and handoff_station_code in ('AUNG_MINGALAR','DAGON_AYAR_THIRI','OTHER')
      and length(btrim(coalesce(handoff_station_name,'')))>=3
    )
  );

create index if not exists be_data_entry_delivery_region_v19_idx
  on public.be_data_entry_parcel_details(delivery_region,delivery_route_mode,way_management_status);

create or replace function public.be_data_entry_delivery_route_v19(
  p_township text,
  p_item_price numeric default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_legacy jsonb := public.be_data_entry_service_provider_route_v17(p_township);
  v_key text := coalesce(v_legacy->>'destination_key','');
  v_legacy_reason text := coalesce(v_legacy->>'reason','UNRESOLVED');
  v_provider text;
  v_region text := 'UNRESOLVED';
  v_mode text := 'UNRESOLVED';
  v_reason text := 'UNRESOLVED';
  v_map_required boolean := false;
  v_station_required boolean := false;
begin
  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,'reason',v_reason,'region_code',v_region,
      'delivery_mode',v_mode,'map_required',false,'station_required',false,
      'destination_key',v_key,'matched_destination',null
    );
  end if;

  if v_legacy_reason='MANDALAY_DK_SERVICE_AREA' then
    v_provider := 'DK DELIVERY';
    v_region := 'MANDALAY';
    v_mode := 'DOORSTEP_MAP';
    v_reason := v_legacy_reason;
    v_map_required := true;
  elsif v_legacy_reason='NAYPYITAW_BRANCH_SERVICE_AREA' then
    v_provider := 'NPT BRANCH';
    v_region := 'NAYPYITAW';
    v_mode := 'DOORSTEP_MAP';
    v_reason := v_legacy_reason;
    v_map_required := true;
  elsif v_legacy_reason='EXACT_BRITIUM_ROUTE' then
    v_provider := 'BRITIUM';
    v_region := 'YANGON';
    v_mode := 'DOORSTEP_MAP';
    v_reason := v_legacy_reason;
    v_map_required := true;
  else
    v_region := 'OUTSIDE_CORE';
    if coalesce(p_item_price,0)>0 then
      v_provider := 'ROYAL EXPRESS';
      v_mode := 'ROYAL_EXPRESS';
      v_reason := 'OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE';
    else
      v_provider := 'H.TERMINAL DROP-OFF';
      v_mode := 'HIGHWAY_BUS_STATION';
      v_reason := 'OUTSIDE_CORE_HIGHWAY_STATION';
      v_station_required := true;
    end if;
  end if;

  return jsonb_build_object(
    'provider_code',v_provider,
    'reason',v_reason,
    'region_code',v_region,
    'delivery_mode',v_mode,
    'map_required',v_map_required,
    'station_required',v_station_required,
    'destination_key',v_key,
    'matched_destination',v_legacy->>'matched_destination',
    'legacy_route_reason',v_legacy_reason
  );
end
$function$;

revoke all on function public.be_data_entry_delivery_route_v19(text,numeric)
from public, anon, authenticated;
grant execute on function public.be_data_entry_delivery_route_v19(text,numeric)
to service_role;

-- Backfill only routes that need no new operator decision. Existing terminal
-- parcels remain unclassified until an operator selects the physical station.
with routed as (
  select d.id,public.be_data_entry_delivery_route_v19(d.township,d.item_price) as route
  from public.be_data_entry_parcel_details d
  where d.delivery_region is null or d.delivery_route_mode is null
)
update public.be_data_entry_parcel_details d
set delivery_region=r.route->>'region_code',
    delivery_route_mode=r.route->>'delivery_mode',
    location_required=coalesce((r.route->>'map_required')::boolean,false),
    updated_at=now()
from routed r
where d.id=r.id
  and r.route->>'delivery_mode' in ('DOORSTEP_MAP','ROYAL_EXPRESS');

create table if not exists public.be_wayplan_region_runtime_v19 (
  region_code text primary key check (region_code in ('YANGON','MANDALAY','NAYPYITAW')),
  display_name text not null,
  branch_code text not null,
  is_active boolean not null default false,
  map_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  change_reason text
);

alter table public.be_wayplan_region_runtime_v19 enable row level security;
revoke all on table public.be_wayplan_region_runtime_v19 from public, anon, authenticated;
grant all on table public.be_wayplan_region_runtime_v19 to service_role;

insert into public.be_wayplan_region_runtime_v19(
  region_code,display_name,branch_code,is_active,map_enabled,change_reason
) values
  ('YANGON','Yangon','YGN',true,true,'V19 initial focus'),
  ('MANDALAY','Mandalay','MDY',false,true,'V19 disabled until operations activate'),
  ('NAYPYITAW','Naypyitaw','NPT',false,true,'V19 disabled until operations activate')
on conflict(region_code) do update set
  display_name=excluded.display_name,
  branch_code=excluded.branch_code,
  map_enabled=excluded.map_enabled;

create or replace function public.be_wayplan_region_options_v19()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_regions jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by case r.region_code when 'YANGON' then 0 when 'MANDALAY' then 1 else 2 end),'[]'::jsonb)
  into v_regions
  from public.be_wayplan_region_runtime_v19 r;
  return jsonb_build_object('ok',true,'regions',v_regions,'focus_region','YANGON','build','WAYPLAN_REGION_CONTROL_V19_20260903');
end
$function$;

revoke all on function public.be_wayplan_region_options_v19() from public, anon;
grant execute on function public.be_wayplan_region_options_v19() to authenticated, service_role;

create or replace function public.be_wayplan_region_set_active_v19(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_region text := upper(nullif(btrim(coalesce(p_payload->>'region_code','')),''));
  v_active boolean := lower(coalesce(p_payload->>'is_active','false')) in ('true','1','yes','on');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_role text := lower(replace(coalesce(public.be_current_user_role(),''),'-','_'));
  v_profile_role text := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_row public.be_wayplan_region_runtime_v19;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_role not in (
       'app_owner','super_admin','superadmin','admin','operations_admin','operations',
       'operation_manager','operations_manager','ops_manager','supervisor','wayplan_manager','dispatch'
     )
     and v_profile_role not in (
       'app_owner','super_admin','superadmin','admin','operations_admin','operations',
       'operation_manager','operations_manager','ops_manager','supervisor','wayplan_manager','dispatch'
     ) then
    raise exception 'Wayplan region management permission is required.';
  end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then
    raise exception 'Choose Yangon, Mandalay, or Naypyitaw.';
  end if;
  if length(coalesce(v_reason,''))<5 then
    raise exception 'A change reason of at least 5 characters is required.';
  end if;

  update public.be_wayplan_region_runtime_v19
  set is_active=v_active,updated_at=now(),updated_by=auth.uid(),change_reason=v_reason
  where region_code=v_region
  returning * into v_row;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    auth.uid(),lower(auth.jwt()->>'email'),coalesce(nullif(v_role,'guest'),nullif(v_profile_role,''),'unknown'),
    'WAYPLAN_REGION_ACTIVE_CHANGED','WAYPLAN_REGION',v_region,
    jsonb_build_object('is_active',v_active,'reason',v_reason),
    'WAYPLAN_REGION_CONTROL_V19_20260903','WAYPLAN_REGION_ACTIVE_CHANGED',
    'WAYPLAN_REGION',v_region,jsonb_build_object('region',to_jsonb(v_row))
  );

  return jsonb_build_object('ok',true,'region',to_jsonb(v_row),'build','WAYPLAN_REGION_CONTROL_V19_20260903');
end
$function$;

revoke all on function public.be_wayplan_region_set_active_v19(jsonb) from public, anon;
grant execute on function public.be_wayplan_region_set_active_v19(jsonb) to authenticated, service_role;

create or replace function public.be_dispatch_ready_queue_v19(
  p_limit integer default 200,
  p_region_code text default 'YANGON'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_active boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;
  select r.is_active into v_active from public.be_wayplan_region_runtime_v19 r where r.region_code=v_region;
  if not coalesce(v_active,false) then
    return jsonb_build_object('ok',true,'enabled',false,'region_code',v_region,'queue','[]'::jsonb,'count',0,'build','WAYPLAN_REGION_QUEUE_V19_20260903');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select q.*,
           d.delivery_region,
           d.delivery_route_mode,
           d.location_required,
           coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code
    from public.be_v_dispatch_ready_queue q
    join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
    where d.delivery_region=v_region
      and d.delivery_route_mode='DOORSTEP_MAP'
      and d.location_required
      and exists (
        select 1 from public.be_delivery_location_registry location
        where location.delivery_way_id=d.delivery_way_id
          and location.review_status='ACCEPTED'
          and upper(coalesce(location.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
          and location.latitude between 9 and 29
          and location.longitude between 92 and 102
      )
    order by q.created_at desc
    limit greatest(coalesce(p_limit,200),1)
  ) x;

  return jsonb_build_object(
    'ok',true,'enabled',true,'region_code',v_region,'queue',v_rows,
    'count',jsonb_array_length(v_rows),'build','WAYPLAN_REGION_QUEUE_V19_20260903'
  );
end
$function$;

revoke all on function public.be_dispatch_ready_queue_v19(integer,text) from public, anon;
grant execute on function public.be_dispatch_ready_queue_v19(integer,text) to authenticated, service_role;

do $block$
begin
  if to_regprocedure('public.be_generate_wayplan_v18_legacy(jsonb)') is null then
    if to_regprocedure('public.be_generate_wayplan(jsonb)') is null then
      raise exception 'Wayplan generator is unavailable; cannot install V19 region enforcement.';
    end if;
    alter function public.be_generate_wayplan(jsonb) rename to be_generate_wayplan_v18_legacy;
  end if;
end
$block$;

create or replace function public.be_generate_wayplan(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_region text := upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_branch text;
  v_active boolean := false;
  v_selected jsonb := coalesce(p_payload->'delivery_way_ids',p_payload->'waybill_nos','[]'::jsonb);
  v_selected_count integer := 0;
  v_eligible integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then
    return jsonb_build_object('ok',false,'error','Choose Yangon, Mandalay, or Naypyitaw before generating a Wayplan.');
  end if;
  select r.branch_code,r.is_active into v_branch,v_active
  from public.be_wayplan_region_runtime_v19 r where r.region_code=v_region;
  if not coalesce(v_active,false) then
    return jsonb_build_object('ok',false,'error',format('%s Wayplan is disabled.',initcap(lower(v_region))),'region_code',v_region);
  end if;
  if jsonb_typeof(v_selected)<>'array' then
    return jsonb_build_object('ok',false,'error','delivery_way_ids must be an array.');
  end if;
  v_selected_count := jsonb_array_length(v_selected);
  if v_selected_count=0 then
    return jsonb_build_object('ok',false,'error','Select at least one stop from the active regional queue.');
  end if;

  select count(*)::integer into v_eligible
  from public.be_v_dispatch_ready_queue q
  join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
  where d.delivery_region=v_region
    and d.delivery_route_mode='DOORSTEP_MAP'
    and d.location_required
    and exists (
      select 1 from public.be_delivery_location_registry location
      where location.delivery_way_id=d.delivery_way_id
        and location.review_status='ACCEPTED'
        and upper(coalesce(location.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
        and location.latitude between 9 and 29
        and location.longitude between 92 and 102
    )
    and (q.delivery_way_id in (select jsonb_array_elements_text(v_selected))
      or q.waybill_no in (select jsonb_array_elements_text(v_selected)));
  if v_eligible<>v_selected_count then
    return jsonb_build_object(
      'ok',false,'error','Every selected parcel must be ready and belong to the same active Wayplan region.',
      'region_code',v_region,'selected',v_selected_count,'eligible',v_eligible
    );
  end if;

  v_payload := v_payload || jsonb_build_object('region_code',v_region,'branch_code',v_branch);
  v_result := public.be_generate_wayplan_v18_legacy(v_payload);
  if coalesce((v_result->>'ok')::boolean,false) then
    update public.be_wayplan_dispatches
    set branch_code=v_branch,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'region_code',v_region,'regional_gate','V19','map_required',true
        ),updated_at=now()
    where wayplan_id=v_result->>'wayplan_id';
    update public.be_wayplan_dispatch_stops
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'region_code',v_region,'regional_gate','V19'
    ),updated_at=now()
    where wayplan_id=v_result->>'wayplan_id';
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'region_code',v_region,'branch_code',v_branch,'build','WAYPLAN_REGION_GENERATE_V19_20260903'
  );
end
$function$;

revoke all on function public.be_generate_wayplan_v18_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.be_generate_wayplan_v18_legacy(jsonb) to service_role;
revoke all on function public.be_generate_wayplan(jsonb) from public, anon;
grant execute on function public.be_generate_wayplan(jsonb) to authenticated, service_role;

create or replace function public.be_data_entry_handoff_station_v19(
  p_code text,
  p_name text default null
) returns jsonb
language plpgsql
immutable
parallel safe
set search_path to 'public','pg_temp'
as $function$
declare
  v_code text := upper(nullif(btrim(coalesce(p_code,'')),''));
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
begin
  if v_code='AUNG_MINGALAR' then
    return jsonb_build_object('valid',true,'code',v_code,'name','Aung Mingalar Highway Bus Station / အောင်မင်္ဂလာအဝေးပြေး');
  elsif v_code='DAGON_AYAR_THIRI' then
    return jsonb_build_object('valid',true,'code',v_code,'name','Dagon Ayar / Dagon Thiri Highway Bus Station / ဒဂုံဧရာ-ဒဂုံသီရိအဝေးပြေး');
  elsif v_code='OTHER' and length(coalesce(v_name,''))>=3 then
    return jsonb_build_object('valid',true,'code',v_code,'name',v_name);
  end if;
  return jsonb_build_object('valid',false,'code',v_code,'name',v_name);
end
$function$;

revoke all on function public.be_data_entry_handoff_station_v19(text,text)
from public, anon, authenticated;
grant execute on function public.be_data_entry_handoff_station_v19(text,text)
to service_role;

create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_item_price numeric := case
    when btrim(coalesce(p_payload->>'item_price','')) ~ '^[0-9]+([.][0-9]+)?$'
      then (p_payload->>'item_price')::numeric
    else null
  end;
  v_route jsonb := public.be_data_entry_delivery_route_v19(p_payload->>'township',v_item_price);
  v_station jsonb := public.be_data_entry_handoff_station_v19(
    p_payload->>'handoff_station_code',p_payload->>'handoff_station_name'
  );
  v_provider text := nullif(v_route->>'provider_code','');
  v_requested_provider text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_result jsonb;
  v_data jsonb;
  v_resolution jsonb;
  v_warnings jsonb;
begin
  if v_provider is null then
    return jsonb_build_object(
      'ok',false,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','DELIVERY_ROUTE_UNRESOLVED','field','township',
        'message','Enter a recognized township before calculating.'
      )),'data','{}'::jsonb,'server_resolution',jsonb_build_object('delivery_route',v_route)
    );
  end if;
  if coalesce((v_route->>'station_required')::boolean,false)
     and not coalesce((v_station->>'valid')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','HIGHWAY_HANDOFF_STATION_REQUIRED','field','handoff_station_code',
        'message','Choose Aung Mingalar, Dagon Ayar/Thiri, or enter another highway station before calculating.'
      )),
      'data',jsonb_build_object(
        'service_provider_code',v_provider,'delivery_region',v_route->>'region_code',
        'delivery_route_mode',v_route->>'delivery_mode','location_required',false
      ),
      'server_resolution',jsonb_build_object('delivery_route',v_route,'handoff_station',v_station)
    );
  end if;

  v_payload := v_payload || jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'location_required',coalesce((v_route->>'map_required')::boolean,false),
    'handoff_station_code',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'code' else null end,
    'handoff_station_name',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'name' else null end
  );

  v_result := public.be_data_entry_financial_v2_calculate_v13_2_legacy(v_payload);
  v_data := coalesce(v_result->'data','{}'::jsonb)||jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'location_required',coalesce((v_route->>'map_required')::boolean,false),
    'handoff_station_code',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'code' else null end,
    'handoff_station_name',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'name' else null end
  );
  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb)||jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'map_required',coalesce((v_route->>'map_required')::boolean,false),
    'station_required',coalesce((v_route->>'station_required')::boolean,false),
    'delivery_route',v_route,
    'handoff_station',case when coalesce((v_route->>'station_required')::boolean,false) then v_station else null end,
    'client_service_provider_ignored',v_requested_provider is distinct from v_provider
  );
  v_warnings := coalesce(v_result->'warnings','[]'::jsonb);
  if v_requested_provider is not null and v_requested_provider is distinct from v_provider then
    v_warnings := v_warnings||jsonb_build_array(jsonb_build_object(
      'code','SERVICE_PROVIDER_AUTO_CORRECTED',
      'message','The service provider was corrected from the authoritative region and item-price routing rule.',
      'requested_provider',v_requested_provider,'resolved_provider',v_provider
    ));
  end if;

  return v_result||jsonb_build_object(
    'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
    'data',v_data,'server_resolution',v_resolution,'warnings',v_warnings
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_calculate(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb) to authenticated, service_role;

create or replace function public.be_data_entry_financial_v2_save(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb;
  v_upload_access jsonb;
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_sequence_text text := nullif(btrim(coalesce(p_payload->>'parcel_sequence','')),'');
  v_sequence integer;
  v_delivery_way_id text;
  v_service_type text := upper(coalesce(nullif(btrim(p_payload->>'service_type'),''),'STANDARD'));
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_result jsonb;
  v_is_addition boolean := false;
  v_os_import boolean := lower(coalesce(p_payload->>'os_softcopy_import','false')) in ('true','1','yes','on');
  v_photo_bypass boolean := lower(coalesce(p_payload->>'photo_bypass','false')) in ('true','1','yes','on');
  v_photo_mode text := upper(coalesce(nullif(btrim(p_payload->>'photo_evidence_mode'),''),'PICKER_PHOTO'));
  v_photo_reason text := nullif(btrim(coalesce(p_payload->>'photo_bypass_reason','')),'');
  v_source_file text := nullif(btrim(coalesce(p_payload->>'os_source_file_name',p_payload->>'source_file_name','')),'');
  v_source_row_text text := nullif(btrim(coalesce(p_payload->>'source_row_number','')),'');
  v_source_count_text text := nullif(btrim(coalesce(p_payload->>'source_row_count','')),'');
  v_source_row integer;
  v_source_count integer;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_payload_address text := btrim(coalesce(p_payload->>'delivery_address',''));
  v_payload_address_key text;
  v_location_address text;
  v_location_address_key text;
  v_item_price numeric := case
    when btrim(coalesce(p_payload->>'item_price','')) ~ '^[0-9]+([.][0-9]+)?$'
      then (p_payload->>'item_price')::numeric
    else null
  end;
  v_route jsonb := public.be_data_entry_delivery_route_v19(p_payload->>'township',v_item_price);
  v_station jsonb := public.be_data_entry_handoff_station_v19(
    p_payload->>'handoff_station_code',p_payload->>'handoff_station_name'
  );
  v_provider text := nullif(v_route->>'provider_code','');
  v_region text := nullif(v_route->>'region_code','');
  v_mode text := nullif(v_route->>'delivery_mode','');
  v_map_required boolean := coalesce((v_route->>'map_required')::boolean,false);
  v_station_required boolean := coalesce((v_route->>'station_required')::boolean,false);
begin
  v_access := public.be_data_entry_require_access_v57('create',false);
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  if v_pickup_id is null then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PICKUP_REQUIRED','field','pickup_id','message','pickup_id is required.')),
      'access',v_access
    );
  end if;
  if v_sequence_text is null or v_sequence_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PARCEL_SEQUENCE_REQUIRED','field','parcel_sequence','message','parcel_sequence must be a positive integer.')),
      'access',v_access
    );
  end if;
  v_sequence := v_sequence_text::integer;
  v_delivery_way_id := v_pickup_id||'-'||lpad(v_sequence::text,3,'0');

  if v_service_type not in ('STANDARD','EXPRESS','SAME_DAY','NEXT_DAY','ECONOMY') then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','INVALID_SERVICE_TYPE','field','service_type','message','Choose Standard, Express, Same Day, Next Day, or Economy.')),
      'access',v_access
    );
  end if;
  if v_provider is null or v_region='UNRESOLVED' or v_mode='UNRESOLVED' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','DELIVERY_ROUTE_UNRESOLVED','field','township','message','Enter a recognized township before saving.')),
      'access',v_access,'delivery_route',v_route
    );
  end if;
  if v_station_required and not coalesce((v_station->>'valid')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','HIGHWAY_HANDOFF_STATION_REQUIRED','field','handoff_station_code',
        'message','Choose Aung Mingalar, Dagon Ayar/Thiri, or enter another highway station before saving.'
      )),'access',v_access,'delivery_route',v_route
    );
  end if;

  v_payload := v_payload||jsonb_build_object(
    'delivery_way_id',v_delivery_way_id,
    'service_provider_code',v_provider,
    'delivery_region',v_region,
    'delivery_route_mode',v_mode,
    'location_required',v_map_required,
    'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
    'handoff_station_name',case when v_station_required then v_station->>'name' else null end
  );

  if v_os_import then
    v_upload_access := public.be_data_entry_require_access_v57('upload',false);
    if v_source_file is null or v_source_file !~* '^[^/\\]{1,180}\.(csv|xlsx|xls)$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_FILE_REQUIRED','field','os_source_file_name','message','A safe CSV/XLS/XLSX source filename is required for OS imports.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    if v_source_row_text is null or v_source_row_text !~ '^[1-9][0-9]*$'
       or v_source_count_text is null or v_source_count_text !~ '^[1-9][0-9]*$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_ROW_REQUIRED','field','source_row_number','message','Positive source row number and source row count are required for OS imports.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    v_source_row := v_source_row_text::integer;
    v_source_count := v_source_count_text::integer;
    if v_source_row>v_source_count+25 then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_ROW_OUT_OF_RANGE','field','source_row_number','message','The spreadsheet row exceeds its declared row count and header allowance.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
  elsif v_photo_bypass or v_photo_mode='OS_SOFTCOPY' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PHOTO_BYPASS_REQUIRES_OS_IMPORT','field','photo_bypass','message','Photo bypass is only available for a traced OS spreadsheet import.')),
      'access',v_access
    );
  end if;

  if v_map_required then
    if v_payload_address='' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_REQUIRED','field','delivery_address','message','A receiver address is required for Yangon, Mandalay, and Naypyitaw Google location validation.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    select r.address_original into v_location_address
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id
      and r.review_status='ACCEPTED'
      and upper(coalesce(r.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
      and r.latitude between 9 and 29
      and r.longitude between 92 and 102
    limit 1;
    if not found then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_NOT_SYNCED','field','delivery_address','message','Synchronize the Google drop point or Apply corrected coordinates before saving this core-region parcel.')),
        'access',v_access,'upload_access',v_upload_access,'delivery_route',v_route
      );
    end if;
    v_payload_address_key := lower(regexp_replace(v_payload_address,'[[:space:][:punct:]]+','','g'));
    v_location_address_key := lower(regexp_replace(btrim(coalesce(v_location_address,'')),'[[:space:][:punct:]]+','','g'));
    if v_payload_address_key='' or v_location_address_key<>v_payload_address_key then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_MISMATCH','field','delivery_address','message','The accepted Google pin belongs to a different address. Check or Apply coordinates for the current address.')),
        'access',v_access,'upload_access',v_upload_access,'delivery_route',v_route
      );
    end if;
  else
    v_location_address := 'MAP_NOT_REQUIRED:'||v_mode;
  end if;

  if v_photo_bypass and (v_photo_mode<>'OS_SOFTCOPY' or v_photo_reason is null or length(v_photo_reason)<10) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PHOTO_BYPASS_REASON_REQUIRED','field','photo_bypass_reason','message','OS-softcopy photo bypass requires a clear reason of at least 10 characters.')),
      'access',v_access,'upload_access',v_upload_access
    );
  end if;
  if not v_photo_bypass and v_photo_mode<>'PICKER_PHOTO' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','INVALID_PHOTO_EVIDENCE_MODE','field','photo_evidence_mode','message','Use picker-photo evidence unless an explicit OS-softcopy bypass is authorized.')),
      'access',v_access,'upload_access',v_upload_access
    );
  end if;

  select
    greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),coalesce(p.parcel_count,0),0),
    greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.')),
      'access',v_access
    );
  end if;
  v_authorized_count := greatest(v_requested_count,v_verified_count);
  v_is_addition := v_sequence>v_requested_count;
  if v_sequence>v_authorized_count then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
      'errors',jsonb_build_array(jsonb_build_object('code','UNAUTHORIZED_EXTRA_REGISTRATION','field','parcel_sequence','message','Authorize the merchant-requested additional registration before saving this parcel sequence.')),
      'access',v_access
    );
  end if;

  if v_is_addition
     and not exists (
       select 1 from public.be_audit_events a
       where a.action='DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED'
         and a.resource_type='PICKUP' and a.resource_id=v_pickup_id
         and coalesce(a.details#>>'{after_value,authorized_parcels}','') ~ '^[0-9]+$'
         and (a.details#>>'{after_value,authorized_parcels}')::integer>=v_sequence
     )
     and not exists (
       select 1 from public.be_pickup_parcel_verifications v
       where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
     ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','EXTRA_REGISTRATION_AUDIT_REQUIRED','field','parcel_sequence','message','This additional parcel has no audited Data Entry authorization or Rider verification.')),
      'access',v_access
    );
  end if;

  if (not v_is_addition or v_os_import) and not v_photo_bypass and not exists (
    select 1 from public.be_pickup_parcel_verifications v
    where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
      and upper(coalesce(nullif(v.proof_check_status,''),nullif(v.verification_status,''),nullif(v.status,''),''))
        in ('APPROVED','APPROVED_AFTER_REUPLOAD','PHOTO_APPROVED','VERIFIED','RIDER_VERIFIED')
  ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PARCEL_PHOTO_APPROVAL_REQUIRED','field','parcel_sequence','message','Approve the Rider or Driver parcel photo, or explicitly authorize the traced OS-softcopy evidence option.')),
      'access',v_access
    );
  end if;

  v_payload := v_payload||jsonb_build_object(
    'service_type',v_service_type,
    'source_file_name',case when v_os_import then v_source_file else coalesce(v_source_file,'PORTAL_FINANCIAL_V2_LIVE') end
  );
  v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);

  if coalesce((v_result->>'persisted')::boolean,false) then
    update public.be_data_entry_parcel_details d
    set service_type=v_service_type,
        delivery_region=v_region,
        delivery_route_mode=v_mode,
        location_required=v_map_required,
        handoff_station_code=case when v_station_required then v_station->>'code' else null end,
        handoff_station_name=case when v_station_required then v_station->>'name' else null end,
        source_file_name=case when v_os_import then v_source_file else d.source_file_name end,
        source_row_number=case when v_os_import then v_source_row else d.source_row_number end,
        source_row_count=case when v_os_import then v_source_count else d.source_row_count end,
        photo_evidence_mode=v_photo_mode,
        photo_bypass_reason=case when v_photo_bypass then v_photo_reason else null end,
        os_imported_at=case when v_os_import then now() else d.os_imported_at end,
        os_imported_by=case when v_os_import then v_actor_id else d.os_imported_by end,
        financial_quote=coalesce(d.financial_quote,'{}'::jsonb)||jsonb_build_object(
          'service_type',v_service_type,
          'service_provider_code',v_provider,
          'delivery_region',v_region,
          'delivery_route_mode',v_mode,
          'location_required',v_map_required,
          'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
          'handoff_station_name',case when v_station_required then v_station->>'name' else null end,
          'os_softcopy_import',v_os_import,
          'os_source_file_name',case when v_os_import then v_source_file else null end,
          'source_row_number',case when v_os_import then v_source_row else null end,
          'source_row_count',case when v_os_import then v_source_count else null end,
          'photo_evidence_mode',v_photo_mode,
          'photo_bypass_reason',case when v_photo_bypass then v_photo_reason else null end
        ),
        updated_at=now()
    where d.pickup_id=v_pickup_id and d.parcel_sequence=v_sequence;

    update public.be_waybill_ledger w
    set metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object(
          'service_provider_code',v_provider,'delivery_region',v_region,
          'delivery_route_mode',v_mode,'location_required',v_map_required,
          'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
          'handoff_station_name',case when v_station_required then v_station->>'name' else null end,
          'route_build','V19'
        ),updated_at=now()
    where w.delivery_way_id=v_delivery_way_id;

    update public.be_portal_pickup_requests p
    set registered_parcel_count=(
          select count(*)::integer from public.be_data_entry_parcel_details d where d.pickup_id=v_pickup_id
        ),updated_at=now()
    where p.pickup_id=v_pickup_id;

    insert into public.be_audit_events(
      actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
      upload_code,event_type,entity_type,entity_id,payload
    ) values (
      v_actor_id,v_actor_email,v_actor_role,
      'DATA_ENTRY_DELIVERY_ROUTE_ASSIGNED','DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object(
        'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'service_provider_code',v_provider,
        'delivery_region',v_region,'delivery_route_mode',v_mode,'location_required',v_map_required,
        'handoff_station',case when v_station_required then v_station else null end
      ),
      'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'DATA_ENTRY_DELIVERY_ROUTE_ASSIGNED','DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object('delivery_route',v_route,'location_address',v_location_address)
    );

    if v_os_import then
      insert into public.be_audit_events(
        actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
        upload_code,event_type,entity_type,entity_id,payload
      ) values (
        v_actor_id,v_actor_email,v_actor_role,
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object(
          'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'service_type',v_service_type,
          'source_file_name',v_source_file,'source_row_number',v_source_row,'source_row_count',v_source_count,
          'photo_evidence_mode',v_photo_mode,'location_address',v_location_address,
          'delivery_region',v_region,'delivery_route_mode',v_mode
        ),
        'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object('result',v_result,'access',v_access,'upload_access',v_upload_access)
      );
      if v_photo_bypass then
        insert into public.be_audit_events(
          actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
          upload_code,event_type,entity_type,entity_id,payload
        ) values (
          v_actor_id,v_actor_email,v_actor_role,
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object(
            'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'source_file_name',v_source_file,
            'source_row_number',v_source_row,'reason',v_photo_reason
          ),
          'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object('reason',v_photo_reason,'actor_user_id',v_actor_id)
        );
      end if;
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
    'registration_scope',case when v_is_addition then 'AUTHORIZED_MERCHANT_ADDITION' else 'PICKUP_REQUEST' end,
    'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
    'additional_registration',v_is_addition,'os_softcopy_import',v_os_import,
    'photo_evidence_mode',v_photo_mode,'canonical_way_id',v_delivery_way_id,
    'service_provider_code',v_provider,'delivery_region',v_region,
    'delivery_route_mode',v_mode,'location_required',v_map_required,
    'handoff_station',case when v_station_required then v_station else null end
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_save(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_save(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_save(jsonb) is
  'V19 authoritative regional provider, map-required, terminal-handoff, upload-lineage, photo-evidence, and registration authorization boundary.';

comment on column public.be_data_entry_parcel_details.delivery_route_mode is
  'DOORSTEP_MAP for core regional delivery, ROYAL_EXPRESS for outside-core parcels with item price, or HIGHWAY_BUS_STATION for outside-core parcels without item price.';

do $block$
declare
  v_route jsonb;
begin
  v_route := public.be_data_entry_delivery_route_v19('မြောက်ဒဂုံ',null);
  if v_route->>'provider_code'<>'BRITIUM' or v_route->>'region_code'<>'YANGON' or not (v_route->>'map_required')::boolean then
    raise exception 'V19 Yangon/Britium routing invariant failed: %',v_route;
  end if;
  v_route := public.be_data_entry_delivery_route_v19('ချမ်းအေးသာစံ',null);
  if v_route->>'provider_code'<>'DK DELIVERY' or v_route->>'region_code'<>'MANDALAY' or not (v_route->>'map_required')::boolean then
    raise exception 'V19 Mandalay/DK routing invariant failed: %',v_route;
  end if;
  v_route := public.be_data_entry_delivery_route_v19('ဇမ္ဗူသီရိ',null);
  if v_route->>'provider_code'<>'NPT BRANCH' or v_route->>'region_code'<>'NAYPYITAW' or not (v_route->>'map_required')::boolean then
    raise exception 'V19 Naypyitaw/NPT routing invariant failed: %',v_route;
  end if;
  v_route := public.be_data_entry_delivery_route_v19('တပ်ကုန်း',125000);
  if v_route->>'provider_code'<>'ROYAL EXPRESS' or v_route->>'delivery_mode'<>'ROYAL_EXPRESS' or (v_route->>'map_required')::boolean then
    raise exception 'V19 outside-core item-price routing invariant failed: %',v_route;
  end if;
  v_route := public.be_data_entry_delivery_route_v19('တပ်ကုန်း',null);
  if v_route->>'provider_code'<>'H.TERMINAL DROP-OFF' or v_route->>'delivery_mode'<>'HIGHWAY_BUS_STATION'
     or not (v_route->>'station_required')::boolean or (v_route->>'map_required')::boolean then
    raise exception 'V19 outside-core no-item-price routing invariant failed: %',v_route;
  end if;
  if not (public.be_data_entry_handoff_station_v19('AUNG_MINGALAR',null)->>'valid')::boolean
     or (public.be_data_entry_handoff_station_v19('OTHER','')->>'valid')::boolean then
    raise exception 'V19 highway station validation invariant failed';
  end if;
end
$block$;

notify pgrst, 'reload schema';

commit;
