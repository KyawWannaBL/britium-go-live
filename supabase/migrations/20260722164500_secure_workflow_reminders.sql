-- Secure workflow acknowledgement reminder increments.

begin;

create or replace function public.be_bump_workflow_acknowledgement_reminder(
  p_acknowledgement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_ack public.workflow_acknowledgements;
  v_staff public.staff_master;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
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
  set reminder_count = coalesce(reminder_count, 0) + 1,
      updated_at = now()
  where id = p_acknowledgement_id
  returning * into v_ack;

  return jsonb_build_object(
    'ok', true,
    'acknowledgement', to_jsonb(v_ack)
  );
end;
$$;

revoke all on function public.be_bump_workflow_acknowledgement_reminder(uuid)
  from public, anon;

grant execute on function public.be_bump_workflow_acknowledgement_reminder(uuid)
  to authenticated, service_role;

commit;
