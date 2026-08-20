-- Britium waybill coding helpers
-- Format: DMMDD-MERCHANT-SEQ, for example D0627-BBG-015.
-- This mirrors the requested frontend coding and can be used by backend RPCs/triggers.

BEGIN;

CREATE OR REPLACE FUNCTION public.be_waybill_merchant_code(
  p_merchant_name text DEFAULT NULL,
  p_merchant_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_name text := lower(trim(coalesce(p_merchant_name, '')));
  v_code text := upper(regexp_replace(coalesce(p_merchant_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_alpha text;
BEGIN
  IF length(v_code) >= 3 THEN
    RETURN left(v_code, 3);
  END IF;

  IF v_name LIKE '%baby genius%' THEN
    RETURN 'BBG';
  END IF;

  IF v_name LIKE '%beauty cos%' OR v_name LIKE '%bca%' THEN
    RETURN 'BCA';
  END IF;

  v_alpha := upper(regexp_replace(coalesce(p_merchant_name, ''), '[^A-Za-z]', '', 'g'));

  IF length(v_alpha) >= 3 THEN
    RETURN left(v_alpha, 3);
  END IF;

  IF length(v_alpha) > 0 THEN
    RETURN rpad(v_alpha, 3, 'X');
  END IF;

  RETURN 'XXX';
END;
$$;

CREATE OR REPLACE FUNCTION public.be_generate_waybill_id(
  p_service_date date,
  p_merchant_name text,
  p_sequence integer,
  p_merchant_code text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'D'
    || to_char(coalesce(p_service_date, current_date), 'MMDD')
    || '-'
    || public.be_waybill_merchant_code(p_merchant_name, p_merchant_code)
    || '-'
    || lpad(greatest(coalesce(p_sequence, 1), 1)::text, 3, '0');
$$;

CREATE OR REPLACE FUNCTION public.be_generate_waybill_id_from_pickup(
  p_pickup_id text,
  p_sequence integer DEFAULT 1,
  p_service_date date DEFAULT current_date,
  p_merchant_name text DEFAULT NULL,
  p_merchant_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_match text[];
BEGIN
  v_match := regexp_match(upper(trim(coalesce(p_pickup_id, ''))), '^P([0-9]{4})-([A-Z0-9]{3,})-([0-9]{3,})$');

  IF v_match IS NOT NULL THEN
    RETURN 'D' || v_match[1] || '-' || v_match[2] || '-' || lpad(greatest(coalesce(p_sequence, 1), 1)::text, 3, '0');
  END IF;

  RETURN public.be_generate_waybill_id(p_service_date, p_merchant_name, p_sequence, p_merchant_code);
END;
$$;

COMMIT;
