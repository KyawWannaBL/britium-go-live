-- Pickup commission policy v188
-- Rider: 150 MMK/parcel, cap 7,500 MMK.
-- Driver: 75 MMK/parcel, cap 3,750 MMK.
-- Helper: 75 MMK/parcel, cap 3,750 MMK.
-- Driver + Helper share the 7,500 MMK team cap equally.
-- Rider can independently earn the full 7,500 MMK cap.

create or replace function public.be_commission_calculate_v2(
  p_operation_type text,
  p_role_code text,
  p_unit_count numeric,
  p_work_date date default current_date
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_op text := upper(btrim(coalesce(p_operation_type,'')));
  v_role text := upper(btrim(coalesce(p_role_code,'')));
  v_units numeric := greatest(coalesce(p_unit_count,0),0);
  v_rate numeric;
  v_raw numeric;
  v_amount numeric;
  v_cap numeric := null;
begin
  v_rate := public.be_commission_get_rate(v_op,v_role,'PARCEL',coalesce(p_work_date,current_date));
  v_raw := v_rate * v_units;

  if v_op = 'PICKUP' then
    if v_role = 'RIDER' then
      v_cap := 7500;
      v_amount := least(v_raw,v_cap);
    elsif v_role in ('DRIVER','HELPER') then
      v_cap := 3750;
      v_amount := least(v_raw,v_cap);
    else
      v_amount := v_raw;
    end if;
  else
    v_amount := v_raw;
  end if;

  return jsonb_build_object(
    'operation_type',v_op,
    'role_code',v_role,
    'unit_count',v_units,
    'rate_mmk',v_rate,
    'raw_amount_mmk',v_raw,
    'cap_mmk',v_cap,
    'commission_mmk',v_amount,
    'pickup_team_cap_mmk',case when v_op='PICKUP' and v_role in ('RIDER','DRIVER','HELPER') then 7500 else null end,
    'pickup_share_rule',case
      when v_op='PICKUP' and v_role='RIDER' then 'RIDER_FULL_CAP'
      when v_op='PICKUP' and v_role in ('DRIVER','HELPER') then 'DRIVER_HELPER_CAP_SPLIT_HALF_EACH'
      else null end,
    'policy_version','COMMISSION_2026_10_03_PICKUP_CAP_7500'
  );
end;
$function$;

create or replace function public.be_commission_events_apply_pickup_cap_v1()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := upper(btrim(coalesce(new.role_code,'')));
  v_cap numeric := null;
  v_raw numeric := greatest(coalesce(new.rate_mmk,0),0) * greatest(coalesce(new.unit_count,0),0);
begin
  if upper(btrim(coalesce(new.operation_type,'')))='PICKUP' then
    if v_role='RIDER' then
      v_cap := 7500;
    elsif v_role in ('DRIVER','HELPER') then
      v_cap := 3750;
    end if;

    if v_cap is not null then
      new.commission_mmk := least(v_raw,v_cap);
      new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
        'pickup_team_cap_mmk',7500,
        'role_cap_mmk',v_cap,
        'pickup_share_rule',case when v_role='RIDER' then 'RIDER_FULL_CAP' else 'DRIVER_HELPER_CAP_SPLIT_HALF_EACH' end,
        'commission_policy_version','COMMISSION_2026_10_03_PICKUP_CAP_7500'
      );
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_be_commission_events_pickup_cap_v1 on public.be_commission_events;

create trigger trg_be_commission_events_pickup_cap_v1
before insert or update of operation_type, role_code, rate_mmk, unit_count, commission_mmk
on public.be_commission_events
for each row
execute function public.be_commission_events_apply_pickup_cap_v1();

update public.be_commission_events
set commission_mmk = least(
      greatest(coalesce(rate_mmk,0),0) * greatest(coalesce(unit_count,0),0),
      case
        when upper(btrim(coalesce(role_code,'')))='RIDER' then 7500
        when upper(btrim(coalesce(role_code,''))) in ('DRIVER','HELPER') then 3750
        else greatest(coalesce(rate_mmk,0),0) * greatest(coalesce(unit_count,0),0)
      end
    ),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'pickup_team_cap_mmk',7500,
      'role_cap_mmk',case
        when upper(btrim(coalesce(role_code,'')))='RIDER' then 7500
        when upper(btrim(coalesce(role_code,''))) in ('DRIVER','HELPER') then 3750
        else null end,
      'commission_policy_version','COMMISSION_2026_10_03_PICKUP_CAP_7500'
    ),
    updated_at = now()
where upper(btrim(coalesce(operation_type,'')))='PICKUP'
  and upper(btrim(coalesce(role_code,''))) in ('RIDER','DRIVER','HELPER')
  and upper(coalesce(event_status,'')) in ('PENDING','READY');
