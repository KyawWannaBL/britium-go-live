-- Britium Express Royal Express township tariff: Seikgyikanaungto.
-- Production remediation performed and verified November 18, 2026.
-- The customer-confirmed Royal charge is 5,000 MMK.
-- This is a guarded REPLAY CANDIDATE, not an automatic historical migration.
-- Do not change the existing 4,000 MMK Yangon Standard tariff.
DO $repair$
DECLARE
 v_def text;
 v_anchor text := '  if not new.is_active then';
 v_guard text := $guard$
  -- Royal catalog pricing may coexist with an existing non-Royal
  -- STANDARD finance tariff. Preserve that tariff; do not mutate its rate.
  -- The Royal partner catalog and its commission lookup use their own rate.
  IF v_existing=1 AND EXISTS (
    SELECT 1 FROM public.be_parcel_tariffs_v2 t
    WHERE t.id=v_id AND t.tariff_zone_code IS DISTINCT FROM 'ROYAL'
  ) THEN
    RETURN new;
  END IF;

$guard$;
 v_row jsonb;
BEGIN
 IF public.be_approved_tariff_lookup_key('ဆိပ်ကြီးခနောင်တို') IS DISTINCT FROM 'MMR013031'
 THEN RAISE EXCEPTION 'Unexpected township alias identity'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.be_parcel_tariffs_v2 t
   WHERE t.township='Seikgyikanaungto' AND t.customer_tier='STANDARD'
   AND t.tariff_zone_code='YANGON' AND t.base_tariff=4000
   AND t.status='ACTIVE'
 ) THEN
   RAISE EXCEPTION 'Yangon Standard baseline changed; review before replay';
 END IF;
 SELECT pg_get_functiondef('public.be_royal_tariff_finance_sync_v1()'::regprocedure) INTO v_def;
 IF position('Royal catalog pricing may coexist with an existing non-Royal' IN v_def)=0
   AND position('Royal-specific catalog pricing must not mutate an existing non-Royal' IN v_def)=0
 THEN
   IF position(v_anchor IN v_def)=0 THEN
     RAISE EXCEPTION 'Unexpected trigger definition; no change applied';
   END IF;
   EXECUTE replace(v_def,v_anchor,v_guard||v_anchor);
 END IF;
 SELECT to_jsonb(c) INTO v_row
 FROM public.be_data_entry_tariff_catalog c
 WHERE c.destination_key='ဆိပ်ကြီးခနောင်တို-royal';
 IF v_row IS NOT NULL THEN
   IF (v_row->>'provider_code') IS DISTINCT FROM 'ROYAL EXPRESS'
     OR (v_row->>'standard_rate_mmk')::numeric IS DISTINCT FROM 5000
     OR (v_row->>'is_active')::boolean IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'Existing Royal rate differs; manual review required'; END IF;
 ELSE
   IF EXISTS (
     SELECT 1 FROM public.be_data_entry_tariff_catalog c
     WHERE c.provider_code='ROYAL EXPRESS'
       AND public.be_approved_tariff_lookup_key(c.destination_name)='MMR013031'
   ) THEN RAISE EXCEPTION 'Already has alternate Royal record; manual review required'; END IF;
   INSERT INTO public.be_data_entry_tariff_catalog
     (destination_key,destination_name,original_label,standard_rate_mmk,
      provider_code,rack_code,is_active,source_file,updated_at)
   VALUES
     ('ဆိပ်ကြီးခနောင်တို-royal','ဆိပ်ကြီးခနောင်တို','ဆိပ်ကြီးခနောင်တို',
      5000,'ROYAL EXPRESS','R',true,'USER_CONFIRMED_20261118',now())
   RETURNING to_jsonb(be_data_entry_tariff_catalog.*) INTO v_row;
   INSERT INTO public.be_audit_log
     (action,table_name,record_id,old_values,new_values,performed_by,performed_at)
   VALUES
     ('ADD_ROYAL_USER_CONFIRMED','be_data_entry_tariff_catalog',
      'ဆိပ်ကြီးခနောင်တို-royal',NULL,v_row,NULL,now());
 END IF;
END $repair$;

-- Read-only checks:
-- SELECT destination_name,standard_rate_mmk,is_active
-- FROM public.be_data_entry_tariff_catalog WHERE destination_key='ဆိပ်ကြီးခနောင်တို-royal';
-- SELECT public.be_data_entry_royal_commission_v27('ဆိပ်ကြီး/ခနောင်တို');
-- Expected Royal 5,000, commission 750 (15%). Yangon Standard stays 4,000.
