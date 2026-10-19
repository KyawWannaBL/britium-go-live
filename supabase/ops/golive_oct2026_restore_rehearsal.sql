begin;
set local statement_timeout='60s';
do $restore$
declare m uuid:='aba5b898-de63-4c70-8cad-c24c9aafce9b'; x record; expected bigint; actual bigint; mismatch bigint;
begin
 for x in select source_table,count(*) as n from private.be_golive_oct2026_row_snapshots where manifest_id=m group by source_table loop
  execute format('create temporary table %I (like public.%I including all) on commit drop','restore_'||x.source_table,x.source_table);
  execute format('insert into %I select (jsonb_populate_record(null::public.%I,s.row_data)).* from private.be_golive_oct2026_row_snapshots s where manifest_id=$1 and source_table=$2','restore_'||x.source_table,x.source_table) using m,x.source_table;
  execute format('select count(*) from %I','restore_'||x.source_table) into actual;
  if actual<>x.n then raise exception 'Restore count mismatch %',x.source_table; end if;
  execute format($q$select count(*) from (
    (select to_jsonb(r) as payload from %I r except all select row_data from private.be_golive_oct2026_row_snapshots where manifest_id=$1 and source_table=$2)
    union all
    (select row_data from private.be_golive_oct2026_row_snapshots where manifest_id=$1 and source_table=$2 except all select to_jsonb(r) from %I r)
   ) d$q$,'restore_'||x.source_table,'restore_'||x.source_table) into mismatch using m,x.source_table;
  if mismatch<>0 then raise exception 'Restore payload mismatch %',x.source_table; end if;
 end loop;
end $restore$;
select 'PASS: nonempty candidate tables restored into temporary copies, indexes/checks enforced, full payload multiset equal; rollback follows. Foreign keys, triggers and photo files not tested.' as verification;
rollback;