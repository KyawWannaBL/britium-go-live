-- Secure operational master-data tables used by MasterDataPortal.
-- Removes permissive authenticated/anonymous writes and introduces
-- explicit role-based administration.

begin;

create or replace function public.be_operational_master_can_write()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    coalesce(auth.role() = 'service_role', false)
    or coalesce(public.be_current_role(), '') = any(array[
      'super_admin',
      'superadmin',
      'admin',
      'hr',
      'operations_admin',
      'operation_manager',
      'ops_admin',
      'master_data_admin',
      'master_data_manager',
      'master_data'
    ]::text[]);
$$;

revoke all on function public.be_operational_master_can_write()
  from public, anon;

grant execute on function public.be_operational_master_can_write()
  to authenticated, service_role;

-- -------------------------------------------------------------------
-- Remove anonymous access.
-- -------------------------------------------------------------------

revoke all on table public.staff_master from anon;
revoke all on table public.vehicle_master from anon;
revoke all on table public.asset_master from anon;
revoke all on table public.staff_asset_assignments from anon;
revoke all on table public.qr_scan_events from anon;
revoke all on table public.workflow_acknowledgements from anon;

-- Remove excessive capabilities such as truncate, references and trigger.
revoke all on table public.staff_master from authenticated;
revoke all on table public.vehicle_master from authenticated;
revoke all on table public.asset_master from authenticated;
revoke all on table public.staff_asset_assignments from authenticated;
revoke all on table public.qr_scan_events from authenticated;
revoke all on table public.workflow_acknowledgements from authenticated;

grant select, insert, update, delete
  on table public.staff_master
  to authenticated;

grant select, insert, update, delete
  on table public.vehicle_master
  to authenticated;

grant select, insert, update, delete
  on table public.asset_master
  to authenticated;

grant select, insert, update, delete
  on table public.staff_asset_assignments
  to authenticated;

grant select, insert, update, delete
  on table public.qr_scan_events
  to authenticated;

grant select
  on table public.workflow_acknowledgements
  to authenticated;

-- -------------------------------------------------------------------
-- Drop permissive asset policies.
-- -------------------------------------------------------------------

drop policy if exists "asset_master_delete_auth"
  on public.asset_master;
drop policy if exists "asset_master_insert_auth"
  on public.asset_master;
drop policy if exists "asset_master_select_auth"
  on public.asset_master;
drop policy if exists "asset_master_select_authenticated"
  on public.asset_master;
drop policy if exists "asset_master_update_auth"
  on public.asset_master;
drop policy if exists "asset_master_write_ops_admin"
  on public.asset_master;

create policy "asset_master_authenticated_read"
on public.asset_master
for select
to authenticated
using (true);

create policy "asset_master_authorized_write"
on public.asset_master
for all
to authenticated
using (public.be_operational_master_can_write())
with check (public.be_operational_master_can_write());

-- -------------------------------------------------------------------
-- Drop permissive vehicle policies.
-- -------------------------------------------------------------------

drop policy if exists "vehicle_master_delete_auth"
  on public.vehicle_master;
drop policy if exists "vehicle_master_insert_auth"
  on public.vehicle_master;
drop policy if exists "vehicle_master_select_auth"
  on public.vehicle_master;
drop policy if exists "vehicle_master_select_authenticated"
  on public.vehicle_master;
drop policy if exists "vehicle_master_update_auth"
  on public.vehicle_master;
drop policy if exists "vehicle_master_write_ops_admin"
  on public.vehicle_master;

create policy "vehicle_master_authenticated_read"
on public.vehicle_master
for select
to authenticated
using (true);

create policy "vehicle_master_authorized_write"
on public.vehicle_master
for all
to authenticated
using (public.be_operational_master_can_write())
with check (public.be_operational_master_can_write());

-- -------------------------------------------------------------------
-- Drop permissive staff policies.
-- -------------------------------------------------------------------

drop policy if exists "be_patch2c_staff_master_read"
  on public.staff_master;
drop policy if exists "be_patch2c_staff_master_write"
  on public.staff_master;
drop policy if exists "be_staff_admin_write"
  on public.staff_master;
drop policy if exists "be_staff_read"
  on public.staff_master;
drop policy if exists "staff_master_delete_auth"
  on public.staff_master;
drop policy if exists "staff_master_insert_auth"
  on public.staff_master;
drop policy if exists "staff_master_select_auth"
  on public.staff_master;
drop policy if exists "staff_master_select_authenticated"
  on public.staff_master;
drop policy if exists "staff_master_update_auth"
  on public.staff_master;
drop policy if exists "staff_master_write_ops_admin"
  on public.staff_master;

create policy "staff_master_authenticated_read"
on public.staff_master
for select
to authenticated
using (true);

create policy "staff_master_authorized_write"
on public.staff_master
for all
to authenticated
using (public.be_operational_master_can_write())
with check (public.be_operational_master_can_write());

-- -------------------------------------------------------------------
-- Drop permissive assignment policies.
-- -------------------------------------------------------------------

drop policy if exists "staff_asset_assignments_delete_auth"
  on public.staff_asset_assignments;
drop policy if exists "staff_asset_assignments_insert_auth"
  on public.staff_asset_assignments;
drop policy if exists "staff_asset_assignments_select_auth"
  on public.staff_asset_assignments;
drop policy if exists "staff_asset_assignments_select_authenticated"
  on public.staff_asset_assignments;
drop policy if exists "staff_asset_assignments_update_auth"
  on public.staff_asset_assignments;
drop policy if exists "staff_asset_assignments_write_ops_admin"
  on public.staff_asset_assignments;

create policy "staff_asset_assignments_authenticated_read"
on public.staff_asset_assignments
for select
to authenticated
using (true);

create policy "staff_asset_assignments_authorized_write"
on public.staff_asset_assignments
for all
to authenticated
using (public.be_operational_master_can_write())
with check (public.be_operational_master_can_write());

-- -------------------------------------------------------------------
-- QR scans: authenticated users may read.
-- A field worker may insert only as their own staff identity.
-- Only administrators may alter or delete an existing scan.
-- -------------------------------------------------------------------

drop policy if exists "qr_scan_events_delete_auth"
  on public.qr_scan_events;
drop policy if exists "qr_scan_events_insert_auth"
  on public.qr_scan_events;
drop policy if exists "qr_scan_events_insert_authenticated"
  on public.qr_scan_events;
drop policy if exists "qr_scan_events_select_auth"
  on public.qr_scan_events;
drop policy if exists "qr_scan_events_select_authenticated"
  on public.qr_scan_events;
drop policy if exists "qr_scan_events_update_auth"
  on public.qr_scan_events;

create policy "qr_scan_events_authenticated_read"
on public.qr_scan_events
for select
to authenticated
using (true);

create policy "qr_scan_events_owned_insert"
on public.qr_scan_events
for insert
to authenticated
with check (
  public.be_operational_master_can_write()
  or exists (
    select 1
    from public.staff_master staff
    where staff.id = qr_scan_events.actor_staff_id
      and staff.auth_user_id = auth.uid()
      and coalesce(staff.is_active, true)
  )
);

create policy "qr_scan_events_admin_update"
on public.qr_scan_events
for update
to authenticated
using (public.be_operational_master_can_write())
with check (public.be_operational_master_can_write());

create policy "qr_scan_events_admin_delete"
on public.qr_scan_events
for delete
to authenticated
using (public.be_operational_master_can_write());

-- -------------------------------------------------------------------
-- Acknowledgements are updated only through a constrained RPC.
-- -------------------------------------------------------------------

drop policy if exists "workflow_ack_write_authenticated"
  on public.workflow_acknowledgements;
drop policy if exists "workflow_acknowledgements_delete_auth"
  on public.workflow_acknowledgements;
drop policy if exists "workflow_acknowledgements_insert_auth"
  on public.workflow_acknowledgements;
drop policy if exists "workflow_acknowledgements_select_auth"
  on public.workflow_acknowledgements;
drop policy if exists "workflow_acknowledgements_update_auth"
  on public.workflow_acknowledgements;

create policy "workflow_acknowledgements_authenticated_read"
on public.workflow_acknowledgements
for select
to authenticated
using (true);

create or replace function public.be_update_workflow_acknowledgement(
  p_acknowledgement_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_ack public.workflow_acknowledgements;
  v_staff public.staff_master;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if v_status not in ('pending', 'accepted', 'completed', 'rejected') then
    raise exception 'Unsupported acknowledgement status: %', p_status;
  end if;

  select *
  into v_ack
  from public.workflow_acknowledgements
  where id = p_acknowledgement_id
  for update;

  if not found then
    raise exception 'Workflow acknowledgement not found';
  end if;

  select *
  into v_staff
  from public.staff_master
  where id = v_ack.responsible_staff_id;

  if not public.be_operational_master_can_write()
     and (
       v_staff.id is null
       or v_staff.auth_user_id is distinct from auth.uid()
     )
  then
    raise exception using
      errcode = '42501',
      message = 'This acknowledgement is assigned to another staff account';
  end if;

  update public.workflow_acknowledgements
  set status = v_status,
      accepted_at = case
        when v_status = 'accepted'
          then coalesce(accepted_at, now())
        else accepted_at
      end,
      completed_at = case
        when v_status = 'completed'
          then coalesce(completed_at, now())
        else completed_at
      end,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_acknowledgement_id
  returning * into v_ack;

  return jsonb_build_object(
    'ok', true,
    'acknowledgement', to_jsonb(v_ack)
  );
end;
$$;

revoke all on function public.be_update_workflow_acknowledgement(
  uuid, text, text
) from public, anon;

grant execute on function public.be_update_workflow_acknowledgement(
  uuid, text, text
) to authenticated, service_role;

commit;
