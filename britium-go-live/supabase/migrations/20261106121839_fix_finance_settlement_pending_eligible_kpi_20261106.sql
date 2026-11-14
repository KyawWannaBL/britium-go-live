DO $patch$
DECLARE
  v_ddl text;
  v_old text := '''pending_parcels'', count(*) filter (where settlement_eligible)';
  v_new text := '''pending_parcels'', count(*) filter (where settlement_eligible and not exists (select 1 from public.be_finance_settlement_batch_items_v3 bi where bi.parcel_id = queue.parcel_id and bi.active) and not exists (select 1 from public.be_finance_settlement_parcel_control_v3 c where c.parcel_id = queue.parcel_id and coalesce(c.financial_hold,false)) and not exists (select 1 from public.be_finance_settlement_disputes_v3 d where d.parcel_id = queue.parcel_id and d.status not in (''RESOLVED'',''REJECTED'',''CLOSED'')))';
BEGIN
  SELECT pg_get_functiondef('public.be_finance_settlement_snapshot_v3(text,text,integer)'::regprocedure) INTO v_ddl;
  IF v_ddl IS NULL OR strpos(v_ddl,v_old)=0 THEN
    RAISE EXCEPTION 'Expected snapshot function expression not found; no changes made';
  END IF;
  v_ddl := replace(v_ddl,v_old,v_new);
  EXECUTE v_ddl;
END $patch$;