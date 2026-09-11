begin;

create or replace function public.be_cod_settlement_display_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb;
begin
  /*
   * Never expose PI-..., UUID or another internal reference as PickupWayID.
   * PickupWayID must match Pdddd-CODE-ddd.
   * DeliveryWayID must match Ddddd-CODE-ddd.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pickup_id', resolved.pickup_way_id,
        'pickup_way_id', resolved.pickup_way_id,
        'delivery_way_id', resolved.delivery_way_id,
        'waybill_no', resolved.delivery_way_id,
        'merchant_code', resolved.merchant_code,
        'merchant_name', resolved.merchant_name,
        'recipient_name', resolved.recipient_name,
        'cod_amount', resolved.cod_amount,
        'collected_amount', resolved.collected_amount,
        'handover_amount', resolved.handover_amount,
        'status', resolved.cod_status,
        'cod_status', resolved.cod_status,
        'updated_at', resolved.updated_at,
        'legacy_reference', resolved.legacy_reference,
        'id_health',
          case
            when resolved.pickup_way_id is null then 'MISSING_PICKUPWAY_ID'
            when resolved.delivery_way_id is null then 'MISSING_DELIVERYWAY_ID'
            else 'CANONICAL'
          end
      )
      order by resolved.updated_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      coalesce(
        public.be_normalize_pickupway_id(c.pickup_way_id),
        public.be_normalize_pickupway_id(c.pickup_id),
        public.be_normalize_pickupway_id(c.payload ->> 'pickup_way_id'),
        public.be_normalize_pickupway_id(c.payload ->> 'pickup_id'),
        d.pickup_way_id
      ) as pickup_way_id,

      coalesce(
        public.be_normalize_deliveryway_id(c.delivery_way_id),
        public.be_normalize_deliveryway_id(c.payload ->> 'delivery_way_id'),
        public.be_normalize_deliveryway_id(c.payload ->> 'waybill_no'),
        d.delivery_way_id
      ) as delivery_way_id,

      coalesce(nullif(c.merchant_code, ''), d.merchant_code) as merchant_code,
      coalesce(nullif(c.merchant_name, ''), d.merchant_name, 'Unknown merchant') as merchant_name,
      coalesce(nullif(c.recipient_name, ''), d.recipient_name, 'Recipient') as recipient_name,

      greatest(
        coalesce(c.cod_amount, 0),
        coalesce(c.collected_amount, 0),
        coalesce(d.cod_amount, 0)
      ) as cod_amount,

      coalesce(c.collected_amount, 0) as collected_amount,
      coalesce(c.handover_amount, 0) as handover_amount,
      coalesce(nullif(c.cod_status, ''), d.delivery_status, 'pending_collection') as cod_status,
      coalesce(c.updated_at, c.created_at, now()) as updated_at,

      case
        when public.be_normalize_pickupway_id(c.pickup_id) is null
        then c.pickup_id
        else null
      end as legacy_reference

    from public.be_cod_ledger c

    left join lateral (
      select j.*
      from public.be_v_rider_delivery_jobs j
      where
        (
          public.be_normalize_deliveryway_id(c.delivery_way_id) is not null
          and j.delivery_way_id =
            public.be_normalize_deliveryway_id(c.delivery_way_id)
        )
        or
        (
          public.be_normalize_pickupway_id(c.pickup_way_id) is not null
          and j.pickup_way_id =
            public.be_normalize_pickupway_id(c.pickup_way_id)
        )
        or
        (
          public.be_normalize_pickupway_id(c.pickup_id) is not null
          and j.pickup_way_id =
            public.be_normalize_pickupway_id(c.pickup_id)
        )
        or
        (
          upper(coalesce(j.merchant_name, '')) =
            upper(coalesce(c.merchant_name, ''))
          and upper(coalesce(j.recipient_name, '')) =
            upper(coalesce(c.recipient_name, ''))
          and greatest(
            coalesce(c.cod_amount, 0),
            coalesce(c.collected_amount, 0)
          ) = coalesce(j.cod_amount, 0)
        )
      order by
        case
          when j.delivery_way_id =
            public.be_normalize_deliveryway_id(c.delivery_way_id)
          then 0
          when j.pickup_way_id =
            public.be_normalize_pickupway_id(c.pickup_way_id)
          then 1
          else 2
        end,
        j.delivery_sequence
      limit 1
    ) d on true
  ) resolved;

  select jsonb_build_object(
    'records', jsonb_array_length(v_rows),
    'canonical_records',
      (
        select count(*)
        from jsonb_array_elements(v_rows) row_value
        where row_value ->> 'id_health' = 'CANONICAL'
      ),
    'missing_pickupway',
      (
        select count(*)
        from jsonb_array_elements(v_rows) row_value
        where row_value ->> 'id_health' = 'MISSING_PICKUPWAY_ID'
      ),
    'missing_deliveryway',
      (
        select count(*)
        from jsonb_array_elements(v_rows) row_value
        where row_value ->> 'id_health' = 'MISSING_DELIVERYWAY_ID'
      )
  )
  into v_stats;

  return jsonb_build_object(
    'ok', true,
    'stats', v_stats,
    'rows', v_rows,
    'records', v_rows,
    'items', v_rows
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'stats', jsonb_build_object('records', 0),
      'rows', '[]'::jsonb,
      'records', '[]'::jsonb,
      'items', '[]'::jsonb
    );
end;
$$;

grant execute on function
  public.be_cod_settlement_display_snapshot()
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
