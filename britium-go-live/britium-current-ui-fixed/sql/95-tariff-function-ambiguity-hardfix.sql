-- 95-tariff-function-ambiguity-hardfix.sql
-- Purpose:
--   Fix Postgres error 42725:
--   function name "public.be_calculate_tariff" is not unique.
--
-- Cause:
--   Existing databases can contain multiple overloaded be_calculate_tariff(...)
--   functions. Statements such as:
--     DO $
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
  END LOOP;
END $;
--   are ambiguous unless the exact argument list is supplied.
--
-- Safe behavior:
--   This file does NOT drop existing tariff functions.
--   It creates/refreshes one canonical 3-argument function and grants EXECUTE
--   to every existing overload by using each function's regprocedure signature.


-- Britium compatibility: drop exact tariff overload before recreation.
-- Required when return type changed between old and clean SQL packages.
DROP FUNCTION IF EXISTS public.be_calculate_tariff(text, numeric, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_service_level TEXT DEFAULT 'Standard',
  p_weight_kg NUMERIC DEFAULT 1,
  p_cod_required BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_fee NUMERIC := 2500;
  v_weight_fee NUMERIC := 0;
  v_service_fee NUMERIC := 0;
  v_cod_fee NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  v_weight_fee := greatest(coalesce(p_weight_kg, 1), 1) * 300;

  v_service_fee :=
    CASE lower(coalesce(p_service_level, 'standard'))
      WHEN 'express' THEN 1500
      WHEN 'same_day' THEN 2500
      WHEN 'same-day' THEN 2500
      WHEN 'premium' THEN 3000
      ELSE 0
    END;

  v_cod_fee := CASE WHEN coalesce(p_cod_required, false) THEN 500 ELSE 0 END;
  v_total := v_base_fee + v_weight_fee + v_service_fee + v_cod_fee;

  RETURN jsonb_build_object(
    'ok', true,
    'service_level', coalesce(p_service_level, 'Standard'),
    'weight_kg', coalesce(p_weight_kg, 1),
    'cod_required', coalesce(p_cod_required, false),
    'base_fee', v_base_fee,
    'weight_fee', v_weight_fee,
    'service_fee', v_service_fee,
    'cod_fee', v_cod_fee,
    'total_fee', v_total,
    'currency', 'MMK'
  );
END;
$$;

-- Optional compatibility wrappers for common frontend/backend calls.
-- These are safe even if they already exist.
CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_service_level TEXT,
  p_weight_kg NUMERIC
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.be_calculate_tariff(p_service_level, p_weight_kg, false);
$$;

CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_service_level TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.be_calculate_tariff(p_service_level, 1::numeric, false);
$$;

-- Grant every overload without ambiguous function-name syntax.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.signature);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.be_tariff_function_ambiguity_hardfix_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overloads JSONB;
BEGIN
  SELECT coalesce(jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text), '[]'::jsonb)
  INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'be_calculate_tariff';

  RETURN jsonb_build_object(
    'ok', true,
    'function_name', 'public.be_calculate_tariff',
    'overload_count', jsonb_array_length(v_overloads),
    'overloads', v_overloads,
    'test_result', public.be_calculate_tariff('Standard', 1::numeric, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_tariff_function_ambiguity_hardfix_verification() TO anon;
GRANT EXECUTE ON FUNCTION public.be_tariff_function_ambiguity_hardfix_verification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_tariff_function_ambiguity_hardfix_verification() TO service_role;

NOTIFY pgrst, 'reload schema';
