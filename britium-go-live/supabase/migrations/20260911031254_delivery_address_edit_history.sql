create table public.be_delivery_address_history (
  id bigint generated always as identity primary key,
  delivery_way_id text not null,
  source_table text not null,
  action text not null check (action in ('INSERT','UPDATE')),
  actor_id uuid,
  actor_email text,
  changed_at timestamptz not null default clock_timestamp(),
  before_values jsonb not null,
  after_values jsonb not null
);
create index be_delivery_address_history_way_time on public.be_delivery_address_history(delivery_way_id,changed_at desc,id desc);
alter table public.be_delivery_address_history enable row level security;
revoke all on public.be_delivery_address_history from public,anon,authenticated;
grant select on public.be_delivery_address_history to authenticated;
create policy address_history_read on public.be_delivery_address_history for select to authenticated
  using (auth.uid() is not null and private.be_location_editor_allowed_v10());

create or replace function private.be_capture_delivery_address_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_before jsonb;
  v_after jsonb;
  v_way text;
  v_actor uuid := auth.uid();
  v_email text;
  v_keys text[] := array['recipient_name','contact_no_1','contact_no_2','recipient_address','address_original','address_english','township','city','region_state','postal_code','latitude','longitude'];
begin
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_before from jsonb_each(v_old) where key=any(v_keys);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_after from jsonb_each(v_new) where key=any(v_keys);
  if v_before is not distinct from v_after then return new; end if;
  v_way := coalesce(nullif(v_new->>'delivery_way_id',''),(v_new->>'pickup_id')||'-'||lpad(v_new->>'parcel_sequence',3,'0'));
  if v_way is null then return new; end if;
  -- Actor identity comes from the authenticated session, never the submitted payload.
  if v_actor is not null then select email into v_email from auth.users where id=v_actor; end if;
  insert into public.be_delivery_address_history(delivery_way_id,source_table,action,actor_id,actor_email,before_values,after_values)
    values(v_way,tg_table_name,tg_op,v_actor,v_email,v_before,v_after);
  return new;
end;
$$;
revoke all on function private.be_capture_delivery_address_history() from public,anon,authenticated;
create trigger delivery_location_address_history after insert or update on public.be_delivery_location_registry
for each row execute function private.be_capture_delivery_address_history();
create trigger parcel_detail_address_history after insert or update on public.be_data_entry_parcel_details
for each row execute function private.be_capture_delivery_address_history();
