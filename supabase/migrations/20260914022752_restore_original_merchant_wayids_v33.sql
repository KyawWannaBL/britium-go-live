-- V33: Restore original merchant-coded Delivery WayIDs for consolidated BLK imports.
-- The BLK pickup remains the container/batch identity. Each parcel keeps its original source WayID.

CREATE TABLE IF NOT EXISTS public.be_delivery_way_id_aliases_v33 (
  alias_way_id text PRIMARY KEY,
  canonical_way_id text NOT NULL,
  pickup_id text,
  parcel_sequence integer,
  merchant_code text,
  source_kind text NOT NULL DEFAULT 'CONSOLIDATED_OS_IMPORT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT be_delivery_way_id_aliases_v33_distinct_ck CHECK (upper(alias_way_id) <> upper(canonical_way_id))
);
CREATE INDEX IF NOT EXISTS idx_be_delivery_way_id_aliases_v33_canonical
  ON public.be_delivery_way_id_aliases_v33 (canonical_way_id);
CREATE INDEX IF NOT EXISTS idx_be_delivery_way_id_aliases_v33_pickup_sequence
  ON public.be_delivery_way_id_aliases_v33 (pickup_id, parcel_sequence);
ALTER TABLE public.be_delivery_way_id_aliases_v33 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.be_way_id_reconciliation_archive_v33 (
  archive_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  original_detail_id uuid NOT NULL UNIQUE,
  canonical_way_id text NOT NULL,
  replacement_pickup_id text NOT NULL,
  replacement_parcel_sequence integer NOT NULL,
  reason text NOT NULL,
  archived_row jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_way_id_reconciliation_archive_v33 ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.be_resolve_delivery_way_id(p_way_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT coalesce(
    (SELECT a.canonical_way_id
       FROM public.be_delivery_way_id_aliases_v33 a
      WHERE upper(a.alias_way_id)=upper(btrim(coalesce(p_way_id,'')))
      LIMIT 1),
    upper(nullif(btrim(coalesce(p_way_id,'')),''))
  );
$$;

CREATE OR REPLACE FUNCTION public.be_rewrite_delivery_way_aliases_jsonb(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_text text;
  v_alias record;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v_text := p_value::text;
  FOR v_alias IN
    SELECT alias_way_id,canonical_way_id
      FROM public.be_delivery_way_id_aliases_v33
     WHERE position(alias_way_id in v_text)>0
  LOOP
    v_text := replace(v_text,v_alias.alias_way_id,v_alias.canonical_way_id);
  END LOOP;
  RETURN v_text::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.be_reconcile_original_way_id_v33(
  p_pickup_id text,
  p_parcel_sequence integer,
  p_temporary_way_id text,
  p_original_way_id text,
  p_merchant_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_pickup text := upper(nullif(btrim(p_pickup_id),''));
  v_temp text := upper(nullif(btrim(p_temporary_way_id),''));
  v_original text := upper(nullif(btrim(p_original_way_id),''));
  v_current_phone text;
  v_existing record;
BEGIN
  IF v_pickup IS NULL OR coalesce(p_parcel_sequence,0)<1 OR v_temp IS NULL THEN
    RAISE EXCEPTION 'pickup, parcel sequence and temporary WayID are required';
  END IF;
  IF v_original IS NULL OR v_original !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' THEN
    RETURN v_temp;
  END IF;
  IF v_original=v_temp THEN RETURN v_original; END IF;

  IF EXISTS (SELECT 1 FROM public.parcels p WHERE upper(coalesce(p.way_id,''))=v_original AND upper(coalesce(p.way_id,''))<>v_temp) THEN
    RAISE EXCEPTION 'Original WayID % already belongs to another active parcel',v_original;
  END IF;

  SELECT regexp_replace(coalesce(d.contact_no_1,''),'[^0-9]','','g')
    INTO v_current_phone
    FROM public.be_data_entry_parcel_details d
   WHERE d.pickup_id=v_pickup
     AND d.parcel_sequence=p_parcel_sequence
     AND upper(coalesce(d.delivery_way_id,''))=v_temp
   ORDER BY d.updated_at DESC NULLS LAST,d.created_at DESC NULLS LAST
   LIMIT 1;

  FOR v_existing IN
    SELECT d.id,to_jsonb(d) AS row_json,
           regexp_replace(coalesce(d.contact_no_1,''),'[^0-9]','','g') AS phone_digits
      FROM public.be_data_entry_parcel_details d
     WHERE upper(coalesce(d.delivery_way_id,''))=v_original
       AND NOT (d.pickup_id=v_pickup AND d.parcel_sequence=p_parcel_sequence)
  LOOP
    IF coalesce(v_current_phone,'')<>'' AND coalesce(v_existing.phone_digits,'')<>'' AND v_current_phone<>v_existing.phone_digits THEN
      RAISE EXCEPTION 'Original WayID % collides with a different recipient',v_original;
    END IF;
    INSERT INTO public.be_way_id_reconciliation_archive_v33(
      original_detail_id,canonical_way_id,replacement_pickup_id,replacement_parcel_sequence,reason,archived_row
    ) VALUES (
      v_existing.id,v_original,v_pickup,p_parcel_sequence,
      'Superseded PENDING_RETRY/legacy detail reconciled to current consolidated registration',v_existing.row_json
    ) ON CONFLICT (original_detail_id) DO NOTHING;
    DELETE FROM public.be_data_entry_parcel_details WHERE id=v_existing.id;
  END LOOP;

  INSERT INTO public.be_delivery_way_id_aliases_v33(
    alias_way_id,canonical_way_id,pickup_id,parcel_sequence,merchant_code,source_kind,updated_at
  ) VALUES (
    v_temp,v_original,v_pickup,p_parcel_sequence,upper(nullif(btrim(coalesce(p_merchant_code,'')),'')),
    'CONSOLIDATED_OS_IMPORT',now()
  )
  ON CONFLICT (alias_way_id) DO UPDATE SET
    canonical_way_id=excluded.canonical_way_id,
    pickup_id=excluded.pickup_id,
    parcel_sequence=excluded.parcel_sequence,
    merchant_code=coalesce(excluded.merchant_code,public.be_delivery_way_id_aliases_v33.merchant_code),
    updated_at=now();

  UPDATE public.be_data_entry_register_rows
     SET delivery_way_id=v_original,
         raw_row=jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(raw_row,'{}'::jsonb),'{temporary_generated_way_id}',to_jsonb(v_temp),true),
               '{source_way_id}',to_jsonb(v_original),true),
             '{canonical_way_id}',to_jsonb(v_original),true),
           '{way_id}',to_jsonb(v_original),true)
   WHERE pickup_way_id=v_pickup
     AND row_no=p_parcel_sequence
     AND upper(coalesce(delivery_way_id,'')) IN (v_temp,v_original);

  UPDATE public.parcels
     SET way_id=v_original,
         tracking_code=CASE WHEN upper(coalesce(tracking_code,''))=v_temp THEN v_original ELSE tracking_code END,
         updated_at=now()
   WHERE upper(coalesce(way_id,''))=v_temp;

  UPDATE public.be_data_entry_parcel_details
     SET delivery_way_id=v_original,
         way_id=CASE WHEN upper(coalesce(way_id,''))=v_temp OR coalesce(way_id,'')='' THEN v_original ELSE way_id END,
         updated_at=now()
   WHERE pickup_id=v_pickup
     AND parcel_sequence=p_parcel_sequence
     AND upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_finance_calculation_projection_v4
     SET delivery_way_id=v_original
   WHERE upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_delivery_location_registry
     SET delivery_way_id=v_original,
         updated_at=now()
   WHERE upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.delivery_waybills
     SET delivery_way_id=v_original
   WHERE upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_data_entry_parcels
     SET delivery_way_id=v_original
   WHERE upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_large_shipment_rows
     SET delivery_way_id=v_original
   WHERE upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_wayplan_items
     SET delivery_way_id=v_original,
         tracking_no=CASE WHEN upper(coalesce(tracking_no,''))=v_temp THEN v_original ELSE tracking_no END,
         updated_at=now()
   WHERE upper(coalesce(delivery_way_id,''))=v_temp OR upper(coalesce(tracking_no,''))=v_temp;

  UPDATE public.be_wayplan_stops
     SET deliver_way_id=v_original,
         updated_at=now()
   WHERE upper(coalesce(deliver_way_id,''))=v_temp;

  UPDATE public.be_warehouse_inventory_rows
     SET way_id=v_original,
         updated_at=now()
   WHERE upper(coalesce(way_id,''))=v_temp;

  UPDATE public.be_warehouse_inventory
     SET way_id=CASE WHEN upper(coalesce(way_id,''))=v_temp THEN v_original ELSE way_id END,
         delivery_way_id=CASE WHEN upper(coalesce(delivery_way_id,''))=v_temp THEN v_original ELSE delivery_way_id END,
         updated_at=now()
   WHERE upper(coalesce(way_id,''))=v_temp OR upper(coalesce(delivery_way_id,''))=v_temp;

  UPDATE public.be_data_entry_pending_drafts
     SET snapshot=replace(snapshot::text,v_temp,v_original)::jsonb,
         updated_at=now()
   WHERE pickup_id=v_pickup
     AND parcel_sequence=p_parcel_sequence
     AND snapshot::text LIKE '%'||v_temp||'%';

  UPDATE public.be_data_entry_financial_v2_requests_v58
     SET response=public.be_rewrite_delivery_way_aliases_jsonb(response)
   WHERE response IS NOT NULL AND response::text LIKE '%'||v_temp||'%';

  RETURN v_original;
END;
$$;

DO $$
DECLARE v_def text;
BEGIN
  IF to_regprocedure('public.be_data_entry_financial_v2_save_legacy_v33(jsonb)') IS NULL THEN
    SELECT pg_get_functiondef('public.be_data_entry_financial_v2_save(jsonb)'::regprocedure) INTO v_def;
    v_def := regexp_replace(
      v_def,
      'FUNCTION public\.be_data_entry_financial_v2_save\(p_payload jsonb\)',
      'FUNCTION public.be_data_entry_financial_v2_save_legacy_v33(p_payload jsonb)',
      'i'
    );
    EXECUTE v_def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_pickup text := upper(nullif(btrim(v_payload->>'pickup_id'),''));
  v_sequence integer := CASE WHEN coalesce(v_payload->>'parcel_sequence','') ~ '^[1-9][0-9]*$' THEN (v_payload->>'parcel_sequence')::integer ELSE NULL END;
  v_temp text;
  v_source text := upper(nullif(btrim(v_payload->>'source_way_id'),''));
  v_match text[];
  v_result jsonb;
  v_moved_location integer := 0;
  v_merchant text := upper(nullif(btrim(coalesce(v_payload->>'merchant_id',v_payload->>'source_merchant_code','')),''));
BEGIN
  IF v_source IS NULL THEN
    v_match := regexp_match(coalesce(v_payload->>'remarks',''),'Way ID ([A-Za-z0-9-]+)','i');
    IF v_match IS NOT NULL THEN v_source := upper(v_match[1]); END IF;
  END IF;

  IF v_pickup IS NOT NULL AND v_sequence IS NOT NULL THEN
    v_temp := v_pickup||'-'||lpad(v_sequence::text,3,'0');
  END IF;

  IF v_pickup ~ '-BLK-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    INSERT INTO public.be_delivery_way_id_aliases_v33(alias_way_id,canonical_way_id,pickup_id,parcel_sequence,merchant_code,source_kind,updated_at)
    VALUES(v_temp,v_source,v_pickup,v_sequence,v_merchant,'CONSOLIDATED_OS_IMPORT',now())
    ON CONFLICT (alias_way_id) DO UPDATE SET canonical_way_id=excluded.canonical_way_id,pickup_id=excluded.pickup_id,parcel_sequence=excluded.parcel_sequence,merchant_code=coalesce(excluded.merchant_code,public.be_delivery_way_id_aliases_v33.merchant_code),updated_at=now();

    IF EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_source)
       AND NOT EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_temp) THEN
      UPDATE public.be_delivery_location_registry SET delivery_way_id=v_temp,updated_at=now() WHERE upper(delivery_way_id)=v_source;
      GET DIAGNOSTICS v_moved_location=ROW_COUNT;
    END IF;
  END IF;

  v_result := public.be_data_entry_financial_v2_save_legacy_v33(v_payload);

  IF coalesce((v_result->>'ok')::boolean,false) AND coalesce((v_result->>'persisted')::boolean,false)
     AND v_pickup ~ '-BLK-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);
    RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result)
      || jsonb_build_object(
           'canonical_way_id',v_source,
           'way_id',v_source,
           'server_resolution',coalesce(v_result->'server_resolution','{}'::jsonb)||jsonb_build_object(
             'canonical_way_id_source','original merchant/source WayID',
             'client_way_id_ignored',false,
             'container_pickup_id',v_pickup
           )
         );
  END IF;

  IF v_moved_location>0 THEN
    UPDATE public.be_delivery_location_registry SET delivery_way_id=v_source,updated_at=now() WHERE upper(delivery_way_id)=v_temp;
  END IF;
  RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result);
END;
$$;

DO $$
DECLARE v_def text;
BEGIN
  IF to_regprocedure('public.be_allocate_delivery_way_id_legacy_v33(text,integer)') IS NULL THEN
    SELECT pg_get_functiondef('public.be_allocate_delivery_way_id(text,integer)'::regprocedure) INTO v_def;
    v_def := regexp_replace(
      v_def,
      'FUNCTION public\.be_allocate_delivery_way_id\(p_pickup_id text, p_parcel_sequence integer\)',
      'FUNCTION public.be_allocate_delivery_way_id_legacy_v33(p_pickup_id text, p_parcel_sequence integer)',
      'i'
    );
    EXECUTE v_def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.be_allocate_delivery_way_id(p_pickup_id text,p_parcel_sequence integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_known text;
BEGIN
  SELECT a.canonical_way_id INTO v_known
    FROM public.be_delivery_way_id_aliases_v33 a
   WHERE upper(a.pickup_id)=upper(btrim(coalesce(p_pickup_id,'')))
     AND a.parcel_sequence=p_parcel_sequence
   LIMIT 1;
  IF v_known IS NOT NULL THEN RETURN v_known; END IF;
  RETURN public.be_allocate_delivery_way_id_legacy_v33(p_pickup_id,p_parcel_sequence);
END;
$$;

CREATE OR REPLACE FUNCTION public.be_warehouse_resolve_scan_v3(p_scan text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_code text := btrim(coalesce(p_scan,'')); v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM public.be_warehouse_assert_internal();
  IF v_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' THEN RAISE EXCEPTION 'Invalid waybill code'; END IF;
  v_code := public.be_resolve_delivery_way_id(v_code);
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.pickup_id,s.canonical_id),'[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT DISTINCT d.delivery_way_id AS canonical_id,d.pickup_id,
             coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) AS waybill_no
        FROM public.be_data_entry_parcel_details d
       WHERE upper(d.delivery_way_id)=upper(v_code)
          OR upper(coalesce(d.financial_quote->>'source_waybill_no',''))=upper(v_code)
    ) s;
  RETURN jsonb_build_object('matches',v_rows);
END;
$$;

WITH map AS (
  SELECT d.pickup_id,d.parcel_sequence,
         upper(d.snapshot->>'delivery_way_id') AS temp_way_id,
         upper((regexp_match(coalesce(d.snapshot->>'remarks',''),'Way ID ([A-Za-z0-9-]+)','i'))[1]) AS original_way_id,
         upper(nullif(btrim(coalesce(d.snapshot->>'sourceMerchantName','')),'')) AS merchant_code
    FROM public.be_data_entry_pending_drafts d
   WHERE d.pickup_id='P0914-BLK-275'
     AND d.snapshot->>'delivery_way_id' LIKE 'P0914-BLK-275-%'
)
INSERT INTO public.be_delivery_way_id_aliases_v33(alias_way_id,canonical_way_id,pickup_id,parcel_sequence,merchant_code,source_kind)
SELECT temp_way_id,original_way_id,pickup_id,parcel_sequence,merchant_code,'V33_PRODUCTION_RECOVERY'
  FROM map
 WHERE original_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$'
ON CONFLICT (alias_way_id) DO UPDATE SET
  canonical_way_id=excluded.canonical_way_id,pickup_id=excluded.pickup_id,parcel_sequence=excluded.parcel_sequence,
  merchant_code=coalesce(excluded.merchant_code,public.be_delivery_way_id_aliases_v33.merchant_code),updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT rr.pickup_way_id AS pickup_id,rr.row_no AS parcel_sequence,
           upper(rr.delivery_way_id) AS temp_way_id,
           upper((regexp_match(coalesce(rr.raw_row->>'remarks',''),'Way ID ([A-Za-z0-9-]+)','i'))[1]) AS original_way_id,
           rr.merchant_code
      FROM public.be_data_entry_register_rows rr
     WHERE rr.pickup_way_id='P0914-BLK-275'
       AND rr.delivery_way_id LIKE 'P0914-BLK-275-%'
     ORDER BY rr.row_no
  LOOP
    IF r.original_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' THEN
      PERFORM public.be_reconcile_original_way_id_v33(r.pickup_id,r.parcel_sequence,r.temp_way_id,r.original_way_id,r.merchant_code);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT alias_way_id,canonical_way_id,pickup_id,parcel_sequence FROM public.be_delivery_way_id_aliases_v33 WHERE pickup_id='P0914-BLK-275'
  LOOP
    UPDATE public.be_data_entry_pending_drafts
       SET snapshot=replace(snapshot::text,r.alias_way_id,r.canonical_way_id)::jsonb,updated_at=now()
     WHERE pickup_id=r.pickup_id AND parcel_sequence=r.parcel_sequence AND snapshot::text LIKE '%'||r.alias_way_id||'%';
  END LOOP;
END $$;

UPDATE public.be_data_entry_financial_v2_requests_v58
   SET response=public.be_rewrite_delivery_way_aliases_jsonb(response)
 WHERE response IS NOT NULL AND response::text LIKE '%P0914-BLK-275-%';
