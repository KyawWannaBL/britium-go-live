
create table if not exists public.be_weight_finance_decisions_v2 (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.be_field_weight_review_requests_v1(id),
 delivery_way_id text not null,
 wayplan_id text not null,
 decision text not null check(decision in ('APPROVED','REJECTED')),
 cod_policy text not null check(cod_policy in ('KEEP_COD','UPDATE_COD','NOT_APPLICABLE')),
 old_weight_kg numeric,
 new_weight_kg numeric,
 old_cod_mmk bigint,
 calculated_cod_mmk bigint,
 approved_cod_mmk bigint,
 old_system_charge_mmk bigint,
 calculated_system_charge_mmk bigint,
 old_merchant_settlement_mmk bigint,
 approved_merchant_settlement_mmk bigint,
 financial_application text not null,
 quote jsonb,
 reason text not null,
 approved_by uuid not null,
 created_at timestamptz not null default now()
);
alter table public.be_weight_finance_decisions_v2 enable row level security;
revoke all on public.be_weight_finance_decisions_v2 from public,anon,authenticated;

create or replace function public.be_finance_weight_review_quote_v2(p_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $fn$
declare
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_request public.be_field_weight_review_requests_v1%rowtype;
 v_detail public.be_data_entry_parcel_details%rowtype;
 v_stop public.be_wayplan_dispatch_stops%rowtype;
 v_quote jsonb;
 v_is_locked boolean;
begin
 if auth.uid() is null or v_role not in ('finance','finance_manager','finance_user','accountant','superadmin','super_admin') then
  raise exception 'FINANCE_APPROVER_REQUIRED' using errcode='42501';
 end if;
 select * into v_request from public.be_field_weight_review_requests_v1
 where id=p_request_id;
 if not found then raise exception 'WEIGHT_REVIEW_NOT_FOUND'; end if;
 select * into v_detail from public.be_data_entry_parcel_details
 where delivery_way_id=v_request.delivery_way_id
 order by updated_at desc nulls last,id desc limit 1;
 if not found then raise exception 'REGISTERED_PARCEL_FINANCIALS_REQUIRED'; end if;
 select * into v_stop from public.be_wayplan_dispatch_stops
 where wayplan_id=v_request.wayplan_id and delivery_way_id=v_request.delivery_way_id
 limit 1;
 if not found then raise exception 'WAYPLAN_STOP_NOT_FOUND'; end if;
 v_quote:=public.be_calculate_parcel_financial_v2(
 v_detail.township,v_detail.customer_tier,v_detail.amount_entry_type,
 v_detail.item_price::bigint,v_detail.delivery_charges,
 v_detail.merchant_stated_total_amount,v_detail.additional_customer_charge,
 v_detail.cbm_surcharge,v_detail.other_surcharge,v_detail.merchant_payable_charges,
 v_detail.other_merchant_credits,v_request.requested_weight_kg,
 coalesce(nullif(v_detail.financial_quote->>'monthly_ways','')::integer,0));
 if v_quote->>'validation_status' not in ('OK','VALID','READY') then
  raise exception 'WEIGHT_RECALCULATION_FAILED: %',coalesce(v_quote->>'validation_message','Unknown tariff error');
 end if;
 v_is_locked:=upper(coalesce(v_stop.stop_status,'')) in ('DELIVERED','COMPLETED','RETURN_TO_WAREHOUSE','RTO')
 or coalesce(v_stop.cod_collected,0)>0 or v_stop.cod_collected_at is not null
 or upper(coalesce(v_detail.finance_status,'')) in ('SETTLED','CLOSED','PAID','COMPLETED')
 or exists(select 1 from public.be_waybill_ledger l
  where l.delivery_way_id=v_request.delivery_way_id
    and (l.cod_settled_at is not null or coalesce(l.cod_collected,0)>0));
 return jsonb_build_object(
  'ok',true,'request_id',v_request.id,'status',v_request.status,
  'delivery_way_id',v_request.delivery_way_id,
  'registered_weight_kg',v_detail.weight_kg,'requested_weight_kg',v_request.requested_weight_kg,
  'current_cod_mmk',v_detail.cod_amount,'proposed_cod_mmk',(v_quote->>'cod_amount')::bigint,
  'cod_delta_mmk',(v_quote->>'cod_amount')::bigint-coalesce(v_detail.cod_amount,0)::bigint,
  'old_system_charge_mmk',v_detail.net_system_delivery_charge,
  'new_system_charge_mmk',(v_quote->>'net_system_delivery_charge')::bigint,
  'old_weight_surcharge_mmk',v_detail.weight_surcharge,
  'new_weight_surcharge_mmk',(v_quote->>'weight_surcharge')::bigint,
  'previous_merchant_settlement_mmk',v_detail.merchant_final_settlement_amount,
  'update_cod_merchant_settlement_mmk',(v_quote->>'merchant_final_settlement_amount')::bigint,
  'keep_cod_merchant_settlement_mmk',(v_quote->>'merchant_final_settlement_amount')::bigint+
    coalesce(v_detail.cod_amount,0)::bigint-(v_quote->>'cod_amount')::bigint,
  'cash_or_settlement_locked',v_is_locked,
  'cod_change_allowed',not v_is_locked,
  'finance_review_required',true,'no_automatic_receipt_or_settlement',true,
  'tariff_calculation_version',v_quote->>'calculation_version',
  'quote',v_quote);
end $fn$;

create or replace function public.be_finance_decide_weight_review_v2(
 p_request_id uuid,p_decision text,p_cod_policy text,p_reason text
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $fn$
declare
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_request public.be_field_weight_review_requests_v1%rowtype;
 v_detail public.be_data_entry_parcel_details%rowtype;
 v_stop public.be_wayplan_dispatch_stops%rowtype;
 v_review jsonb;
 v_quote jsonb;
 v_decision text:=upper(trim(coalesce(p_decision,'')));
 v_policy text:=upper(trim(coalesce(p_cod_policy,'')));
 v_old_cod bigint;
 v_new_cod bigint;
 v_quote_cod bigint;
 v_merchant bigint;
 v_system bigint;
 v_settlement_delta bigint;
 v_application text;
begin
 if auth.uid() is null or v_role not in ('finance','finance_manager','finance_user','accountant','superadmin','super_admin') then
  raise exception 'FINANCE_APPROVER_REQUIRED' using errcode='42501';
 end if;
 if v_decision not in ('APPROVED','REJECTED') or length(trim(coalesce(p_reason,'')))<8 then
  raise exception 'FINANCE_DECISION_AND_REASON_REQUIRED';
 end if;
 if v_decision='APPROVED' and v_policy not in ('KEEP_COD','UPDATE_COD') then
  raise exception 'COD_POLICY_SELECTION_REQUIRED';
 end if;
 select * into v_request from public.be_field_weight_review_requests_v1
 where id=p_request_id for update;
 if not found or v_request.status<>'PENDING_FINANCE_REVIEW' then
  raise exception 'WEIGHT_REQUEST_NOT_PENDING';
 end if;
 select * into v_detail from public.be_data_entry_parcel_details
 where delivery_way_id=v_request.delivery_way_id
 order by updated_at desc nulls last,id desc limit 1 for update;
 if not found then raise exception 'REGISTERED_PARCEL_FINANCIALS_REQUIRED';end if;
 select * into v_stop from public.be_wayplan_dispatch_stops
 where wayplan_id=v_request.wayplan_id and delivery_way_id=v_request.delivery_way_id
 for update;
 if not found then raise exception 'WAYPLAN_STOP_NOT_FOUND';end if;
 v_old_cod:=coalesce(v_detail.cod_amount,0)::bigint;

 if v_decision='REJECTED' then
  v_application:='NO_CHANGE';
  v_policy:='NOT_APPLICABLE';
 else
  v_review:=public.be_finance_weight_review_quote_v2(p_request_id);
  v_quote:=v_review->'quote';
  v_quote_cod:=(v_review->>'proposed_cod_mmk')::bigint;
  v_system:=(v_review->>'new_system_charge_mmk')::bigint;
  if v_policy='UPDATE_COD' and not (v_review->>'cod_change_allowed')::boolean then
   raise exception 'COLLECTED_OR_CLOSED_COD_CANNOT_CHANGE_USE_KEEP_COD';
  end if;
  v_new_cod:=case when v_policy='UPDATE_COD' then v_quote_cod else v_old_cod end;
  v_merchant:=(v_quote->>'merchant_final_settlement_amount')::bigint+(v_new_cod-v_quote_cod);
  v_settlement_delta:=coalesce((v_quote->>'merchant_settlement_adjustment')::bigint,0)+(v_new_cod-v_quote_cod);
  if (v_review->>'cash_or_settlement_locked')::boolean then
   -- Immutable financial balances: record the approved amendment for a separate
   -- Finance correction, without silently rewriting delivered/collected parcels.
   v_application:='APPROVED_ADJUSTMENT_REQUIRED';
  else
   update public.be_data_entry_parcel_details set
    weight_kg=v_request.requested_weight_kg,
    chargeable_weight_kg=nullif(v_quote->>'chargeable_weight_kg','')::numeric,
    weight_surcharge=(v_quote->>'weight_surcharge')::bigint,
    gross_system_delivery_charge=(v_quote->>'gross_system_delivery_charge')::bigint,
    net_system_delivery_charge=v_system,
    cod_amount=v_new_cod,
    effective_declared_delivery_charge=(v_quote->>'effective_declared_delivery_charge')::bigint,
    merchant_settlement_adjustment=v_settlement_delta,
    settlement_direction=case when v_settlement_delta>0 then 'CREDIT_TO_MERCHANT'
       when v_settlement_delta<0 then 'DEDUCT_FROM_MERCHANT' else 'NO_ADJUSTMENT' end,
    merchant_final_settlement_amount=v_merchant,
    financial_quote=coalesce(financial_quote,'{}'::jsonb)||v_quote||
      jsonb_build_object('cod_amount',v_new_cod,
       'merchant_final_settlement_amount',v_merchant,
       'merchant_settlement_adjustment',v_settlement_delta,
       'approved_cod_policy',v_policy,
       'weight_finance_review_id',p_request_id,'finance_review_required',true,
       'calculation_version','WEIGHT_FINANCE_APPROVAL_V2'),
    financial_calculation_version='WEIGHT_FINANCE_APPROVAL_V2',
    financial_calculated_at=now(),
    financial_validation_status='OK',
    financial_validation_message='Weight recalculated with Finance-approved COD policy; settlement must be reconciled.',
    updated_at=now()
   where id=v_detail.id;
   update public.be_wayplan_dispatch_stops set
    parcel_weight_kg=v_request.requested_weight_kg,
    cod_amount=v_new_cod,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'weight_finance_review_id',p_request_id,
      'finance_approved_weight_kg',v_request.requested_weight_kg,
      'finance_approved_cod_policy',v_policy,
      'finance_approved_cod_mmk',v_new_cod,
      'finance_calculated_system_charge_mmk',v_system),
    updated_at=now()
   where id=v_stop.id;
   update public.be_waybill_ledger set
    weight_kg=v_request.requested_weight_kg,
    parcel_weight_kg=v_request.requested_weight_kg,
    cod_amount=v_new_cod,
    updated_at=now()
   where delivery_way_id=v_request.delivery_way_id
     and cod_settled_at is null and coalesce(cod_collected,0)=0;
   v_application:='PARCEL_FINANCIALS_UPDATED_PENDING_SETTLEMENT_RECONCILIATION';
  end if;
 end if;

 insert into public.be_weight_finance_decisions_v2(
 request_id,delivery_way_id,wayplan_id,decision,cod_policy,
 old_weight_kg,new_weight_kg,old_cod_mmk,calculated_cod_mmk,approved_cod_mmk,
 old_system_charge_mmk,calculated_system_charge_mmk,
 old_merchant_settlement_mmk,approved_merchant_settlement_mmk,
 financial_application,quote,reason,approved_by
 ) values(
 p_request_id,v_request.delivery_way_id,v_request.wayplan_id,v_decision,v_policy,
 v_detail.weight_kg,v_request.requested_weight_kg,v_old_cod,v_quote_cod,
 case when v_decision='REJECTED' then v_old_cod else v_new_cod end,
 v_detail.net_system_delivery_charge,v_system,
 v_detail.merchant_final_settlement_amount,v_merchant,
 v_application,v_quote,trim(p_reason),auth.uid());
 update public.be_field_weight_review_requests_v1
 set status=v_decision,reviewed_by=auth.uid(),reviewed_at=now(),
 decision_note=trim(p_reason)||' [COD_POLICY:'||v_policy||'] [APPLICATION:'||v_application||']'
 where id=p_request_id;
 return jsonb_build_object('ok',true,'request_id',p_request_id,'decision',v_decision,
 'cod_policy',v_policy,'application',v_application,
 'original_cod_mmk',v_old_cod,'approved_cod_mmk',coalesce(v_new_cod,v_old_cod),
 'new_system_charge_mmk',v_system,'approved_merchant_settlement_mmk',v_merchant,
 'payment_posted',false,'settlement_posted',false);
end $fn$;

revoke all on function public.be_finance_weight_review_quote_v2(uuid) from public,anon;
revoke all on function public.be_finance_decide_weight_review_v2(uuid,text,text,text) from public,anon;
grant execute on function public.be_finance_weight_review_quote_v2(uuid) to authenticated;
grant execute on function public.be_finance_decide_weight_review_v2(uuid,text,text,text) to authenticated;
