-- Preserve verified pickup and delivered-stop commissions on legacy rebuilds.
-- Does not alter or retroactively pay posted financial transactions.
begin;
CREATE OR REPLACE FUNCTION public.be_rebuild_auto_commission_events(p_work_date date DEFAULT CURRENT_DATE, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  d jsonb;
  v_work_date date := coalesce(p_work_date, current_date);
  v_event_date date;
  v_tracking text;
  v_pickup text;
  v_waybill text;
  v_wayplan text;
  v_source_key text;
  v_asset text;
  v_role text;
  v_email text;
  v_name text;
  v_rate numeric;
  v_units numeric;
  v_delivery_rows integer := 0;
  v_pickup_rows integer := 0;
  v_referral_rows integer := 0;
  v_inserted integer := 0;
  v_status text;
  v_op text;
  v_has_dispatch_view boolean;
  v_has_pickup_table boolean;
  v_pickup_item_count integer;
  v_merchant_id text;
  v_merchant_name text;
  v_assignment_id uuid;
  v_referrer_employee_id text;
  v_referrer_email text;
  v_referrer_name text;
begin
  -- Never delete approved or paid commission rows during a rebuild.
  delete from public.be_commission_events
  where work_date = v_work_date
    and source_type = 'AUTO'
    and event_status in ('PENDING', 'READY')
    -- Preserve idempotent live delivery and pickup credits. The legacy
    -- rebuild does not reconstruct these source adapters reliably.
    and coalesce(metadata->>'source_adapter','') not in
      ('PICKUP_COLLECTED_TRIGGER_V204','WAYPLAN_DELIVERED_TRIGGER_V94');

  select to_regclass('public.be_v_enterprise_dispatch_jobs') is not null
  into v_has_dispatch_view;

  if v_has_dispatch_view then
    for rec in execute 'select * from public.be_v_enterprise_dispatch_jobs'
    loop
      d := to_jsonb(rec);
      v_status := upper(coalesce(
        public.be_text_first_nonempty(d, 'delivery_status'),
        public.be_text_first_nonempty(d, 'dispatch_status'),
        ''
      ));

      v_event_date := public.be_date_from_json(
        d,
        'delivered_at',
        'delivery_completed_at',
        'dropoff_completed_at',
        'completed_at',
        'updated_at',
        'created_at'
      );

      if v_status in ('DELIVERED', 'DROP_OFF', 'COMPLETED')
         and v_event_date = v_work_date then
        v_op := case
          when upper(coalesce(public.be_text_first_nonempty(d, 'operation_type', 'job_type', 'service_type'), '')) like '%HIGHWAY%'
            or upper(coalesce(public.be_text_first_nonempty(d, 'first_stop_dropoff', 'dropoff_type', 'delivery_township', 'destination_city', 'remarks', 'remark'), '')) like '%HIGHWAY%'
          then 'HIGHWAY_DROPOFF'
          else 'DELIVERY'
        end;

        v_units := 1;
        v_tracking := public.be_text_first_nonempty(d, 'tracking_no', 'delivery_way_id', 'id');
        v_pickup := public.be_text_first_nonempty(d, 'pickup_id');
        v_waybill := public.be_text_first_nonempty(d, 'waybill_no');
        v_wayplan := public.be_text_first_nonempty(d, 'wayplan_code', 'wayplan_no', 'wayplan_id');
        v_asset := public.be_text_first_nonempty(d, 'asset_code', 'vehicle_id', 'vehicle_code');
        v_source_key := coalesce(v_tracking, v_waybill, public.be_text_first_nonempty(d, 'id'));

        v_merchant_id := public.be_text_first_nonempty(
          d,
          'merchant_id',
          'merchant_code',
          'customer_id',
          'client_id',
          'shop_id',
          'seller_id'
        );

        v_merchant_name := public.be_text_first_nonempty(
          d,
          'merchant_name',
          'customer_name',
          'client_name',
          'shop_name',
          'seller_name'
        );

        foreach v_role in array array['RIDER', 'DRIVER', 'HELPER'] loop
          v_email := case v_role
            when 'RIDER' then public.be_text_first_nonempty(d, 'rider_email', 'assigned_rider_email', 'rider_user_email')
            when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_email', 'assigned_driver_email', 'driver_user_email')
            when 'HELPER' then public.be_text_first_nonempty(d, 'helper_email', 'assigned_helper_email', 'helper_user_email')
          end;

          v_name := case v_role
            when 'RIDER' then public.be_text_first_nonempty(d, 'rider_name', 'assigned_rider_name')
            when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_name', 'assigned_driver_name')
            when 'HELPER' then public.be_text_first_nonempty(d, 'helper_name', 'assigned_helper_name')
          end;

          if v_email is not null and v_source_key is not null then
            v_rate := public.be_commission_get_rate(
              v_op,
              v_role,
              case when v_op = 'HIGHWAY_DROPOFF' then 'BAG' else 'PARCEL' end,
              v_work_date
            );

            insert into public.be_commission_events (
              source_type, source_key, work_date, operation_type, unit_type, unit_count,
              role_code, assignee_email, assignee_name, asset_code,
              tracking_no, pickup_id, waybill_no, wayplan_code, bag_count,
              merchant_id, merchant_name,
              rate_mmk, commission_mmk, event_status, actor_email, metadata
            )
            values (
              'AUTO', v_source_key, v_work_date, v_op,
              case when v_op = 'HIGHWAY_DROPOFF' then 'BAG' else 'PARCEL' end,
              v_units,
              v_role, v_email, v_name, v_asset,
              v_tracking, v_pickup, v_waybill, v_wayplan,
              case when v_op = 'HIGHWAY_DROPOFF' then v_units::integer else null end,
              v_merchant_id, v_merchant_name,
              v_rate, v_rate * v_units, 'READY', p_actor_email, d
            )
            on conflict do nothing;

            if found then
              v_inserted := v_inserted + 1;
            end if;
          end if;
        end loop;

        -- Merchant-referral commission is one unit per successfully delivered way.
        if v_merchant_id is not null and v_source_key is not null then
          v_assignment_id := null;
          v_referrer_employee_id := null;
          v_referrer_email := null;
          v_referrer_name := null;

          select
            r.assignment_id,
            r.referrer_employee_id,
            r.referrer_email,
            r.referrer_name,
            coalesce(v_merchant_name, r.merchant_name)
          into
            v_assignment_id,
            v_referrer_employee_id,
            v_referrer_email,
            v_referrer_name,
            v_merchant_name
          from public.be_merchant_referrer_for_date(v_merchant_id, v_work_date) r;

          if v_assignment_id is not null and v_referrer_email is not null then
            v_rate := public.be_commission_get_rate(
              'MERCHANT_REFERRAL',
              'MERCHANT_REFERRER',
              'WAY',
              v_work_date
            );

            insert into public.be_commission_events (
              source_type, source_key, work_date, operation_type, unit_type, unit_count,
              role_code, assignee_email, assignee_name,
              tracking_no, pickup_id, waybill_no, wayplan_code,
              merchant_id, merchant_name, referral_assignment_id,
              rate_mmk, commission_mmk, event_status, actor_email, metadata
            )
            values (
              'AUTO', v_source_key, v_work_date, 'MERCHANT_REFERRAL', 'WAY', 1,
              'MERCHANT_REFERRER', v_referrer_email, v_referrer_name,
              v_tracking, v_pickup, v_waybill, v_wayplan,
              v_merchant_id, v_merchant_name, v_assignment_id,
              v_rate, v_rate, 'READY', p_actor_email,
              jsonb_build_object(
                'merchant_id', v_merchant_id,
                'merchant_name', v_merchant_name,
                'referrer_employee_id', v_referrer_employee_id,
                'referral_assignment_id', v_assignment_id,
                'delivery_status', v_status
              )
            )
            on conflict do nothing;

            if found then
              v_inserted := v_inserted + 1;
              v_referral_rows := v_referral_rows + 1;
            end if;
          end if;
        end if;

        v_delivery_rows := v_delivery_rows + 1;
      end if;
    end loop;
  end if;

  select to_regclass('public.be_portal_pickup_requests') is not null
  into v_has_pickup_table;

  if v_has_pickup_table then
    for rec in execute 'select * from public.be_portal_pickup_requests'
    loop
      d := to_jsonb(rec);
      v_status := upper(coalesce(
        public.be_text_first_nonempty(d, 'pickup_status', 'workflow_stage', 'status'),
        ''
      ));

      if v_status in ('PICKUP_COMPLETED', 'COMPLETED', 'COLLECTED') then
        if public.be_date_from_json(d, 'pickup_completed_at', 'completed_at', 'updated_at', 'created_at') = v_work_date then
          v_pickup := public.be_text_first_nonempty(d, 'pickup_id', 'pickup_way_id', 'id');
          v_waybill := public.be_text_first_nonempty(d, 'waybill_no');
          v_asset := public.be_text_first_nonempty(d, 'asset_code', 'vehicle_id', 'vehicle_code');
          v_source_key := coalesce(v_pickup, v_waybill);

          v_pickup_item_count := 1;
          if to_regclass('public.be_portal_pickup_request_items') is not null and v_pickup is not null then
            begin
              execute 'select greatest(count(*), 1)::int from public.be_portal_pickup_request_items where pickup_id = $1'
              into v_pickup_item_count
              using v_pickup;
            exception when others then
              v_pickup_item_count := 1;
            end;
          end if;

          foreach v_role in array array['RIDER', 'DRIVER', 'HELPER'] loop
            v_email := case v_role
              when 'RIDER' then public.be_text_first_nonempty(d, 'rider_email', 'assigned_rider_email', 'rider_user_email')
              when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_email', 'assigned_driver_email', 'driver_user_email')
              when 'HELPER' then public.be_text_first_nonempty(d, 'helper_email', 'assigned_helper_email', 'helper_user_email')
            end;

            v_name := case v_role
              when 'RIDER' then public.be_text_first_nonempty(d, 'rider_name', 'assigned_rider_name')
              when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_name', 'assigned_driver_name')
              when 'HELPER' then public.be_text_first_nonempty(d, 'helper_name', 'assigned_helper_name')
            end;

            if v_email is not null and v_source_key is not null then
              v_rate := public.be_commission_get_rate('PICKUP', v_role, 'PARCEL', v_work_date);

              insert into public.be_commission_events (
                source_type, source_key, work_date, operation_type, unit_type, unit_count,
                role_code, assignee_email, assignee_name, asset_code,
                tracking_no, pickup_id, waybill_no, wayplan_code, bag_count,
                rate_mmk, commission_mmk, event_status, actor_email, metadata
              )
              values (
                'AUTO', v_source_key, v_work_date, 'PICKUP', 'PARCEL', v_pickup_item_count,
                v_role, v_email, v_name, v_asset,
                v_pickup, v_pickup, v_waybill, null, null,
                v_rate, v_rate * v_pickup_item_count, 'READY', p_actor_email, d
              )
              on conflict do nothing;

              if found then
                v_inserted := v_inserted + 1;
              end if;
            end if;
          end loop;

          v_pickup_rows := v_pickup_rows + 1;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'work_date', v_work_date,
    'delivery_completed_rows', v_delivery_rows,
    'pickup_completed_rows', v_pickup_rows,
    'merchant_referral_rows', v_referral_rows,
    'commission_event_rows_inserted', v_inserted
  );
end;
$function$;
commit;
