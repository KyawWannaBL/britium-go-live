create or replace function public.be_workforce_wallet_center(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sync jsonb;
  v_rows jsonb;
  v_summary jsonb;
begin
  v_sync := public.be_sync_workforce_wallets();

  with active_wallets as (
    select w.*
    from public.be_workforce_wallets w
    where w.delivery_way_id is not null
      and w.worker_code is not null
      and w.worker_code <> 'UNKNOWN'
      and w.amount > 0
      and exists (
        select 1
        from public.delivery_waybills dw
        join public.be_bulk_upload_batches b
          on b.batch_id::text = dw.raw_row->>'source_bulk_batch_id'
        where b.module_code = 'DATA_ENTRY'
          and b.status = 'ACTIVE'
          and coalesce(dw.delivery_way_id, dw.deliver_way_id) = w.delivery_way_id
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select *
    from active_wallets
    order by created_at desc
    limit greatest(coalesce(p_limit, 300), 1)
  ) x;

  with active_wallets as (
    select w.*
    from public.be_workforce_wallets w
    where w.delivery_way_id is not null
      and w.worker_code is not null
      and w.worker_code <> 'UNKNOWN'
      and w.amount > 0
      and exists (
        select 1
        from public.delivery_waybills dw
        join public.be_bulk_upload_batches b
          on b.batch_id::text = dw.raw_row->>'source_bulk_batch_id'
        where b.module_code = 'DATA_ENTRY'
          and b.status = 'ACTIVE'
          and coalesce(dw.delivery_way_id, dw.deliver_way_id) = w.delivery_way_id
      )
  )
  select jsonb_build_object(
    'total_records', count(*),
    'pending_amount', coalesce(sum(amount) filter (where wallet_status = 'PENDING'), 0),
    'paid_amount', coalesce(sum(amount) filter (where wallet_status = 'PAID'), 0),
    'rider_amount', coalesce(sum(amount) filter (where worker_role = 'RIDER'), 0),
    'driver_amount', coalesce(sum(amount) filter (where worker_role = 'DRIVER'), 0),
    'helper_amount', coalesce(sum(amount) filter (where worker_role = 'HELPER'), 0)
  )
  into v_summary
  from active_wallets;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_workforce_wallet_center',
    'active_scope', 'CURRENT_DATA_ENTRY_BATCH_ONLY',
    'count', jsonb_array_length(v_rows),
    'summary', v_summary,
    'sync', v_sync,
    'rows', v_rows
  );
end;
$function$;;
