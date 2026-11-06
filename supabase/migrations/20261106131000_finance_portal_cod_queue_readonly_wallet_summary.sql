-- Finance dashboard must not run wallet sync during a read-only COD queue load.
-- Preserve COD rows and wallet summary from existing records. No financial mutations.
CREATE OR REPLACE FUNCTION public.be_finance_portal_center()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_finance jsonb;
  v_control jsonb;
  v_wallet jsonb;
begin
  v_finance := public.be_finance_wayplan_cod_center(300);
  v_control := public.be_enterprise_control_tower(300);
  -- Read-only wallet summary. Never run workforce-wallet synchronization while loading Finance.
  select jsonb_build_object('summary',jsonb_build_object(
    'total_records',count(*),
    'pending_amount',coalesce(sum(w.amount) filter (where w.wallet_status='PENDING'),0),
    'paid_amount',coalesce(sum(w.amount) filter (where w.wallet_status='PAID'),0),
    'rider_amount',coalesce(sum(w.amount) filter (where w.worker_role='RIDER'),0),
    'driver_amount',coalesce(sum(w.amount) filter (where w.worker_role='DRIVER'),0),
    'helper_amount',coalesce(sum(w.amount) filter (where w.worker_role='HELPER'),0)
  )) into v_wallet
  from public.be_workforce_wallets w
  where w.delivery_way_id is not null and w.worker_code is not null
    and w.worker_code <> 'UNKNOWN' and w.amount > 0
    and exists (
      select 1 from public.delivery_waybills dw
      join public.be_bulk_upload_batches b
        on b.batch_id::text = dw.raw_row->>'source_bulk_batch_id'
      where b.module_code='DATA_ENTRY' and b.status='ACTIVE'
        and coalesce(dw.delivery_way_id,dw.deliver_way_id)=w.delivery_way_id
    );

  return jsonb_build_object(
    'ok', true,
    'source', 'be_finance_portal_center',
    'today_revenue', coalesce((v_finance->'summary'->>'total_collected')::numeric, 0),
    'pending_cod_collection', coalesce((v_finance->'summary'->>'pending_settlement')::numeric, 0),
    'settlement_queue', coalesce((v_finance->>'count')::integer, 0),
    'finance_holds', coalesce((v_control->'summary'->>'failed_or_returned')::integer, 0),
    'finance_summary', v_finance->'summary',
    'control_summary', v_control->'summary',
    'wallet_summary', v_wallet->'summary',
    'cod_rows', v_finance->'rows'
  );
end;
$function$
