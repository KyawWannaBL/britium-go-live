revoke all on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) from public;
revoke all on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) from anon;
grant execute on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) to authenticated;

with canonical as (
  select distinct on (x.delivery_way_id)
         x.delivery_way_id,x.warehouse_status,x.updated_at
  from public.be_v_warehouse_receipt_v39 x
  where x.delivery_way_id is not null
  order by x.delivery_way_id,x.updated_at desc nulls last
)
update public.be_data_entry_parcel_details d
set warehouse_status = case
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_READY' then 'WAREHOUSE_READY'
      when upper(coalesce(c.warehouse_status,''))='RECEIVED' then 'RECEIVED'
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_EXCEPTION' then 'WAREHOUSE_EXCEPTION'
      else 'PENDING'
    end,
    way_management_status = case
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_READY'
           and upper(coalesce(d.financial_validation_status,''))='VALID'
           and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
        then 'READY_FOR_WAYPLAN'
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_EXCEPTION' then 'ON_HOLD'
      when upper(coalesce(d.parcel_status,'')) in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED') then d.way_management_status
      else 'WAITING_WAREHOUSE_READY'
    end,
    updated_at=now()
from canonical c
where c.delivery_way_id=d.delivery_way_id
  and (
    upper(coalesce(d.warehouse_status,'')) is distinct from upper(coalesce(c.warehouse_status,'PENDING'))
    or (
      upper(coalesce(c.warehouse_status,''))<>'WAREHOUSE_READY'
      and upper(coalesce(d.way_management_status,''))='READY_FOR_WAYPLAN'
    )
  );

with canonical as (
  select distinct on (x.delivery_way_id)
         x.delivery_way_id,x.warehouse_status,x.updated_at
  from public.be_v_warehouse_receipt_v39 x
  where x.delivery_way_id is not null
  order by x.delivery_way_id,x.updated_at desc nulls last
)
update public.be_waybill_ledger w
set warehouse_status = case
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_READY' then 'WAREHOUSE_READY'
      when upper(coalesce(c.warehouse_status,''))='RECEIVED' then 'RECEIVED'
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_EXCEPTION' then 'WAREHOUSE_EXCEPTION'
      else 'PENDING'
    end,
    dispatch_status = case
      when upper(coalesce(w.dispatch_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then w.dispatch_status
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_READY' then 'READY_FOR_DISPATCH'
      else 'WAITING_WAREHOUSE_READY'
    end,
    wayplan_status = case
      when upper(coalesce(w.wayplan_status,'')) in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD') then w.wayplan_status
      when upper(coalesce(c.warehouse_status,''))='WAREHOUSE_READY' then 'READY_FOR_WAYPLAN'
      else 'NOT_PLANNED'
    end,
    updated_at=now(),
    metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object('v12_16_canonical_warehouse_reconcile',true,'reconciled_at',now())
from canonical c
where c.delivery_way_id=w.delivery_way_id
  and upper(coalesce(w.dispatch_status,'')) not in ('DELIVERED','RTO','COMPLETED','CANCELLED','ON_HOLD')
  and (
    upper(coalesce(w.warehouse_status,'')) is distinct from upper(coalesce(c.warehouse_status,'PENDING'))
    or (
      upper(coalesce(c.warehouse_status,''))<>'WAREHOUSE_READY'
      and upper(coalesce(w.dispatch_status,''))='READY_FOR_DISPATCH'
    )
  );;
