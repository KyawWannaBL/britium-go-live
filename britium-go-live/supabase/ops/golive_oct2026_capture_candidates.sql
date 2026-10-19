-- Operator-only preparation; repeatable snapshot, no operational writes.
-- Each run creates a NEW immutable-by-convention candidate manifest.
-- Not a full archive: dependency closure, independent backup and photo bytes remain required.
begin isolation level repeatable read;
set local statement_timeout='60s';
do $capture$
declare
 m uuid; t text; k text; n bigint; total bigint:=0;
 counts jsonb:='{}'; null_dates jsonb:='{}'; missing_dates bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('oct2026-candidate-capture',0));
 insert into private.be_golive_oct2026_manifests(status,review_notes)
 values('PREPARING','13-table candidate snapshot only. Dependency closure, protected-master scope, independent backup, photo bytes, client fencing and complete rollback rehearsal remain unverified. No activation.')
 returning manifest_id into m;
 foreach t in array ARRAY['be_data_entry_parcel_details','be_pickup_requests','be_wayplan_dispatches','be_portal_pickup_requests','be_cod_ledger','be_financial_settlements','be_rider_wallet_ledger','be_workforce_commission_ledger','be_accounting_manual_journal_drafts_v1','be_delivery_jobs','be_waybill_ledger','be_journal_entries','be_journal_lines'] loop
  k:=case when t='be_cod_ledger' then 'cod_id' when t='be_financial_settlements' then 'settlement_id' else 'id' end;
  if exists(select 1 from private.be_go_live_scope_registry_v2 where schema_name='public' and table_name=t and category='PROTECTED_MASTER') then
   raise exception 'Refusing protected table %',t;
  end if;
  execute format('select count(*) from public.%I where created_at is null',t) into missing_dates;
  null_dates:=null_dates||jsonb_build_object(t,missing_dates);
  execute format($q$
    insert into private.be_golive_oct2026_manifest_rows
     (manifest_id,source_schema,source_table,source_key,source_created_at,snapshot_sha256,scope_reason,financial_exception)
    select $1,'public',$2,r.%I::text,r.created_at,
     encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex'),
     case when r.created_at is null then 'CANDIDATE_NULL_DATE_REVIEW' else 'CANDIDATE_BEFORE_CUTOFF_GRAPH_INCOMPLETE' end,
     $3
    from public.%I r where r.created_at<'2026-10-19 17:30:00+00'::timestamptz or r.created_at is null
  $q$,k,t) using m,t,t in ('be_cod_ledger','be_financial_settlements','be_rider_wallet_ledger','be_workforce_commission_ledger','be_accounting_manual_journal_drafts_v1','be_journal_entries','be_journal_lines');
  get diagnostics n=row_count;
  total:=total+n;
  counts:=counts||jsonb_build_object(t,n);
  execute format($q$
   insert into private.be_golive_oct2026_row_snapshots(manifest_id,source_schema,source_table,source_key,row_data,snapshot_sha256)
   select a.manifest_id,a.source_schema,a.source_table,a.source_key,to_jsonb(r),a.snapshot_sha256
   from private.be_golive_oct2026_manifest_rows a join public.%I r on r.%I::text=a.source_key
   where a.manifest_id=$1 and a.source_table=$2
  $q$,t,k) using m,t;
  -- Rehydrate into the source composite type, without invoking source triggers or writes.
  execute format($q$
   select count(*) from private.be_golive_oct2026_row_snapshots s
   where s.manifest_id=$1 and s.source_table=$2
    and to_jsonb(jsonb_populate_record(null::public.%I,s.row_data)) is distinct from s.row_data
  $q$,t) into n using m,t;
  if n<>0 then raise exception 'Typed restore mismatch in %',t; end if;
 end loop;
 if total<>(select count(*) from private.be_golive_oct2026_row_snapshots where manifest_id=m) then
  raise exception 'Manifest/payload count mismatch';
 end if;
 update private.be_golive_oct2026_manifests
 set status='REVIEW_REQUIRED',total_candidate_rows=total,
 scope_digest=(select encode(extensions.digest(string_agg(source_schema||'.'||source_table||':'||source_key||':'||snapshot_sha256,E'\n' order by source_schema,source_table,source_key),'sha256'),'hex') from private.be_golive_oct2026_manifest_rows where manifest_id=m),
 financial_reconciliation=jsonb_build_object('status','PENDING','candidate_table_counts',counts,'null_created_at_counts',null_dates,'typed_row_roundtrip_verified',true,'independent_backup_verified',false),
 storage_reconciliation='{"status":"PENDING","proof_objects_archived":false,"backup_verified":false}'
 where manifest_id=m;
end
$capture$;
commit;
