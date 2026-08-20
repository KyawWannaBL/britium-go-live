-- ============================================================
-- Britium Express: 95-tariff-function-ambiguity-fix.sql
-- Purpose:
--   Fix ERROR 42725: function name "public.be_calculate_tariff" is not unique.
--   PostgreSQL requires an argument list when GRANTing an overloaded function.
-- ============================================================

-- Canonical tariff calculator signature used by the clean Enterprise Portal.

-- Britium compatibility: drop exact tariff overload before recreation.
-- Required when return type changed between old and clean SQL packages.
DROP FUNCTION IF EXISTS public.be_calculate_tariff(text, numeric, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_tier TEXT,
  p_weight NUMERIC,
  p_highway BOOLEAN DEFAULT FALSE
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_allowance INT;
  v_base_fee INT;
  v_extra_kg INT;
  v_surcharge INT;
  v_highway_fee INT;
  v_total INT;
BEGIN
  CASE COALESCE(NULLIF(TRIM(p_tier), ''), 'Standard')
    WHEN 'Standard'   THEN v_allowance := 3; v_base_fee := 4000;
    WHEN 'Royal'      THEN v_allowance := 5; v_base_fee := 4000;
    WHEN 'Commitment' THEN v_allowance := 5; v_base_fee := 3500;
    ELSE v_allowance := 3; v_base_fee := 4000;
  END CASE;

  v_extra_kg := GREATEST(0, CEIL(GREATEST(COALESCE(p_weight, 0), 0))::INT - v_allowance);
  v_surcharge := v_extra_kg * 500;
  v_highway_fee := CASE WHEN COALESCE(p_highway, FALSE) THEN 3000 ELSE 0 END;
  v_total := v_base_fee + v_surcharge + v_highway_fee;

  RETURN json_build_object(
    'tier', COALESCE(NULLIF(TRIM(p_tier), ''), 'Standard'),
    'weight', COALESCE(p_weight, 0),
    'allowance_kg', v_allowance,
    'base_fee', v_base_fee,
    'extra_kg', v_extra_kg,
    'surcharge', v_surcharge,
    'highway_fee', v_highway_fee,
    'total_fee', v_total,
    'currency', 'MMK'
  );
END;
$$;

-- Important: always grant with the exact argument list to avoid 42725 ambiguity.
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff(TEXT, NUMERIC, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.be_tariff_function_ambiguity_verification()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'ok', to_regprocedure('public.be_calculate_tariff(text,numeric,boolean)') IS NOT NULL,
    'canonical_signature_exists', to_regprocedure('public.be_calculate_tariff(text,numeric,boolean)') IS NOT NULL,
    'overload_count', (
      SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'be_calculate_tariff'
    ),
    'signatures', (
      SELECT COALESCE(json_agg(pg_get_function_identity_arguments(p.oid) ORDER BY pg_get_function_identity_arguments(p.oid)), '[]'::json)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'be_calculate_tariff'
    ),
    'sample', public.be_calculate_tariff('Standard', 4, false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.be_tariff_function_ambiguity_verification() TO authenticated;

NOTIFY pgrst, 'reload schema';
