-- V150: Warehouse -> Wayplan handoff lifecycle with 7-day archive.
-- Active Warehouse buttons become a persistent audit handoff once the D-series Way
-- becomes visible in Wayplan Command.

create table if not exists public.be_warehouse_wayplan_handoffs_v150 (
  delivery_way_id text primary key,
  pickup_id text,
  ready_at timestamptz not null default now(),
  ready_by text,
  visible_in_wayplan_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now(),
  constraint be_warehouse_wayplan_handoff_delivery_id_chk
    check (delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$')
);

alter table public.be_warehouse_wayplan_handoffs_v150 enable row level security;
revoke all on table public.be_warehouse_wayplan_handoffs_v150 from public, anon, authenticated;
grant all on table public.be_warehouse_wayplan_handoffs_v150 to service_role;

create or replace function public.be_warehouse_mark_delivery_ready_v150(
  p_delivery_way_id text,
  p_staging_zone text default 'READY_FOR_DISPATCH',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_result jsonb;
  v_way text:=upper(btrim(coalesce(p_delivery_way_id,'')));
  v_pickup text;
  v_actor text:=public.be_warehouse_actor_email();
begin
  perform public.be_warehouse_assert_internal();
  delete from public.be_warehouse_wayplan_handoffs_v150 where expires_at < now();

  v_result:=public.be_warehouse_mark_delivery_ready_v149(v_way,p_staging_zone,p_actor_email);
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  select pickup_id into v_pickup
  from public.be_warehouse_receipts_v36
  where upper(delivery_way_id)=v_way
  limit 1;

  insert into public.be_warehouse_wayplan_handoffs_v150(
    delivery_way_id,pickup_id,ready_at,ready_by,visible_in_wayplan_at,expires_at,updated_at
  ) values (
    v_way,v_pickup,now(),v_actor,null,now()+interval '7 days',now()
  )
  on conflict(delivery_way_id) do update set
    pickup_id=excluded.pickup_id,
    ready_at=excluded.ready_at,
    ready_by=excluded.ready_by,
    visible_in_wayplan_at=null,
    expires_at=excluded.expires_at,
    updated_at=now();

  return v_result||jsonb_build_object(
    'handoff_recorded',true,
    'handoff_expires_at',now()+interval '7 days',
    'build','WAREHOUSE_WAYPLAN_HANDOFF_V150'
  );
end
$function$;

create or replace function public.be_warehouse_ack_wayplan_handoff_v150(p_delivery_way_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=lower(public.be_current_user_role());
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if v_role not in ('warehouse','supervisor','admin','superadmin','super_admin','dispatch','wayplan_operator','operations','operations_admin','operations-admin','management','director') then
    raise exception 'Wayplan permission is required';
  end if;
  if p_delivery_way_ids is null or jsonb_typeof(p_delivery_way_ids)<>'array' then
    raise exception 'Delivery Way ID array is required';
  end if;

  delete from public.be_warehouse_wayplan_handoffs_v150 where expires_at < now();

  update public.be_warehouse_wayplan_handoffs_v150 h
  set visible_in_wayplan_at=coalesce(h.visible_in_wayplan_at,now()),updated_at=now()
  where h.expires_at>=now()
    and h.delivery_way_id in (
      select upper(btrim(value))
      from jsonb_array_elements_text(p_delivery_way_ids)
      where upper(btrim(value)) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$'
    );
  get diagnostics v_count=row_count;

  return jsonb_build_object('ok',true,'acknowledged',v_count,'build','WAREHOUSE_WAYPLAN_HANDOFF_V150');
end
$function$;

create or replace function public.be_warehouse_wayplan_handoff_archive_v150()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text:=public.be_warehouse_assert_internal();
  v_rows jsonb;
begin
  delete from public.be_warehouse_wayplan_handoffs_v150 where expires_at < now();

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visible_in_wayplan_at desc),'[]'::jsonb)
  into v_rows
  from (
    select delivery_way_id,pickup_id,ready_at,ready_by,visible_in_wayplan_at,expires_at
    from public.be_warehouse_wayplan_handoffs_v150
    where visible_in_wayplan_at is not null and expires_at>=now()
    order by visible_in_wayplan_at desc
    limit 1000
  ) x;

  return jsonb_build_object(
    'ok',true,
    'rows',v_rows,
    'count',jsonb_array_length(v_rows),
    'retention_days',7,
    'authorized_role',v_role,
    'build','WAREHOUSE_WAYPLAN_HANDOFF_V150'
  );
end
$function$;

revoke execute on function public.be_warehouse_mark_delivery_ready_v150(text,text,text) from public, anon;
revoke execute on function public.be_warehouse_ack_wayplan_handoff_v150(jsonb) from public, anon;
revoke execute on function public.be_warehouse_wayplan_handoff_archive_v150() from public, anon;
grant execute on function public.be_warehouse_mark_delivery_ready_v150(text,text,text) to authenticated, service_role;
grant execute on function public.be_warehouse_ack_wayplan_handoff_v150(jsonb) to authenticated, service_role;
grant execute on function public.be_warehouse_wayplan_handoff_archive_v150() to authenticated, service_role;

comment on table public.be_warehouse_wayplan_handoffs_v150
is 'V150: 7-day Warehouse to Wayplan handoff archive keyed by canonical D-series Delivery Way ID.';
