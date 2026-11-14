-- Administrator-only rehearsal: all archive/restore work is rolled back in a subtransaction.
create or replace function private.be_cutover_rehearse_v3(p_cutoff timestamptz,p_authorization text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids text; before_scope jsonb; before_protected jsonb; before_epoch jsonb;
 before_sequences jsonb; v_manifest jsonb; archived jsonb; restored jsonb; result jsonb;
begin
 if session_user not in('postgres','supabase_admin') then raise exception 'Database administrator required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('britium.cutover.v3',0));
 select string_agg(format('%I.%I',n.nspname,c.relname),',' order by n.nspname,c.relname)into ids
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')and
 (n.nspname='public' or(n.nspname='auth'and c.relname='users')or(n.nspname='private'and c.relname not like 'be_cutover_%'and c.relname not like 'be_oct2026_%'));
 execute 'lock table '||ids||' in share row exclusive mode';
 select jsonb_object_agg(table_name,private.be_cutover_fingerprint_v3(table_name))into before_scope from private.be_cutover_scope_v3;
 before_protected:=private.be_cutover_protected_v3();
 select to_jsonb(e)into before_epoch from private.be_oct2026_epoch e where singleton;
 select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')into before_sequences from pg_sequences where schemaname='public';
 begin
  v_manifest:=private.be_cutover_prepare_v3(p_cutoff,p_authorization);
  update private.be_cutover_batches_v3 set activation_authorized=true,evidence=jsonb_build_object(
   'dependency_consumer_review','PASS','recovery_rehearsal','PASS','active_path_security','PASS',
   'financial_policy','OWNER_ARCHIVE_ALL_WITHOUT_PAYMENT','purpose','ROLLED_BACK_REHEARSAL_ONLY_NO_ACCEPTANCE')
  where id=(v_manifest->>'batch_id')::uuid;
  archived:=private.be_cutover_archive_v3((v_manifest->>'batch_id')::uuid);
  restored:=private.be_cutover_restore_v3((v_manifest->>'batch_id')::uuid);
  result:=jsonb_build_object('status','PASS','tables',jsonb_array_length(v_manifest->'tables'),
   'archived_rows',archived->'archived_rows','rows_removed',archived->'rows_removed',
   'balance_accounts_preserved',archived->'balance_accounts_reset','restore',restored->'status',
   'archived_financial_exposure',archived->'archived_financial_exposure');
  raise exception using errcode='ZC001',message='REHEARSAL_ROLLBACK';
 exception when sqlstate 'ZC001' then null;
 end;
 if before_scope is distinct from(select jsonb_object_agg(table_name,private.be_cutover_fingerprint_v3(table_name))from private.be_cutover_scope_v3)
 or before_protected is distinct from private.be_cutover_protected_v3()
 or before_epoch is distinct from(select to_jsonb(e)from private.be_oct2026_epoch e where singleton)
 or before_sequences is distinct from(select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')from pg_sequences where schemaname='public')then
 raise exception 'REHEARSAL_STATE_CHANGED';end if;
 return result||jsonb_build_object('rolled_back',true,'source_and_protected_hashes_unchanged',true,'epoch_unchanged',true,'numbering_unchanged',true);
end $$;
revoke all on function private.be_cutover_rehearse_v3(timestamptz,text) from public,anon,authenticated,service_role;
