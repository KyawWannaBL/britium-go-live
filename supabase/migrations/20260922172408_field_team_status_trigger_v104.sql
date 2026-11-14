-- V104: preserve progressed field-team states and compute team readiness from effective progress.

create or replace function public.be_sync_field_team_status_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $v104$
declare
  v_rider text;
  v_driver text;
  v_helper text;
  v_rider_ready boolean;
  v_driver_ready boolean;
  v_helper_ready boolean;
  v_any_assigned boolean;
begin
  if tg_op = 'INSERT' then
    new.rider_status := case
      when coalesce(nullif(trim(new.assigned_rider_code), ''), nullif(trim(new.assigned_rider_email), '')) is null then 'NOT_ASSIGNED'
      else coalesce(nullif(public.be_normalize_assignment_response_status(new.rider_status), ''), 'WAITING_ACCEPTANCE')
    end;
    new.driver_status := case
      when coalesce(nullif(trim(new.assigned_driver_code), ''), nullif(trim(new.assigned_driver_email), '')) is null then 'NOT_ASSIGNED'
      else coalesce(nullif(public.be_normalize_assignment_response_status(new.driver_status), ''), 'WAITING_ACCEPTANCE')
    end;
    new.helper_status := case
      when coalesce(nullif(trim(new.assigned_helper_code), ''), nullif(trim(new.assigned_helper_email), '')) is null then 'NOT_ASSIGNED'
      else coalesce(nullif(public.be_normalize_assignment_response_status(new.helper_status), ''), 'WAITING_ACCEPTANCE')
    end;
  else
    if new.assigned_rider_code is distinct from old.assigned_rider_code
       or new.assigned_rider_email is distinct from old.assigned_rider_email then
      new.rider_status := case
        when coalesce(nullif(trim(new.assigned_rider_code), ''), nullif(trim(new.assigned_rider_email), '')) is null then 'NOT_ASSIGNED'
        else 'WAITING_ACCEPTANCE'
      end;
      new.rider_accepted_at := null;
      new.rider_rejected_at := null;
      new.rider_response_note := null;
    end if;

    if new.assigned_driver_code is distinct from old.assigned_driver_code
       or new.assigned_driver_email is distinct from old.assigned_driver_email then
      new.driver_status := case
        when coalesce(nullif(trim(new.assigned_driver_code), ''), nullif(trim(new.assigned_driver_email), '')) is null then 'NOT_ASSIGNED'
        else 'WAITING_ACCEPTANCE'
      end;
      new.driver_accepted_at := null;
      new.driver_rejected_at := null;
      new.driver_response_note := null;
    end if;

    if new.assigned_helper_code is distinct from old.assigned_helper_code
       or new.assigned_helper_email is distinct from old.assigned_helper_email then
      new.helper_status := case
        when coalesce(nullif(trim(new.assigned_helper_code), ''), nullif(trim(new.assigned_helper_email), '')) is null then 'NOT_ASSIGNED'
        else 'WAITING_ACCEPTANCE'
      end;
      new.helper_accepted_at := null;
      new.helper_rejected_at := null;
      new.helper_response_note := null;
    end if;
  end if;

  v_rider := case
    when coalesce(nullif(trim(new.assigned_rider_code), ''), nullif(trim(new.assigned_rider_email), '')) is null then 'NOT_ASSIGNED'
    else public.be_normalize_assignment_response_status(new.rider_status)
  end;
  v_driver := case
    when coalesce(nullif(trim(new.assigned_driver_code), ''), nullif(trim(new.assigned_driver_email), '')) is null then 'NOT_ASSIGNED'
    else public.be_normalize_assignment_response_status(new.driver_status)
  end;
  v_helper := case
    when coalesce(nullif(trim(new.assigned_helper_code), ''), nullif(trim(new.assigned_helper_email), '')) is null then 'NOT_ASSIGNED'
    else public.be_normalize_assignment_response_status(new.helper_status)
  end;

  new.rider_status := v_rider;
  new.driver_status := v_driver;
  new.helper_status := v_helper;

  v_rider_ready := v_rider='NOT_ASSIGNED' or public.be_field_assignment_progressed_v103(v_rider);
  v_driver_ready := v_driver='NOT_ASSIGNED' or public.be_field_assignment_progressed_v103(v_driver);
  v_helper_ready := v_helper='NOT_ASSIGNED' or public.be_field_assignment_progressed_v103(v_helper);
  v_any_assigned := v_rider<>'NOT_ASSIGNED' or v_driver<>'NOT_ASSIGNED' or v_helper<>'NOT_ASSIGNED';

  if v_rider='REJECTED' or v_driver='REJECTED' or v_helper='REJECTED' then
    new.team_acceptance_status := 'NEEDS_REASSIGNMENT';
  elsif v_rider_ready and v_driver_ready and v_helper_ready and v_any_assigned then
    new.team_acceptance_status := 'TEAM_READY';
  elsif not v_any_assigned then
    new.team_acceptance_status := 'NOT_ASSIGNED';
  else
    new.team_acceptance_status := 'WAITING_TEAM_ACCEPTANCE';
  end if;

  new.updated_at := now();
  return new;
end;
$v104$;

update public.be_portal_pickup_requests p
set team_acceptance_status = case
  when upper(coalesce(p.rider_status,''))='REJECTED'
    or upper(coalesce(p.driver_status,''))='REJECTED'
    or upper(coalesce(p.helper_status,''))='REJECTED'
    then 'NEEDS_REASSIGNMENT'
  when (
    (
      coalesce(nullif(trim(p.assigned_rider_code), ''), nullif(trim(p.assigned_rider_email), '')) is null
      or public.be_field_assignment_progressed_v103(p.rider_status)
    )
    and (
      coalesce(nullif(trim(p.assigned_driver_code), ''), nullif(trim(p.assigned_driver_email), '')) is null
      or public.be_field_assignment_progressed_v103(p.driver_status)
    )
    and (
      coalesce(nullif(trim(p.assigned_helper_code), ''), nullif(trim(p.assigned_helper_email), '')) is null
      or public.be_field_assignment_progressed_v103(p.helper_status)
    )
    and (
      coalesce(nullif(trim(p.assigned_rider_code), ''), nullif(trim(p.assigned_rider_email), '')) is not null
      or coalesce(nullif(trim(p.assigned_driver_code), ''), nullif(trim(p.assigned_driver_email), '')) is not null
      or coalesce(nullif(trim(p.assigned_helper_code), ''), nullif(trim(p.assigned_helper_email), '')) is not null
    )
  ) then 'TEAM_READY'
  when coalesce(nullif(trim(p.assigned_rider_code), ''), nullif(trim(p.assigned_rider_email), '')) is null
   and coalesce(nullif(trim(p.assigned_driver_code), ''), nullif(trim(p.assigned_driver_email), '')) is null
   and coalesce(nullif(trim(p.assigned_helper_code), ''), nullif(trim(p.assigned_helper_email), '')) is null
    then 'NOT_ASSIGNED'
  else 'WAITING_TEAM_ACCEPTANCE'
end,
updated_at=now()
where upper(coalesce(p.status,'')) not in ('CANCELLED','ARCHIVED_TEST_DATA','COMPLETED','CLOSED');
