-- Disposable CI diagnostic only. Enumerate every missing October cutover table.
-- Fail closed: do not silently drop missing business tables from the guard scope.
DO $uat308$
DECLARE missing_count integer; missing_names text;
BEGIN
  SELECT count(*), string_agg(s.table_name, ', ' ORDER BY s.table_name)
  INTO missing_count, missing_names
  FROM private.be_oct2026_scope s
  WHERE to_regclass(format('%I.%I','public',s.table_name)) IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'UAT308: % original October isolation scope tables absent in snapshot-first replay: %',
      missing_count, missing_names;
  END IF;
  RAISE NOTICE 'UAT308: all October isolation scope relations present.';
END;
$uat308$;
