create or replace view public.be_v_dispatch_ready_queue as
select
  coalesce(nullif(w.delivery_way_id,''),nullif(d.delivery_way_id,'')) as delivery_way_id,
  coalesce(nullif(w.waybill_no,''),nullif(d.delivery_way_id,'')) as waybill_no,
  coalesce(d.pickup_id,w.pickup_id) as pickup_id,
  coalesce(d.pickup_id,w.pickup_way_id,w.pickup_id) as pickup_way_id,
  coalesce(w.merchant_name,'') as merchant_name,
  coalesce(d.recipient_name,w.recipient_name,w.customer_name,'') as recipient_name,
  coalesce(d.contact_no_1,w.recipient_phone,w.contact_no_1,'') as recipient_phone,
  coalesce(d.township,w.township,'') as township,
  coalesce(d.recipient_address,w.recipient_address,w.delivery_address,'') as address,
  coalesce(d.actual_collect,d.cod_amount,w.cod_amount,w.item_price,0) as cod_amount,
  coalesce(d.delivery_fee,w.delivery_fee,0) as delivery_fee,
  coalesce(d.weight_kg,w.weight_kg,w.parcel_weight_kg,w.total_weight_kg,0) as parcel_weight_kg,
  coalesce(w.dispatch_status,'READY_FOR_DISPATCH') as dispatch_status,
  wh.warehouse_status as warehouse_status,
  coalesce(d.way_management_status,w.wayplan_status,'READY_FOR_WAYPLAN') as wayplan_status,
  coalesce(w.created_at,d.saved_at,now()) as created_at,
  coalesce(w.updated_at,d.updated_at,now()) as updated_at,
  jsonb_build_object(
    'source','be_v_dispatch_ready_queue_v12_12',
    'registered_data_entry',true,
    'financial_validation_status',d.financial_validation_status,
    'canonical_warehouse_status',wh.warehouse_status,
    'discrepancy_code',coalesce(wh.discrepancy_code,''),
    'delivery_attempt_status',coalesce(wh.delivery_attempt_status,''),
    'dispatch_status',w.dispatch_status,
    'wayplan_status',coalesce(d.way_management_status,w.wayplan_status)
  ) as metadata
from public.be_data_entry_parcel_details d
join public.be_waybill_ledger w on w.delivery_way_id=d.delivery_way_id
join lateral (
  select x.warehouse_status,x.discrepancy_code,x.delivery_attempt_status,x.updated_at
  from public.be_v_warehouse_receipt_v39 x
  where x.delivery_way_id=d.delivery_way_id
  order by x.updated_at desc nulls last
  limit 1
) wh on true
where d.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
  and upper(coalesce(d.financial_validation_status,''))='VALID'
  and upper(coalesce(wh.warehouse_status,''))='WAREHOUSE_READY'
  and coalesce(wh.discrepancy_code,'')=''
  and upper(coalesce(wh.delivery_attempt_status,''))<>'RTO'
  and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
  and upper(coalesce(w.dispatch_status,'READY_FOR_DISPATCH')) in ('READY_FOR_DISPATCH','WAITING_DISPATCH','READY','WAYBILL_CREATED','WAYPLAN_CREATED')
  and upper(coalesce(w.wayplan_status,'READY_FOR_WAYPLAN')) in ('NOT_PLANNED','READY_FOR_WAYPLAN','WAYPLAN_CREATED');

create or replace function public.be_warehouse_canonical_status_sync_v12_12()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.delivery_way_id is null then return new; end if;

  if upper(coalesce(new.warehouse_status,''))='WAREHOUSE_READY' then
    update public.be_waybill_ledger
       set warehouse_status='WAREHOUSE_READY',
           dispatch_status=case when upper(coalesce(dispatch_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then dispatch_status else 'READY_FOR_DISPATCH' end,
           wayplan_status=case when upper(coalesce(wayplan_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then wayplan_status else 'READY_FOR_WAYPLAN' end,
           updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('warehouse_sync','WAREHOUSE_READY','warehouse_ready_at',new.ready_at,'warehouse_sync_at',now())
     where delivery_way_id=new.delivery_way_id;

    update public.be_data_entry_parcel_details
       set warehouse_status='WAREHOUSE_READY',
           way_management_status=case when upper(coalesce(parcel_status,'')) in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED') then way_management_status else 'READY_FOR_WAYPLAN' end,
           updated_at=now()
     where delivery_way_id=new.delivery_way_id;

  elsif upper(coalesce(new.warehouse_status,''))='RECEIVED' then
    update public.be_waybill_ledger
       set warehouse_status='RECEIVED',
           dispatch_status=case when upper(coalesce(dispatch_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then dispatch_status else 'WAITING_WAREHOUSE_READY' end,
           wayplan_status=case when upper(coalesce(wayplan_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then wayplan_status else 'NOT_PLANNED' end,
           updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('warehouse_sync','RECEIVED','warehouse_sync_at',now())
     where delivery_way_id=new.delivery_way_id;

    update public.be_data_entry_parcel_details
       set warehouse_status='RECEIVED',
           way_management_status=case when upper(coalesce(parcel_status,'')) in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED') then way_management_status else 'WAITING_WAREHOUSE_READY' end,
           updated_at=now()
     where delivery_way_id=new.delivery_way_id;

  elsif upper(coalesce(new.warehouse_status,''))='WAREHOUSE_EXCEPTION' then
    update public.be_waybill_ledger
       set warehouse_status='WAREHOUSE_EXCEPTION',
           dispatch_status=case when upper(coalesce(dispatch_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED') then dispatch_status else 'ON_HOLD' end,
           wayplan_status=case when upper(coalesce(wayplan_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED') then wayplan_status else 'ON_HOLD' end,
           updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('warehouse_sync','WAREHOUSE_EXCEPTION','warehouse_sync_at',now())
     where delivery_way_id=new.delivery_way_id;

    update public.be_data_entry_parcel_details
       set warehouse_status='WAREHOUSE_EXCEPTION',
           way_management_status=case when upper(coalesce(parcel_status,'')) in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED') then way_management_status else 'ON_HOLD' end,
           updated_at=now()
     where delivery_way_id=new.delivery_way_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_be_warehouse_canonical_status_sync_v12_12 on public.be_warehouse_receipts_v36;
create trigger trg_be_warehouse_canonical_status_sync_v12_12
after insert or update of warehouse_status,ready_at on public.be_warehouse_receipts_v36
for each row execute function public.be_warehouse_canonical_status_sync_v12_12();

update public.be_waybill_ledger w
set dispatch_status='WAITING_WAREHOUSE_READY',
    wayplan_status='NOT_PLANNED',
    warehouse_status='PENDING',
    updated_at=now(),
    metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object('v12_12_reconciled','WAREHOUSE_RECEIPT_REQUIRED','reconciled_at',now())
where w.delivery_way_id in (
  select d.delivery_way_id
  from public.be_data_entry_parcel_details d
  join lateral (
    select x.warehouse_status
    from public.be_v_warehouse_receipt_v39 x
    where x.delivery_way_id=d.delivery_way_id
    order by x.updated_at desc nulls last limit 1
  ) wh on true
  where upper(coalesce(d.financial_validation_status,''))='VALID'
    and upper(coalesce(wh.warehouse_status,''))<>'WAREHOUSE_READY'
    and upper(coalesce(w.dispatch_status,''))='READY_FOR_DISPATCH'
    and upper(coalesce(w.wayplan_status,''))='READY_FOR_WAYPLAN'
);

update public.be_data_entry_parcel_details d
set way_management_status='WAITING_WAREHOUSE_READY',
    updated_at=now()
where upper(coalesce(d.financial_validation_status,''))='VALID'
  and exists(
    select 1 from public.be_v_warehouse_receipt_v39 x
    where x.delivery_way_id=d.delivery_way_id
      and upper(coalesce(x.warehouse_status,''))<>'WAREHOUSE_READY'
  )
  and upper(coalesce(d.way_management_status,''))='READY_FOR_WAYPLAN';;
