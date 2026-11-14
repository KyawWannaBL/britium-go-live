create or replace function public.be_waybill_studio_snapshot_v12_5(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_rows jsonb;
begin
  if not private.be_waybill_sync_allowed_v12_2() then
    raise exception 'Waybill Studio permission is required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.row_json order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      p.created_at,
      to_jsonb(p) ||
      case when d.id is null then '{}'::jsonb else
        jsonb_strip_nulls(jsonb_build_object(
          'delivery_way_id', p.waybill_no,
          'recipient_name', nullif(btrim(d.recipient_name), ''),
          'recipient_phone', nullif(btrim(d.contact_no_1), ''),
          'recipient_phone_2', nullif(btrim(d.contact_no_2), ''),
          'township', nullif(btrim(d.township), ''),
          'township_key', nullif(btrim(d.township_key), ''),
          'township_mm', nullif(btrim(t.label_mm), ''),
          'township_name', nullif(btrim(t.label_en), ''),
          'city', nullif(btrim(d.city), ''),
          'region_state', nullif(btrim(d.region_state), ''),
          'recipient_address', nullif(btrim(d.recipient_address), ''),
          'customer_tier', nullif(btrim(d.customer_tier), ''),
          'item_price', d.item_price,
          'weight_kg', d.weight_kg,
          'surcharge', d.surcharge,
          'delivery_fee', d.delivery_fee,
          'cod_amount', d.cod_amount,
          'actual_collect', d.actual_collect,
          'destination', nullif(btrim(d.destination), ''),
          'remarks', nullif(btrim(d.remark), ''),
          'data_entry_saved_at', d.saved_at,
          'data_entry_updated_at', d.updated_at,
          'waybill_data_source', 'DATA_ENTRY_AUTHORITATIVE_TOWNSHIP_MASTER_V12_5_1'
        ))
      end as row_json
    from public.be_v32_parcels p
    left join lateral (
      select d0.*
      from public.be_data_entry_parcel_details d0
      where upper(nullif(btrim(d0.delivery_way_id), '')) = upper(nullif(btrim(p.waybill_no), ''))
         or (
          nullif(btrim(d0.pickup_id), '') = nullif(btrim(p.pickup_id), '')
          and nullif(to_jsonb(p)->>'parcel_sequence', '') is not null
          and d0.parcel_sequence::text = nullif(to_jsonb(p)->>'parcel_sequence', '')
        )
      order by
        case when upper(nullif(btrim(d0.delivery_way_id), '')) = upper(nullif(btrim(p.waybill_no), '')) then 0 else 1 end,
        coalesce(d0.updated_at, d0.saved_at, d0.created_at) desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select a.label_en, a.label_mm, a.township_code
      from public.v_address_township_options a
      where coalesce(a.is_selectable_for_address, true)
        and (
          lower(btrim(a.label_en)) = lower(btrim(coalesce(d.township, '')))
          or btrim(a.label_mm) = btrim(coalesce(d.township, ''))
          or lower(btrim(a.township_code)) = lower(btrim(coalesce(d.township_key, '')))
        )
      order by
        case
          when lower(btrim(a.township_code)) = lower(btrim(coalesce(d.township_key, ''))) then 0
          when btrim(a.label_mm) = btrim(coalesce(d.township, '')) then 1
          else 2
        end
      limit 1
    ) t on d.id is not null
    where nullif(btrim(p.waybill_no), '') is not null
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) x;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'row_count', jsonb_array_length(v_rows),
    'source', 'DATA_ENTRY_AUTHORITATIVE_TOWNSHIP_MASTER_V12_5_1'
  );
end;
$function$;

revoke all on function public.be_waybill_studio_snapshot_v12_5(integer) from public, anon;
grant execute on function public.be_waybill_studio_snapshot_v12_5(integer) to authenticated;;
