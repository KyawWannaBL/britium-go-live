
create or replace function public.be_pickup_assignment_status_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new jsonb;
  v_status text;
  v_stage text;
  v_app_stage text;
  v_rider_status text;
  v_has_rider boolean;
begin
  v_new := to_jsonb(new);

  v_status := upper(coalesce(
    v_new->>'pickup_status',
    v_new->>'workflow_stage',
    v_new->>'status',
    ''
  ));
  v_stage := upper(coalesce(v_new->>'workflow_stage', ''));
  v_app_stage := upper(coalesce(v_new->>'rider_app_stage', ''));
  v_rider_status := upper(coalesce(v_new->>'rider_status', ''));

  /*
    Never apply assignment defaults after operational pickup execution begins.
    This preserves the canonical progression accepted -> arrived -> verified
    -> collected -> warehouse handoff.
  */
  if v_status in (
      'ACCEPTED_BY_RIDER',
      'ACCEPTED',
      'RIDER_ACCEPTED',
      'RIDER_AT_PICKUP',
      'FIELD_TEAM_AT_PICKUP',
      'ARRIVED_AT_PICKUP',
      'PICKUP_VERIFICATION_IN_PROGRESS',
      'PICKUP_VERIFIED',
      'PICKUP_COLLECTED',
      'DELIVERED_TO_WAREHOUSE',
      'DATA_ENTRY_REGISTERED',
      'WAREHOUSE_RECEIVED',
      'RECEIVED_AT_ORIGIN',
      'SORTING',
      'READY_FOR_DISPATCH',
      'IN_TRANSIT_TO_HUB',
      'RECEIVED_AT_DESTINATION',
      'READY_FOR_DELIVERY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'EXCEPTION'
    )
    or v_stage in (
      'ACCEPTED_PICKUP',
      'RIDER_ACCEPTED',
      'RIDER_AT_PICKUP',
      'FIELD_TEAM_AT_PICKUP',
      'ARRIVED_AT_PICKUP',
      'PICKUP_VERIFICATION_IN_PROGRESS',
      'PICKUP_VERIFIED',
      'PICKUP_COLLECTED',
      'TO_WAREHOUSE',
      'DELIVERED_TO_WAREHOUSE',
      'DATA_ENTRY_REGISTERED',
      'WAITING_WAREHOUSE_RECEIVE',
      'WAREHOUSE_RECEIVED',
      'SORTING',
      'READY_FOR_DISPATCH'
    )
    or v_app_stage in (
      'ACCEPTED_PICKUP',
      'STARTED_PICKUP_TRIP',
      'ARRIVED_PICKUP',
      'VERIFY_PICKUP',
      'VERIFIED_PICKUP',
      'COLLECTED_PICKUP',
      'WAREHOUSE_HANDOFF'
    )
    or v_rider_status in (
      'ACCEPTED',
      'ARRIVED',
      'VERIFIED',
      'COLLECTED',
      'TO_WAREHOUSE',
      'WAREHOUSE_ACCEPTED',
      'PICKUP_VERIFIED',
      'PICKUP_COLLECTED',
      'EXCEPTION'
    )
  then
    return new;
  end if;

  v_has_rider :=
       nullif(v_new->>'assigned_rider_email','') is not null
    or nullif(v_new->>'assigned_rider_code','') is not null
    or nullif(v_new->>'assigned_rider_id','') is not null
    or nullif(v_new->>'assigned_workforce_code','') is not null
    or nullif(v_new->>'rider_code','') is not null
    or nullif(v_new->>'rider_id','') is not null;

  if v_has_rider then
    new := jsonb_populate_record(
      new,
      jsonb_strip_nulls(
        jsonb_build_object(
          'pickup_status', 'RIDER_ASSIGNED',
          'status', 'ASSIGNED',
          'workflow_stage', 'RIDER_APP_QUEUE',
          'rider_app_stage', 'ASSIGNED_PICKUP',
          'supervisor_status', 'ASSIGNED',
          'rider_status', 'WAITING_ACCEPTANCE',
          'assignment_status', 'ASSIGNED',
          'wayplan_status', coalesce(nullif(v_new->>'wayplan_status',''), 'PENDING_WAYPLAN'),
          'assigned_at', coalesce(nullif(v_new->>'assigned_at','')::timestamptz, now()),
          'updated_at', now()
        )
      )
    );
  end if;

  return new;
exception when others then
  raise notice 'be_pickup_assignment_status_guard skipped: %', sqlerrm;
  return new;
end;
$function$;
;
