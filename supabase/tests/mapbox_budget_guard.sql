BEGIN;
DO $$
DECLARE k text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); r jsonb; claim jsonb; before_count bigint;
BEGIN
 IF has_function_privilege('authenticated','public.be_mapbox_reserve_v1(text,integer)','EXECUTE') OR has_function_privilege('anon','public.be_mapbox_claim_geocode_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'Client may bypass budget'; END IF;
 INSERT INTO public.be_mapbox_budget_month_v1(month_key) VALUES(k) ON CONFLICT DO NOTHING;
 UPDATE public.be_mapbox_budget_month_v1 SET matrix_elements=94999,reserved_usd_micros=9495000 WHERE month_key=k;
 r:=public.be_mapbox_reserve_v1('matrix',2);
 IF r->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Matrix overshoot allowed'; END IF;
 r:=public.be_mapbox_reserve_v1('matrix',1);
 IF r->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Final matrix allowance denied'; END IF;
 r:=public.be_mapbox_reserve_v1('matrix',1);
 IF r->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Matrix cap failed'; END IF;
 claim:=public.be_mapbox_claim_geocode_v1(repeat('a',64));
 IF claim->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Last paid allowance denied'; END IF;
 SELECT permanent_requests INTO before_count FROM public.be_mapbox_budget_month_v1 WHERE month_key=k;
 r:=public.be_mapbox_claim_geocode_v1(repeat('a',64));
 IF r->>'reason' IS DISTINCT FROM 'IN_FLIGHT' THEN RAISE EXCEPTION 'Duplicate geocode not blocked'; END IF;
 IF (SELECT permanent_requests FROM public.be_mapbox_budget_month_v1 WHERE month_key=k) IS DISTINCT FROM before_count THEN RAISE EXCEPTION 'Duplicate charged'; END IF;
 r:=public.be_mapbox_complete_geocode_v1(repeat('a',64),(claim->>'lease_id')::uuid,'{"features":[]}'::jsonb);
 IF r->>'stored' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Permanent cache not stored'; END IF;
 r:=public.be_mapbox_claim_geocode_v1(repeat('a',64));
 IF r->>'cached' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Permanent cache miss'; END IF;
 r:=public.be_mapbox_claim_geocode_v1(repeat('b',64));
 IF r->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Dollar limit overshoot'; END IF;
 IF EXISTS(SELECT 1 FROM public.be_mapbox_geocode_cache_v1 WHERE cache_key=repeat('b',64)) THEN RAISE EXCEPTION 'Budget denial left empty cache record'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: boundary reservations, paid cap, duplicate lease, permanent cache and server-only access; writes rolled back' result;
