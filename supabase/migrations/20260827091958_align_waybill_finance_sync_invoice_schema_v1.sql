create or replace function public.be_sync_waybill_to_finance_aiu()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_cod_id uuid; v_settlement_id text; v_invoice_id text;
begin
  if lower(coalesce(new.overall_status,''))='isolated'
     or lower(coalesce(new.operation_status,''))='isolated'
     or lower(coalesce(new.validation_status,''))='isolated' then return new; end if;
  if new.delivery_way_id is null or trim(new.delivery_way_id)='' then return new; end if;

  insert into public.be_cod_ledger
  (pickup_id,pickup_way_id,delivery_way_id,merchant_code,merchant_name,recipient_name,
   cod_amount,cod_status,payload,updated_at)
  values(new.pickup_id,new.pickup_way_id,new.delivery_way_id,new.merchant_code,new.merchant_name,
   new.recipient_name,coalesce(new.finance_cod,new.final_cod,0),
   case when coalesce(new.finance_cod,new.final_cod,0)>0 then 'pending_collection' else 'not_required' end,
   to_jsonb(new),now())
  on conflict(delivery_way_id) do update set
   pickup_id=excluded.pickup_id,pickup_way_id=excluded.pickup_way_id,
   merchant_code=excluded.merchant_code,merchant_name=excluded.merchant_name,
   recipient_name=excluded.recipient_name,cod_amount=excluded.cod_amount,
   cod_status=case when public.be_cod_ledger.cod_status in ('handed_over_to_finance','finance_settled')
     then public.be_cod_ledger.cod_status else excluded.cod_status end,
   payload=coalesce(public.be_cod_ledger.payload,'{}'::jsonb)||excluded.payload,updated_at=now()
  returning cod_id into v_cod_id;

  insert into public.be_financial_settlements
  (pickup_id,pickup_way_id,delivery_way_id,cod_id,merchant_code,merchant_name,recipient_name,
   delivery_fee,gross_cod,finance_deli,finance_cod,settlement_status,payload,updated_at)
  values(new.pickup_id,new.pickup_way_id,new.delivery_way_id,v_cod_id,new.merchant_code,
   new.merchant_name,new.recipient_name,coalesce(new.finance_deli,new.deli_fee_os,0),
   coalesce(new.finance_cod,new.final_cod,0),coalesce(new.finance_deli,new.deli_fee_os,0),
   coalesce(new.finance_cod,new.final_cod,0),coalesce(new.finance_status,'pending_finance'),
   to_jsonb(new),now())
  on conflict(delivery_way_id) do update set
   cod_id=excluded.cod_id,pickup_id=excluded.pickup_id,pickup_way_id=excluded.pickup_way_id,
   merchant_code=excluded.merchant_code,merchant_name=excluded.merchant_name,
   recipient_name=excluded.recipient_name,delivery_fee=excluded.delivery_fee,
   gross_cod=excluded.gross_cod,finance_deli=excluded.finance_deli,finance_cod=excluded.finance_cod,
   settlement_status=case when public.be_financial_settlements.settlement_status='finance_settled'
     then public.be_financial_settlements.settlement_status else excluded.settlement_status end,
   payload=coalesce(public.be_financial_settlements.payload,'{}'::jsonb)||excluded.payload,updated_at=now()
  returning settlement_id into v_settlement_id;

  update public.be_cod_ledger set settlement_id=v_settlement_id,updated_at=now() where cod_id=v_cod_id;

  insert into public.be_customer_invoices
  (pickup_way_id,delivery_way_id,merchant_code,merchant_name,invoice_amount,delivery_fee,
   cod_amount,invoice_status,payload,updated_at)
  values(new.pickup_way_id,new.delivery_way_id,new.merchant_code,new.merchant_name,
   coalesce(new.finance_deli,new.deli_fee_os,0),coalesce(new.finance_deli,new.deli_fee_os,0),
   coalesce(new.finance_cod,new.final_cod,0),'draft',
   to_jsonb(new)||jsonb_build_object('settlement_id',v_settlement_id),now())
  on conflict(delivery_way_id) do update set
   pickup_way_id=excluded.pickup_way_id,merchant_code=excluded.merchant_code,
   merchant_name=excluded.merchant_name,invoice_amount=excluded.invoice_amount,
   delivery_fee=excluded.delivery_fee,cod_amount=excluded.cod_amount,
   payload=coalesce(public.be_customer_invoices.payload,'{}'::jsonb)||excluded.payload,updated_at=now()
  returning invoice_id into v_invoice_id;

  insert into public.be_enterprise_workflow_events
  (pickup_id,pickup_way_id,delivery_way_id,event_type,event_status,source_module,target_module,amount,payload)
  values(new.pickup_id,new.pickup_way_id,new.delivery_way_id,'DATA_ENTRY_TO_FINANCE_SYNC',
   coalesce(new.finance_status,'pending_finance'),'data_entry','finance',
   coalesce(new.finance_cod,new.final_cod,0),
   jsonb_build_object('cod_id',v_cod_id,'settlement_id',v_settlement_id,'invoice_id',v_invoice_id));
  return new;
end;$function$;;
