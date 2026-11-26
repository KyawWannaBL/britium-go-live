-- Stop unit and field mix-ups before charging an overweight surcharge.
-- Existing data can still be corrected through the normal registration flow.
do $migration$
declare
  target regprocedure;
  definition text;
  anchor text;
  guard text;
begin
  target := 'public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(jsonb)'::regprocedure;
  anchor := '  select count(*)::integer into v_monthly';
  guard := $quote$
  if v_weight > 1000 then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array(jsonb_build_object(
      'code', 'PARCEL_WEIGHT_REQUIRES_CORRECTION', 'field', 'weight_kg',
      'message', 'Enter the measured parcel weight in kilograms (maximum 1,000 kg). Check for grams or a value copied from Item Price.'
    )));
  end if;

$quote$;
  select pg_get_functiondef(target) into definition;
  if strpos(definition, guard) = 0 then
    if (length(definition) - length(replace(definition, anchor, ''))) <> length(anchor) then
      raise exception 'Expected one pricing validation anchor in %', target;
    end if;
    execute replace(definition, anchor, guard || anchor);
  end if;

  target := 'public.be_data_entry_financial_v2_create_ready_waybill(jsonb)'::regprocedure;
  anchor := '  select to_jsonb(p) into v_pickup';
  guard := $waybill$
  if exists (
    select 1
    from public.be_data_entry_parcel_details d
    where d.pickup_id = v_pickup_id
      and d.parcel_sequence = any(v_sequences)
      and d.weight_kg > 1000
  ) then
    return jsonb_build_object('ok', false, 'operation', 'CREATE_WAYBILL', 'errors', jsonb_build_array(jsonb_build_object(
      'code', 'PARCEL_WEIGHT_REQUIRES_CORRECTION', 'field', 'weight_kg',
      'message', 'Correct and save the measured weight in kilograms before creating the selected waybill.'
    )));
  end if;

$waybill$;
  select pg_get_functiondef(target) into definition;
  if strpos(definition, guard) = 0 then
    if (length(definition) - length(replace(definition, anchor, ''))) <> length(anchor) then
      raise exception 'Expected one waybill validation anchor in %', target;
    end if;
    execute replace(definition, anchor, guard || anchor);
  end if;
end;
$migration$;
