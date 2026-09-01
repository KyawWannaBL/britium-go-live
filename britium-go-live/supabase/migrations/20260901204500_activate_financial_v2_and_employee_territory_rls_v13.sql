-- Financial V2 live save + role/responsibility/territory enforcement.
-- Replaces legacy `authenticated USING (true)` policies on the operational chain.

create table if not exists public.be_employee_territory_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null check (scope_type in ('GLOBAL','BRANCH','TOWNSHIP')),
  branch_id uuid,
  branch_code text,
  township_key text,
  can_read boolean not null default true,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id,scope_type,branch_id,branch_code,township_key)
);

alter table public.be_employee_territory_assignments enable row level security;
revoke all on public.be_employee_territory_assignments from anon;
grant select on public.be_employee_territory_assignments to authenticated;

create index if not exists be_employee_territory_user_active_idx
  on public.be_employee_territory_assignments(user_id,active);
create index if not exists be_employee_territory_branch_idx
  on public.be_employee_territory_assignments(branch_id,lower(branch_code)) where active;
create index if not exists be_employee_territory_township_idx
  on public.be_employee_territory_assignments(lower(township_key)) where active;

create or replace function public.be_normalize_territory_key(p_value text)
returns text language sql immutable parallel safe
set search_path = pg_catalog
as $$ select regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9\u1000-\u109f]+', '', 'g') $$;

create or replace function public.be_employee_can_access_territory(
  p_branch_id uuid,
  p_branch_code text,
  p_township text,
  p_action text default 'read'
) returns boolean
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(replace(coalesce(public.be_current_role(),public.be_current_user_role(),''),'-','_'));
  v_allowed boolean := false;
begin
  if v_uid is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  if p_action='read' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','warehouse','data_entry','customer_service','finance','finance_user','analyst','driver','rider');
  elsif p_action='create' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','data_entry');
  elsif p_action='update' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','warehouse','data_entry','customer_service','driver','rider');
  elsif p_action='delete' then
    v_allowed := v_role in ('admin','operations_admin');
  end if;
  if not v_allowed then return false; end if;

  return exists (
    select 1 from public.be_employee_territory_assignments a
    where a.user_id=v_uid and a.active
      and case p_action when 'create' then a.can_create when 'update' then a.can_update when 'delete' then a.can_delete else a.can_read end
      and (
        a.scope_type='GLOBAL'
        or (a.scope_type='BRANCH' and (
          (p_branch_id is not null and a.branch_id=p_branch_id)
          or (nullif(btrim(p_branch_code),'') is not null and lower(btrim(a.branch_code))=lower(btrim(p_branch_code)))
        ))
        or (a.scope_type='TOWNSHIP' and public.be_normalize_territory_key(a.township_key)=public.be_normalize_territory_key(p_township))
      )
  );
end $$;

revoke all on function public.be_employee_can_access_territory(uuid,text,text,text) from public,anon;
grant execute on function public.be_employee_can_access_territory(uuid,text,text,text) to authenticated;

drop policy if exists "employee territory assignments own read" on public.be_employee_territory_assignments;
create policy "employee territory assignments own read"
on public.be_employee_territory_assignments for select to authenticated
using ((select auth.uid())=user_id or lower(replace(coalesce(public.be_current_role(),''),'-','_')) in ('super_admin','superadmin','app_owner','sys'));

insert into public.be_employee_territory_assignments(user_id,scope_type,branch_id,can_read,can_create,can_update)
select p.id,'BRANCH',p.branch_id,true,
  lower(replace(p.role::text,'-','_')) in ('admin','super_admin','superadmin','operations_admin','operations','supervisor','data_entry'),
  lower(replace(p.role::text,'-','_')) in ('admin','super_admin','superadmin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','data_entry','customer_service','driver','rider')
from public.user_profiles p
where p.is_active and p.branch_id is not null
on conflict (user_id,scope_type,branch_id,branch_code,township_key) do update
set can_read=excluded.can_read,can_create=excluded.can_create,can_update=excluded.can_update,active=true,updated_at=now();

insert into public.be_employee_territory_assignments(user_id,scope_type,branch_code,can_read,can_create,can_update)
select u.id,'BRANCH',p.branch_code,true,
  lower(replace(coalesce(p.role_key,''),'-','_')) in ('admin','super_admin','superadmin','operations_admin','operations','supervisor','data_entry'),
  lower(replace(coalesce(p.role_key,''),'-','_')) in ('admin','super_admin','superadmin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','data_entry','customer_service','driver','rider')
from public.be_user_profiles p join auth.users u on lower(u.email)=lower(p.auth_email)
where lower(coalesce(p.employee_status,'active'))='active' and nullif(btrim(p.branch_code),'') is not null
on conflict (user_id,scope_type,branch_id,branch_code,township_key) do update
set can_read=excluded.can_read,can_create=excluded.can_create,can_update=excluded.can_update,active=true,updated_at=now();

do $$
declare r record;
begin
  for r in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('delivery_waybills','parcels','be_portal_pickup_requests','be_data_entry_parcel_details','be_data_entry_register_rows')
    and (qual='true' or with_check='true' or policyname in ('parcels_all_auth','delivery_waybills_all_auth','delivery_waybills_read_all','delivery_waybills_write_all'))
  loop execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename); end loop;
end $$;

alter table public.delivery_waybills enable row level security;
create policy delivery_waybills_territory_select on public.delivery_waybills for select to authenticated using (
  (select public.be_employee_can_access_territory(null,
    coalesce((select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=delivery_waybills.pickup_id limit 1),payload->>'branch_code'),
    coalesce(recipient_township,receiver_township,township),'read'))
);
create policy delivery_waybills_territory_insert on public.delivery_waybills for insert to authenticated with check (
  (select public.be_employee_can_access_territory(null,
    coalesce((select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=delivery_waybills.pickup_id limit 1),payload->>'branch_code'),
    coalesce(recipient_township,receiver_township,township),'create'))
);
create policy delivery_waybills_territory_update on public.delivery_waybills for update to authenticated using (
  (select public.be_employee_can_access_territory(null,
    coalesce((select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=delivery_waybills.pickup_id limit 1),payload->>'branch_code'),
    coalesce(recipient_township,receiver_township,township),'update'))
) with check (
  (select public.be_employee_can_access_territory(null,
    coalesce((select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=delivery_waybills.pickup_id limit 1),payload->>'branch_code'),
    coalesce(recipient_township,receiver_township,township),'update'))
);

alter table public.parcels enable row level security;
create policy parcels_employee_territory_select on public.parcels for select to authenticated using (
  (select public.be_employee_can_access_territory(branch_id,null,coalesce(recipient_township,township),'read'))
);
create policy parcels_employee_territory_insert on public.parcels for insert to authenticated with check (
  (select public.be_employee_can_access_territory(branch_id,null,coalesce(recipient_township,township),'create'))
);
create policy parcels_employee_territory_update on public.parcels for update to authenticated using (
  (select public.be_employee_can_access_territory(branch_id,null,coalesce(recipient_township,township),'update'))
) with check (
  (select public.be_employee_can_access_territory(branch_id,null,coalesce(recipient_township,township),'update'))
);

alter table public.be_portal_pickup_requests enable row level security;
create policy pickup_requests_employee_territory_select on public.be_portal_pickup_requests for select to authenticated using (
  (select public.be_employee_can_access_territory(null,branch_code,coalesce(delivery_township,pickup_township),'read')) or created_by=(select auth.uid())
);
create policy pickup_requests_employee_territory_insert on public.be_portal_pickup_requests for insert to authenticated with check (
  (select public.be_employee_can_access_territory(null,branch_code,coalesce(delivery_township,pickup_township),'create')) or created_by=(select auth.uid())
);
create policy pickup_requests_employee_territory_update on public.be_portal_pickup_requests for update to authenticated using (
  (select public.be_employee_can_access_territory(null,branch_code,coalesce(delivery_township,pickup_township),'update'))
) with check (
  (select public.be_employee_can_access_territory(null,branch_code,coalesce(delivery_township,pickup_township),'update'))
);

alter table public.be_data_entry_parcel_details enable row level security;
create policy data_entry_details_territory_select on public.be_data_entry_parcel_details for select to authenticated using (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_parcel_details.pickup_id limit 1),township,'read'))
);
create policy data_entry_details_territory_insert on public.be_data_entry_parcel_details for insert to authenticated with check (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_parcel_details.pickup_id limit 1),township,'create'))
);
create policy data_entry_details_territory_update on public.be_data_entry_parcel_details for update to authenticated using (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_parcel_details.pickup_id limit 1),township,'update'))
) with check (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_parcel_details.pickup_id limit 1),township,'update'))
);

alter table public.be_data_entry_register_rows enable row level security;
create policy data_entry_register_territory_select on public.be_data_entry_register_rows for select to authenticated using (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_register_rows.pickup_way_id limit 1),recipient_township,'read'))
);
create policy data_entry_register_territory_insert on public.be_data_entry_register_rows for insert to authenticated with check (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_register_rows.pickup_way_id limit 1),recipient_township,'create'))
);
create policy data_entry_register_territory_update on public.be_data_entry_register_rows for update to authenticated using (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_register_rows.pickup_way_id limit 1),recipient_township,'update'))
) with check (
  (select public.be_employee_can_access_territory(null,(select p.branch_code from public.be_portal_pickup_requests p where p.pickup_id=be_data_entry_register_rows.pickup_way_id limit 1),recipient_township,'update'))
);

-- Explicit activation: the UI now saves every verified parcel before creating a waybill.
update public.be_data_entry_financial_v2_runtime_v58
set mutation_mode='ACTIVE', updated_at=now(), updated_by=auth.uid(),
    change_reason='Approved go-live: verified Data Entry save and Waybill Studio wiring v13'
where singleton;
