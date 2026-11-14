
create or replace function public.be_corporate_finance_compare_v1(p_delivery_way_id text)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_way public.be_corporate_service_way_rate_v1%rowtype;
 v_row public.be_data_entry_parcel_details%rowtype;
 v_cs public.be_thirdparty_cs_current_v1%rowtype;
 v_third public.be_thirdparty_finance_review_v1%rowtype;
begin
 if auth.uid() is null or v_role not in ('superadmin','super_admin','finance','finance_manager','accountant','operation_manager') then
  raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
 end if;
 select * into v_way from public.be_corporate_service_way_rate_v1 where delivery_way_id=p_delivery_way_id;
 if not found then raise exception 'CORPORATE_WAY_RATE_NOT_FOUND';end if;
 select * into v_row from public.be_data_entry_parcel_details where delivery_way_id=p_delivery_way_id order by updated_at desc limit 1;
 select * into v_cs from public.be_thirdparty_cs_current_v1 where delivery_way_id=p_delivery_way_id;
 select * into v_third from public.be_thirdparty_finance_review_v1 where delivery_way_id=p_delivery_way_id;
 return jsonb_build_object(
 'ok',true,'delivery_way_id',p_delivery_way_id,'contract_ref',v_way.contract_ref,
 'contract_project',v_way.project_name,'company',v_way.company_name,
 'billing_party',v_way.bill_to,'contract_fee_mmk',v_way.agreed_fee_mmk,
 'corporate_receivable_mmk',v_way.corporate_receivable_mmk,
 'contract_recipient_fee_mmk',v_way.recipient_fee_mmk,
 'original_data_entry_cod_mmk',v_row.cod_amount,
 'actual_collect_mmk',v_row.actual_collect,
 'original_delivery_charges_mmk',v_row.delivery_charges,
 'original_net_system_delivery_charge_mmk',v_row.net_system_delivery_charge,
 'original_merchant_final_settlement_mmk',v_row.merchant_final_settlement_amount,
 'parcel_financial_validation_status',v_row.financial_validation_status,
 'cs_thirdparty_outcome',v_cs.outcome,
 'thirdparty_finance_review_status',v_third.finance_review_status,
 'corporate_finance_review_status',v_way.finance_review_status,
 'double_count_guard','Contract invoice receivable is separate and must not be automatically added to COD or merchant settlements',
 'automatic_cash_receipt',false,'automatic_settlement_posting',false);
end $fn$;
revoke all on function public.be_corporate_finance_compare_v1(text) from public,anon;
grant execute on function public.be_corporate_finance_compare_v1(text) to authenticated;
