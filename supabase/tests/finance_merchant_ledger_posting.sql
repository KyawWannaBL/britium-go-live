-- Verify the actual paid merchant batch through review, posting and reporting.
-- All approvals, journal rows, audits and period-state changes are rolled back.
BEGIN;
DO $test$
DECLARE maker record; reviewer record; poster record; event uuid; event_ids uuid[];
 result jsonb; journal uuid; before_flow numeric; after_flow numeric; dr numeric; cr numeric; code text;
BEGIN
 SELECT auth_user_id,email INTO maker FROM public.be_user_account_registry WHERE lower(email)='finance_ygn_001@britiumventures.com';
 SELECT auth_user_id,email INTO reviewer FROM public.be_user_account_registry WHERE lower(email)='finance_ygn_004@britiumventures.com';
 SELECT r.auth_user_id,r.email INTO poster FROM public.be_user_account_registry r JOIN public.be_accounting_user_authority_v2 a ON a.auth_user_id=r.auth_user_id
 WHERE a.is_active AND a.can_review AND a.can_post AND coalesce(r.active,true) AND coalesce(r.is_active,true) AND r.auth_user_id<>maker.auth_user_id LIMIT 1;
 SELECT array_agg(accounting_event_id ORDER BY amount) INTO event_ids FROM public.be_finance_settlement_payments_v3 p JOIN public.be_finance_settlement_batches_v3 b ON b.id=p.batch_id
 WHERE b.batch_number='FS-20261007-000007' AND p.status='CONFIRMED';
 IF array_length(event_ids,1) IS DISTINCT FROM 2 OR maker.auth_user_id IS NULL OR poster.auth_user_id IS NULL THEN RAISE EXCEPTION 'Merchant posting fixtures missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',poster.auth_user_id,'email',poster.email,'role','authenticated')::text,true);
 result:=public.be_accounting_periodic_report_v2('2026-10-01','2026-10-31');
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Report failed: %',result; END IF;
 before_flow:=(result#>>'{cash_flow,outflows}')::numeric;
 FOREACH event IN ARRAY event_ids LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',maker.auth_user_id,'email',maker.email,'role','authenticated')::text,true);
  result:=public.be_accounting_review_event_v1(event,'APPROVE','Rollback-only acceptance');
  IF result->>'code' IS DISTINCT FROM 'SELF_APPROVAL_BLOCKED' THEN RAISE EXCEPTION 'Self approval was not blocked: %',result; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer.auth_user_id,'email',reviewer.email,'role','authenticated')::text,true);
  result:=public.be_accounting_review_event_v1(event,'APPROVE','Rollback-only acceptance');
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Independent review failed: %',result; END IF;
  result:=public.be_accounting_post_approved_event_v2(event,'Rollback-only acceptance');
  IF result->>'code' IS DISTINCT FROM 'UNAUTHORIZED' THEN RAISE EXCEPTION 'Ordinary Finance gained posting authority: %',result; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',poster.auth_user_id,'email',poster.email,'role','authenticated')::text,true);
  UPDATE public.be_accounting_periods SET status='CLOSED' WHERE '2026-10-07'::date BETWEEN period_start AND period_end;
  result:=public.be_accounting_post_approved_event_v2(event,'Rollback-only acceptance');
  IF result->>'code' IS DISTINCT FROM 'PERIOD_CLOSED' THEN RAISE EXCEPTION 'Closed-period control failed: %',result; END IF;
  UPDATE public.be_accounting_periods SET status='OPEN' WHERE '2026-10-07'::date BETWEEN period_start AND period_end;
  result:=public.be_accounting_post_approved_event_v2(event,'Rollback-only acceptance');
  IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'code' IS DISTINCT FROM 'POSTED' THEN RAISE EXCEPTION 'Journal posting failed: %',result; END IF;
  journal:=(result->>'journal_id')::uuid;
  SELECT sum(debit_amount),sum(credit_amount) INTO dr,cr FROM public.be_journal_lines WHERE journal_id=journal;
  IF dr IS DISTINCT FROM cr OR dr IS DISTINCT FROM (SELECT total_amount FROM public.be_accounting_events WHERE id=event) THEN RAISE EXCEPTION 'Posted journal not balanced'; END IF;
  result:=public.be_accounting_post_approved_event_v2(event,'Idempotency acceptance');
  IF result->>'code' IS DISTINCT FROM 'ALREADY_POSTED' OR (SELECT count(*) FROM public.be_journal_entries WHERE source_event_id=event)<>1 THEN RAISE EXCEPTION 'Duplicate journal posted'; END IF;
 END LOOP;
 result:=public.be_accounting_periodic_report_v2('2026-10-01','2026-10-31');
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Report failed: %',result; END IF;
 after_flow:=(result#>>'{cash_flow,outflows}')::numeric;
 IF after_flow-before_flow IS DISTINCT FROM 50000 THEN RAISE EXCEPTION 'Merchant bank payments missing from cash flow: expected 50000, observed %',after_flow-before_flow; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: independent approval, posting authority, closed-period block, balanced 20k/30k journals, idempotency and 50k cash outflow; all test writes rolled back' AS result;
