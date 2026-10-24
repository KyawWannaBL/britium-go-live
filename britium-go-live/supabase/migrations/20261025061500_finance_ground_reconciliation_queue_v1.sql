-- Read-only Finance reconciliation staging. Does not post receipts or settle parcels.
create or replace function public.be_finance_ground_reconciliation_queue_v1(p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path=public,private,auth,pg_temp as $$
declare v_rows jsonb;v_role text;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('finance','finance_manager','accountant','superadmin','super_admin') then
   return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sheet_date,x.delivery_way_id),'[]'::jsonb)
 into v_rows from (
   select m.sheet_date,m.delivery_way_id,m.final_cod_mmk as reported_final_cod,
     m.cash_mmk as reported_cash,m.kpay_mmk as reported_kpay,
     m.source_sheet,m.source_row,
     case when m.final_cod_mmk is null then 'MISSING_COD'
       when coalesce(m.cash_mmk,0)+coalesce(m.kpay_mmk,0)<>m.final_cod_mmk then 'SPLIT_MISMATCH'
       when w.delivery_way_id is null then 'WAY_ID_NOT_MATCHED'
       when w.metadata->>'reconciliation_review_state'='REVIEW_HOLD' then 'REVIEW_HOLD'
       else 'PENDING_FINANCE_VERIFICATION' end as review_state,
     w.cod_collected as ledger_recorded_cod,w.settlement_status as ledger_settlement_status
   from private.be_oct2026_external_settlement_manifest m
   left join lateral (
      select delivery_way_id,cod_collected,settlement_status,metadata
      from public.be_wayplan_cod_settlements s
      where s.delivery_way_id=m.delivery_way_id order by s.created_at desc limit 1
   ) w on true
   order by m.sheet_date,m.delivery_way_id
   limit least(greatest(coalesce(p_limit,500),1),1000)
 ) x;
 return jsonb_build_object('ok',true,'mode','UNVERIFIED_STAGING','rows',v_rows);
end $$;
revoke all on function public.be_finance_ground_reconciliation_queue_v1(integer) from public;
grant execute on function public.be_finance_ground_reconciliation_queue_v1(integer) to authenticated;
