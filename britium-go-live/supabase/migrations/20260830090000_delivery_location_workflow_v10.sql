create table if not exists public.be_delivery_location_registry (
  delivery_way_id text primary key,
  address_original text not null default '', address_english text not null default '', township text not null default '',
  latitude numeric(11,8), longitude numeric(11,8), provider_label text not null default '',
  match_level text not null default 'UNRESOLVED', confidence numeric(5,4) not null default 0,
  coordinate_source text not null default 'UNRESOLVED', review_status text not null default 'MANUAL_REVIEW',
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint be_delivery_location_lat_ck check (latitude is null or latitude between 9 and 29),
  constraint be_delivery_location_lng_ck check (longitude is null or longitude between 92 and 102),
  constraint be_delivery_location_review_ck check (review_status in ('ACCEPTED','MANUAL_REVIEW'))
);
alter table public.be_delivery_location_registry enable row level security;
revoke all on public.be_delivery_location_registry from public, anon;
grant select, insert, update on public.be_delivery_location_registry to authenticated;
create or replace function private.be_location_editor_allowed_v10()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and upper(coalesce(public.be_current_user_role(),'')) in
    ('APP_OWNER','SUPER_ADMIN','OPERATIONS_ADMIN','DATA_ENTRY','DATA_ENTRY_ADMIN','DES');
$$;
revoke all on function private.be_location_editor_allowed_v10() from public, anon;
drop policy if exists be_delivery_location_read_v10 on public.be_delivery_location_registry;
create policy be_delivery_location_read_v10 on public.be_delivery_location_registry for select to authenticated using (private.be_location_editor_allowed_v10());
drop policy if exists be_delivery_location_insert_v10 on public.be_delivery_location_registry;
create policy be_delivery_location_insert_v10 on public.be_delivery_location_registry for insert to authenticated with check (private.be_location_editor_allowed_v10() and updated_by = auth.uid());
drop policy if exists be_delivery_location_update_v10 on public.be_delivery_location_registry;
create policy be_delivery_location_update_v10 on public.be_delivery_location_registry for update to authenticated using (private.be_location_editor_allowed_v10()) with check (private.be_location_editor_allowed_v10() and updated_by = auth.uid());
create or replace function public.be_delivery_location_get_v10(p_delivery_way_id text)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_row public.be_delivery_location_registry;
begin
  select * into v_row from public.be_delivery_location_registry where delivery_way_id = nullif(trim(p_delivery_way_id),'');
  return jsonb_build_object('ok',true,'location',case when v_row.delivery_way_id is null then null else to_jsonb(v_row) end);
end; $$;
revoke all on function public.be_delivery_location_get_v10(text) from public, anon;
grant execute on function public.be_delivery_location_get_v10(text) to authenticated;
create or replace function public.be_delivery_location_batch_v10(p_delivery_way_ids text[])
returns setof public.be_delivery_location_registry language sql stable security invoker set search_path = public, pg_temp as $$
  select * from public.be_delivery_location_registry where delivery_way_id = any(coalesce(p_delivery_way_ids,array[]::text[]));
$$;
revoke all on function public.be_delivery_location_batch_v10(text[]) from public, anon;
grant execute on function public.be_delivery_location_batch_v10(text[]) to authenticated;
create or replace function public.be_delivery_location_upsert_v10(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id text := nullif(trim(p_payload->>'delivery_way_id'),''); v_lat numeric; v_lng numeric; v_row public.be_delivery_location_registry;
begin
  if v_id is null then raise exception 'Delivery Way ID is required.'; end if;
  v_lat := nullif(p_payload->>'latitude','')::numeric; v_lng := nullif(p_payload->>'longitude','')::numeric;
  if v_lat is null or v_lng is null or v_lat not between 9 and 29 or v_lng not between 92 and 102 or (v_lat=0 and v_lng=0) then raise exception 'A valid Myanmar coordinate is required.'; end if;
  insert into public.be_delivery_location_registry(delivery_way_id,address_original,address_english,township,latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by,updated_at)
  values(v_id,coalesce(p_payload->>'address_original',''),coalesce(p_payload->>'address_english',''),coalesce(p_payload->>'township',''),v_lat,v_lng,coalesce(p_payload->>'provider_label',''),coalesce(p_payload->>'match_level','MANUAL'),coalesce(nullif(p_payload->>'confidence','')::numeric,1),coalesce(p_payload->>'coordinate_source','DATA_ENTRY_MANUAL_COORDINATE'),coalesce(p_payload->>'review_status','ACCEPTED'),auth.uid(),now())
  on conflict(delivery_way_id) do update set address_original=excluded.address_original,address_english=excluded.address_english,township=excluded.township,latitude=excluded.latitude,longitude=excluded.longitude,provider_label=excluded.provider_label,match_level=excluded.match_level,confidence=excluded.confidence,coordinate_source=excluded.coordinate_source,review_status=excluded.review_status,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return jsonb_build_object('ok',true,'location',to_jsonb(v_row));
end; $$;
revoke all on function public.be_delivery_location_upsert_v10(jsonb) from public, anon;
grant execute on function public.be_delivery_location_upsert_v10(jsonb) to authenticated;
comment on table public.be_delivery_location_registry is 'Shared Data Entry and Superadmin delivery-coordinate registry. Exact/POI/street matches are accepted; unresolved addresses remain in manual review.';
