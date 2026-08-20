-- Britium UAT final completion check
select
  pickup_id,
  waybill_no,
  wayplan_id,
  delivery_way_id,
  invoice_no,
  pickup_status,
  workflow_stage,
  warehouse_status,
  wayplan_status,
  dispatch_status,
  finance_status,
  cod_settlement_status,
  cod_amount,
  cod_collected_amount,
  cod_settled_amount
from public.be_v_operational_chain
order by updated_at desc
limit 20;
