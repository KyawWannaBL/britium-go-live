DO $patch$
DECLARE
 v_ddl text;
 v_old text := '''merchant_payable'', coalesce(sum(merchant_final_settlement_amount) filter (where settlement_eligible),0)';
 v_new text := '''merchant_payable'', coalesce(sum(merchant_final_settlement_amount) filter (where settlement_eligible and not exists (select 1 from public.be_finance_settlement_batch_items_v3 bi where bi.parcel_id = queue.parcel_id and bi.active) and not exists (select 1 from public.be_finance_settlement_parcel_control_v3 c where c.parcel_id = queue.parcel_id and coalesce(c.financial_hold,false)) and not exists (select 1 from public.be_finance_settlement_disputes_v3 d where d.parcel_id = queue.parcel_id and d.status not in (''RESOLVED'',''REJECTED'',''CLOSED''))),0)';
BEGIN
 SELECT pg_get_functiondef('public.be_finance_settlement_snapshot_v3(text,text,integer)'::regprocedure) INTO v_ddl;
 IF v_ddl IS NULL OR strpos(v_ddl,v_old)=0 THEN RAISE EXCEPTION 'Expected merchant KPI not found; no changes'; END IF;
 EXECUTE replace(v_ddl,v_old,v_new);
END $patch$;