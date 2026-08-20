begin;

-- ---------------------------------------------------------------------------
-- Data Entry auto-calculation backend fallback
-- Calculates base fee, surcharge, delivery fee, COD, and actual collect.
--
-- Current go-live tariff rule used by the frontend and backend:
--   Yangon/YGN:      base fee 4,000 MMK
--   Mandalay/MDY:   base fee 6,000 MMK
--   Naypyitaw/NPT:  base fee 6,000 MMK
--   Standard tier includes 3 kg
--   Royal tier includes 5 kg
--   Extra rounded-up kg surcharge: 500 MMK per kg
--   COD = item price
--   Actual collect = item price + delivery fee
-- ---------------------------------------------------------------------------

create or replace function public.be_calculate_tariff(
  p_township text,
  p_tier text default 'Standard',
  p_weight numeric default 0,
  p_item_price numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := lower(regexp_replace(trim(coalesce(p_township, '')), '[\s\-_()]+', '', 'g'));
  v_township text := nullif(trim(coalesce(p_township, '')), '');
  v_city text := 'Yangon';
  v_region_state text := 'Yangon Region';
  v_branch_code text := 'YGN';
  v_is_out_of_reach boolean := false;
  v_service_status text := 'IN_REACH';

  v_tier text := upper(trim(coalesce(p_tier, 'Standard')));
  v_weight numeric := greatest(coalesce(p_weight, 0), 0);
  v_item_price numeric := greatest(coalesce(p_item_price, 0), 0);

  v_included_kg numeric := 3;
  v_base_fee numeric := 4000;
  v_extra_kg numeric := 0;
  v_surcharge numeric := 0;
  v_delivery_fee numeric := 0;
  v_cod numeric := 0;
  v_actual_collect numeric := 0;
begin
  if v_key <> '' then
    select
      m.township,
      coalesce(m.city, v_city),
      coalesce(m.region_state, v_region_state),
      coalesce(m.branch_code, v_branch_code),
      coalesce(m.is_out_of_reach, false),
      coalesce(m.service_status, 'IN_REACH')
    into
      v_township,
      v_city,
      v_region_state,
      v_branch_code,
      v_is_out_of_reach,
      v_service_status
    from public.be_township_master m
    left join public.be_township_aliases a
      on a.township_key = m.township_key
     and coalesce(a.is_active, true) = true
    where m.township_key = v_key
       or a.alias_key = v_key
    order by case when m.township_key = v_key then 0 else 1 end
    limit 1;
  end if;

  if v_tier = 'ROYAL' then
    v_included_kg := 5;
  else
    v_included_kg := 3;
  end if;

  if upper(coalesce(v_branch_code, '')) in ('MDY', 'NPT')
     or lower(coalesce(v_region_state, '')) like '%mandalay%'
     or lower(coalesce(v_region_state, '')) like '%naypyitaw%'
     or lower(coalesce(v_city, '')) like '%mandalay%'
     or lower(coalesce(v_city, '')) like '%naypyitaw%'
  then
    v_base_fee := 6000;
  else
    v_base_fee := 4000;
  end if;

  v_extra_kg := greatest(0, ceil(v_weight) - v_included_kg);
  v_surcharge := v_extra_kg * 500;
  v_delivery_fee := v_base_fee + v_surcharge;
  v_cod := v_item_price;
  v_actual_collect := v_item_price + v_delivery_fee;

  return jsonb_build_object(
    'ok', true,
    'township', v_township,
    'city', v_city,
    'region_state', v_region_state,
    'branch_code', v_branch_code,
    'tier', initcap(lower(v_tier)),
    'weight', v_weight,
    'included_kg', v_included_kg,
    'extra_kg', v_extra_kg,
    'base_fee', v_base_fee,
    'surcharge', v_surcharge,
    'delivery_fee', v_delivery_fee,
    'cod', v_cod,
    'actual_collect', v_actual_collect,
    'is_out_of_reach', v_is_out_of_reach,
    'service_status', v_service_status,
    'alert_message', case when v_is_out_of_reach then 'Out of reach' else null end
  );
end;
$$;

grant execute on function public.be_calculate_tariff(text, text, numeric, numeric) to authenticated;

commit;

notify pgrst, 'reload schema';
