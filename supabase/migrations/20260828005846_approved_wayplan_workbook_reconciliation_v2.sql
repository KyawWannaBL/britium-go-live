begin;
create schema if not exists private;
create table if not exists private.be_approved_wayplan_workbook_audit_v2 (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text,
  workbook_name text,
  payload_hash text not null,
  total_rows integer not null,
  existing_canonical integer not null,
  missing_canonical integer not null,
  terminal_conflicts integer not null,
  committed boolean not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
revoke all on private.be_approved_wayplan_workbook_audit_v2 from public, anon, authenticated;
create or replace function public.be_approved_wayplan_workbook_reconcile_v2(
  p_payload jsonb default '{}'::jsonb,
  p_commit boolean default false,
  p_confirmation text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt()->>'email', 'unknown');
  v_plan jsonb;
  v_row jsonb;
  v_id text;
  v_source_status text;
  v_total integer := 0;
  v_existing integer := 0;
  v_missing integer := 0;
  v_terminal integer := 0;
  v_written integer := 0;
  v_affected integer := 0;
  v_terminal_live boolean;
  v_exists_ledger boolean;
  v_result jsonb;
begin
  if v_actor is null or not private.be_emergency_is_superadmin_v2() then
    raise exception 'Superadmin authorization is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload->'plans') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'Payload plans must be an array.');
  end if;

  if p_commit and p_confirmation is distinct from 'APPLY APPROVED WAYPLANS' then
    return jsonb_build_object('ok', false, 'error', 'Exact confirmation text is required.');
  end if;

  for v_plan in select value from jsonb_array_elements(p_payload->'plans') loop
    if nullif(btrim(v_plan->>'code'), '') is null then
      return jsonb_build_object('ok', false, 'error', 'Every Wayplan requires a code.');
    end if;
    if jsonb_typeof(v_plan->'rows') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'Every Wayplan requires a rows array.');
    end if;

    for v_row in select value from jsonb_array_elements(v_plan->'rows') loop
      v_total := v_total + 1;
      v_id := nullif(btrim(v_row->>'delivery_way_id'), '');
      v_source_status := upper(coalesce(v_row->>'source_status', ''));
      if v_id is null then
        return jsonb_build_object('ok', false, 'error', 'A workbook row has no Delivery Way ID.');
      end if;

      select
        exists(select 1 from public.be_waybill_ledger w where w.delivery_way_id = v_id or w.waybill_no = v_id),
        exists(
          select 1
          from public.be_waybill_ledger w
          where (w.delivery_way_id = v_id or w.waybill_no = v_id)
            and upper(coalesce(w.status, '') || ' ' || coalesce(w.dispatch_status, '') || ' ' || coalesce(w.wayplan_status, '') || ' ' || coalesce(w.warehouse_status, ''))
                ~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)'
        ) or exists(
          select 1
          from public.be_data_entry_parcel_details d
          where d.delivery_way_id = v_id
            and (d.closed_at is not null or upper(coalesce(d.parcel_status, '') || ' ' || coalesce(d.warehouse_status, '') || ' ' || coalesce(d.way_management_status, ''))
                 ~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)')
        )
      into v_exists_ledger, v_terminal_live;

      if v_source_status ~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)' or v_terminal_live then
        v_terminal := v_terminal + 1;
        continue;
      end if;

      if v_exists_ledger then v_existing := v_existing + 1; else v_missing := v_missing + 1; end if;

      if p_commit then
        update public.be_waybill_ledger
        set
          delivery_way_id = v_id,
          waybill_no = coalesce(nullif(waybill_no, ''), v_id),
          merchant_name = coalesce(nullif(v_row->>'merchant_name', ''), merchant_name),
          recipient_name = coalesce(nullif(v_row->>'recipient_name', ''), recipient_name),
          recipient_phone = coalesce(nullif(v_row->>'recipient_phone', ''), recipient_phone),
          contact_no_1 = coalesce(nullif(v_row->>'recipient_phone', ''), contact_no_1),
          township = coalesce(nullif(v_row->>'township', ''), township),
          recipient_address = coalesce(nullif(v_row->>'address', ''), recipient_address),
          delivery_address = coalesce(nullif(v_row->>'address', ''), delivery_address),
          customer_name = coalesce(nullif(v_row->>'recipient_name', ''), customer_name),
          item_price = coalesce((v_row->>'item_price')::numeric, item_price, 0),
          delivery_fee = coalesce((v_row->>'delivery_fee')::numeric, delivery_fee, 0),
          cod_amount = coalesce((v_row->>'cod_amount')::numeric, cod_amount, 0),
          weight_kg = coalesce((v_row->>'weight_kg')::numeric, weight_kg, 0),
          parcel_weight_kg = coalesce((v_row->>'weight_kg')::numeric, parcel_weight_kg, 0),
          status = 'READY_FOR_WAYPLAN',
          dispatch_status = 'READY_FOR_DISPATCH',
          wayplan_status = 'READY_FOR_WAYPLAN',
          warehouse_status = 'RECEIVED',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'approved_workbook_code', v_plan->>'code',
            'approved_workbook_actor', v_email,
            'approved_workbook_at', now(),
            'destination', v_row->>'destination',
            'remarks', v_row->>'remarks'
          ),
          updated_at = now()
        where delivery_way_id = v_id or waybill_no = v_id;
        get diagnostics v_affected = row_count;

        if v_affected = 0 then
          insert into public.be_waybill_ledger (
            waybill_no, delivery_way_id, merchant_name, recipient_name,
            recipient_phone, contact_no_1, customer_name, township,
            recipient_address, delivery_address, item_price, delivery_fee,
            cod_amount, weight_kg, parcel_weight_kg, parcel_count,
            status, dispatch_status, wayplan_status, warehouse_status, metadata
          ) values (
            v_id, v_id, nullif(v_row->>'merchant_name', ''), nullif(v_row->>'recipient_name', ''),
            nullif(v_row->>'recipient_phone', ''), nullif(v_row->>'recipient_phone', ''), nullif(v_row->>'recipient_name', ''), nullif(v_row->>'township', ''),
            nullif(v_row->>'address', ''), nullif(v_row->>'address', ''), coalesce((v_row->>'item_price')::numeric, 0), coalesce((v_row->>'delivery_fee')::numeric, 0),
            coalesce((v_row->>'cod_amount')::numeric, 0), coalesce((v_row->>'weight_kg')::numeric, 0), coalesce((v_row->>'weight_kg')::numeric, 0), 1,
            'READY_FOR_WAYPLAN', 'READY_FOR_DISPATCH', 'READY_FOR_WAYPLAN', 'RECEIVED',
            jsonb_build_object('source', 'APPROVED_WAYPLAN_WORKBOOK_V2', 'approved_workbook_code', v_plan->>'code', 'approved_workbook_actor', v_email, 'destination', v_row->>'destination', 'remarks', v_row->>'remarks')
          );
        end if;

        update public.be_data_entry_parcel_details
        set warehouse_status = 'RECEIVED', way_management_status = 'READY_FOR_WAYPLAN', updated_at = now()
        where delivery_way_id = v_id
          and closed_at is null
          and upper(coalesce(parcel_status, '') || ' ' || coalesce(warehouse_status, '') || ' ' || coalesce(way_management_status, ''))
              !~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)';
        v_written := v_written + 1;
      end if;
    end loop;
  end loop;

  v_result := jsonb_build_object(
    'ok', v_terminal = 0,
    'mode', case when p_commit then 'COMMIT' else 'PREVIEW' end,
    'total_rows', v_total,
    'existing_canonical', v_existing,
    'missing_canonical', v_missing,
    'terminal_conflicts', v_terminal,
    'written', v_written,
    'error', case when v_terminal > 0 then v_terminal || ' terminal/RTO parcel(s) conflict with this workbook.' else null end
  );

  insert into private.be_approved_wayplan_workbook_audit_v2 (
    actor_id, actor_email, workbook_name, payload_hash, total_rows,
    existing_canonical, missing_canonical, terminal_conflicts, committed, result
  ) values (
    v_actor, v_email, nullif(p_payload->>'workbook_name', ''), md5(p_payload::text), v_total,
    v_existing, v_missing, v_terminal, p_commit, v_result
  );

  return v_result;
end;
$function$;
revoke all on function public.be_approved_wayplan_workbook_reconcile_v2(jsonb, boolean, text) from public, anon;
grant execute on function public.be_approved_wayplan_workbook_reconcile_v2(jsonb, boolean, text) to authenticated;
commit;
