
-- Drop only the custom business logic trigger
DROP TRIGGER IF EXISTS auto_approve_on_insert_trigger ON public.shipments;
DROP TRIGGER IF EXISTS trg_auto_approve_on_insert ON public.shipments;
DROP TRIGGER IF EXISTS auto_approve_shipment ON public.shipments;

-- Find and drop any trigger calling auto_approve_on_insert
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT tg.tgname
    FROM pg_trigger tg
    JOIN pg_class c ON tg.tgrelid = c.oid
    JOIN pg_proc p ON tg.tgfoid = p.oid
    WHERE c.relname = 'shipments'
      AND NOT tg.tgisinternal
      AND p.proname = 'auto_approve_on_insert'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.shipments', rec.tgname);
    RAISE NOTICE 'Dropped trigger %', rec.tgname;
  END LOOP;
END $$;
