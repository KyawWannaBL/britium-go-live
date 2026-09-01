-- Reconcile territory assignments with the authoritative employee account registry.
-- Also removes legacy authenticated-wide policies missed by the v13 migration.

insert into public.be_employee_territory_assignments (
  user_id, scope_type, branch_code, can_read, can_create, can_update, can_delete, active
)
select
  r.auth_user_id,
  'BRANCH',
  upper(btrim(r.branch_code)),
  true,
  lower(replace(coalesce(r.role,''),'-','_')) in
    ('admin','super_admin','superadmin','operations_admin','operations','supervisor','data_entry','branch_office'),
  lower(replace(coalesce(r.role,''),'-','_')) in
    ('admin','super_admin','superadmin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','warehouse','data_entry','customer_service','driver','rider','branch_office'),
  lower(replace(coalesce(r.role,''),'-','_')) in
    ('admin','super_admin','superadmin','operations_admin'),
  true
from public.be_user_account_registry r
where r.active
  and r.auth_user_id is not null
  and exists (select 1 from auth.users u where u.id=r.auth_user_id)
  and nullif(btrim(r.branch_code),'') is not null
on conflict (user_id,scope_type,branch_id,branch_code,township_key) do update
set can_read=excluded.can_read,
    can_create=excluded.can_create,
    can_update=excluded.can_update,
    can_delete=excluded.can_delete,
    active=true,
    updated_at=now();

create or replace function public.be_employee_can_access_territory(
  p_branch_id uuid,
  p_branch_code text,
  p_township text,
  p_action text default 'read'
) returns boolean
language plpgsql stable security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(replace(coalesce(public.be_current_user_role(),public.be_current_role(),''),'-','_'));
  v_allowed boolean := false;
begin
  if v_uid is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  if p_action='read' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','warehouse','data_entry','customer_service','finance','finance_user','analyst','driver','rider','branch_office');
  elsif p_action='create' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','data_entry','branch_office');
  elsif p_action='update' then
    v_allowed := v_role in ('admin','operations_admin','operations','supervisor','wayplan_manager','warehouse_staff','warehouse','data_entry','customer_service','driver','rider','branch_office');
  elsif p_action='delete' then
    v_allowed := v_role in ('admin','operations_admin');
  end if;
  if not v_allowed then return false; end if;

  return exists (
    select 1
    from public.be_employee_territory_assignments a
    where a.user_id=v_uid
      and a.active
      and case p_action
        when 'create' then a.can_create
        when 'update' then a.can_update
        when 'delete' then a.can_delete
        else a.can_read
      end
      and (
        a.scope_type='GLOBAL'
        or (a.scope_type='BRANCH' and (
          (p_branch_id is not null and a.branch_id=p_branch_id)
          or (nullif(btrim(p_branch_code),'') is not null
              and lower(btrim(a.branch_code))=lower(btrim(p_branch_code)))
        ))
        or (a.scope_type='TOWNSHIP'
            and public.be_normalize_territory_key(a.township_key)=public.be_normalize_territory_key(p_township))
      )
  );
end $$;

drop policy if exists be_de_parcel_details_auth_insert_v56_2 on public.be_data_entry_parcel_details;
drop policy if exists be_de_parcel_details_auth_select_v56_2 on public.be_data_entry_parcel_details;
drop policy if exists be_de_parcel_details_auth_update_v56_2 on public.be_data_entry_parcel_details;
drop policy if exists be_de_register_rows_auth_insert_v56_2 on public.be_data_entry_register_rows;
drop policy if exists be_de_register_rows_auth_select_v56_2 on public.be_data_entry_register_rows;
drop policy if exists be_de_register_rows_auth_update_v56_2 on public.be_data_entry_register_rows;
drop policy if exists "Supervisors see branch pickups" on public.be_portal_pickup_requests;
