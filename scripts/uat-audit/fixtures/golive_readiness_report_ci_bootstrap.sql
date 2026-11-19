-- Disposable CI only: production-catalog-verified readiness scope and report.
-- Does not execute isolation, create cutovers, or change cutoff.
CREATE TABLE IF NOT EXISTS private.be_golive_readiness_scope_v1 (
 cutover_id uuid NOT NULL REFERENCES private.be_golive_readiness_cutovers_v1(cutover_id),
 table_schema text NOT NULL DEFAULT 'public',
 table_name text NOT NULL,
 category text NOT NULL,
 row_count bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(cutover_id,table_schema,table_name)
);
ALTER TABLE private.be_golive_readiness_scope_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_golive_readiness_scope_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_go_live_readiness_isolation_report_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'ok',true,'mode','READINESS_ONLY','cutover_code',c.cutover_code,
    'cutoff_at',c.cutoff_at,'target_tables',c.target_table_count,
    'existing_tables',c.existing_table_count,'nonempty_tables',c.nonempty_table_count,
    'isolated_rows',c.isolated_row_count,'isolated_keys',c.isolated_key_count,
    'rows_updated',0,'rows_deleted',0,'statuses_changed',0,
    'master_data_untouched',true,
    'by_category',coalesce((select jsonb_object_agg(category,total order by category)
      from (select category,sum(row_count) total
            from private.be_golive_readiness_scope_v1 s
            where s.cutover_id=c.cutover_id group by category) x),'{}'::jsonb)
  )
  from private.be_golive_readiness_cutovers_v1 c
  where c.cutover_code='PRE_GOLIVE_UAT_20260901';
$function$;
REVOKE ALL ON FUNCTION public.be_go_live_readiness_isolation_report_v1() FROM PUBLIC,anon,authenticated;
