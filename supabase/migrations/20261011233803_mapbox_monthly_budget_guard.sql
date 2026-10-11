-- US$10 authorized; US$9.50 application allowance leaves a US$0.50 buffer.
-- Rates verified in kyaw-wanna's console: permanent geocoding $5/1000.
-- Matrix/Directions are stopped at 95,000 units, below standard free tiers.
CREATE TABLE public.be_mapbox_budget_month_v1 (
 month_key text PRIMARY KEY CHECK (month_key ~ '^\d{4}-\d{2}$'),
 matrix_elements bigint NOT NULL DEFAULT 0 CHECK(matrix_elements>=0),
 directions_requests bigint NOT NULL DEFAULT 0 CHECK(directions_requests>=0),
 permanent_requests bigint NOT NULL DEFAULT 0 CHECK(permanent_requests>=0),
 reserved_usd_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_usd_micros>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_mapbox_budget_month_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_mapbox_budget_month_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.be_mapbox_budget_month_v1 TO service_role;

CREATE TABLE public.be_mapbox_geocode_cache_v1 (
 cache_key text PRIMARY KEY CHECK(cache_key ~ '^[0-9a-f]{64}$'),
 payload jsonb,
 lease_id uuid,
 lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_mapbox_geocode_cache_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_mapbox_geocode_cache_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.be_mapbox_geocode_cache_v1 TO service_role;

-- Observed current billing-period usage before guard rollout, not a zero reset.
INSERT INTO public.be_mapbox_budget_month_v1(month_key,matrix_elements,permanent_requests,reserved_usd_micros)
VALUES('2026-10',48,104,520000) ON CONFLICT DO NOTHING;

CREATE FUNCTION public.be_mapbox_reserve_v1(p_service text,p_units integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE k text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); b public.be_mapbox_budget_month_v1%rowtype; cost bigint;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_units IS NULL OR p_units<1 OR p_units>10000 OR p_service IS NULL OR p_service NOT IN ('matrix','directions','permanent_geocoding') THEN RAISE EXCEPTION 'Invalid usage reservation'; END IF;
 INSERT INTO public.be_mapbox_budget_month_v1(month_key) VALUES(k) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.be_mapbox_budget_month_v1 WHERE month_key=k FOR UPDATE;
 cost:=CASE WHEN p_service='permanent_geocoding' THEN p_units::bigint*5000 ELSE 0 END;
 IF (p_service='matrix' AND b.matrix_elements+p_units>95000)
 OR (p_service='directions' AND b.directions_requests+p_units>95000)
 OR b.reserved_usd_micros+cost>9500000 THEN
  RETURN jsonb_build_object('allowed',false,'reason','MONTHLY_LIMIT','month',k);
 END IF;
 UPDATE public.be_mapbox_budget_month_v1 SET
 matrix_elements=matrix_elements+CASE WHEN p_service='matrix' THEN p_units ELSE 0 END,
 directions_requests=directions_requests+CASE WHEN p_service='directions' THEN p_units ELSE 0 END,
 permanent_requests=permanent_requests+CASE WHEN p_service='permanent_geocoding' THEN p_units ELSE 0 END,
 reserved_usd_micros=reserved_usd_micros+cost,updated_at=now() WHERE month_key=k;
 RETURN jsonb_build_object('allowed',true,'reason','RESERVED','month',k,'reserved_units',p_units,'reserved_usd_micros',b.reserved_usd_micros+cost);
END $$;
REVOKE ALL ON FUNCTION public.be_mapbox_reserve_v1(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_mapbox_reserve_v1(text,integer) TO service_role;

CREATE FUNCTION public.be_mapbox_claim_geocode_v1(p_cache_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE c public.be_mapbox_geocode_cache_v1%rowtype; reservation jsonb; lease uuid;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_cache_key IS NULL OR p_cache_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid cache key'; END IF;
 INSERT INTO public.be_mapbox_geocode_cache_v1(cache_key) VALUES(p_cache_key) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM public.be_mapbox_geocode_cache_v1 WHERE cache_key=p_cache_key FOR UPDATE;
 IF c.payload IS NOT NULL THEN RETURN jsonb_build_object('cached',true,'payload',c.payload); END IF;
 IF c.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('allowed',false,'reason','IN_FLIGHT'); END IF;
 reservation:=public.be_mapbox_reserve_v1('permanent_geocoding',1);
 IF reservation->>'allowed' IS DISTINCT FROM 'true' THEN
  DELETE FROM public.be_mapbox_geocode_cache_v1 WHERE cache_key=p_cache_key AND payload IS NULL;
  RETURN reservation;
 END IF;
 lease:=gen_random_uuid();
 UPDATE public.be_mapbox_geocode_cache_v1 SET lease_id=lease,lease_until=clock_timestamp()+interval '30 seconds',updated_at=now() WHERE cache_key=p_cache_key;
 RETURN jsonb_build_object('allowed',true,'lease_id',lease);
END $$;
REVOKE ALL ON FUNCTION public.be_mapbox_claim_geocode_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_mapbox_claim_geocode_v1(text) TO service_role;

CREATE FUNCTION public.be_mapbox_complete_geocode_v1(p_cache_key text,p_lease_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Server only'; END IF;
 IF jsonb_typeof(p_payload->'features') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid geocoding payload'; END IF;
 UPDATE public.be_mapbox_geocode_cache_v1 SET payload=p_payload,lease_until=NULL,updated_at=now()
 WHERE cache_key=p_cache_key AND lease_id=p_lease_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('stored',n=1);
END $$;
REVOKE ALL ON FUNCTION public.be_mapbox_complete_geocode_v1(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_mapbox_complete_geocode_v1(text,uuid,jsonb) TO service_role;
