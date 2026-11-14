-- Recoverable, administrator-only archive. Installation never isolates live records.
create table private.be_cutover_scope_v3(table_name text primary key);
insert into private.be_cutover_scope_v3 select table_name from private.be_oct2026_scope;
insert into private.be_cutover_scope_v3 select name from unnest(array[
 'be_branch_control_records_v1','be_branch_parcel_transfers_v1','be_branch_parcel_transfer_items_v1',
 'be_finance_cod_events_v48','be_thirdparty_finance_review_v1','be_wayplan_route_versions_v1',
 'be_wayplan_route_version_stops_v1','be_wayplan_warehouse_loading_snapshots_v1',
 'be_wayplan_stop_events_v1','be_case_visibility_control']) name
 where to_regclass(format('public.%I',name)) is not null on conflict do nothing;
insert into private.be_cutover_scope_v3 select name from unnest(array['wallet_accounts','be_party_wallet_accounts'])name where to_regclass(format('public.%I',name))is not null on conflict do nothing;
create table private.be_cutover_batches_v3(
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes',cutoff_at timestamptz not null,
 owner_authorization text not null,status text not null default 'PREPARED',manifest jsonb not null default '{}',
 evidence jsonb not null default '{}',prior_epoch jsonb,protected_digest jsonb,sequence_digest jsonb,
 activation_authorized boolean not null default false,archived_at timestamptz,restored_at timestamptz);
create table private.be_cutover_items_v3(
 batch_id uuid references private.be_cutover_batches_v3(id),table_name text,
 fingerprint jsonb not null,active_fingerprint jsonb,primary key(batch_id,table_name));
create table private.be_cutover_rows_v3(
 batch_id uuid not null,table_name text not null,ordinal bigint not null,payload jsonb not null,
 primary key(batch_id,table_name,ordinal),foreign key(batch_id,table_name)
 references private.be_cutover_items_v3(batch_id,table_name));
alter table private.be_cutover_scope_v3 enable row level security;
alter table private.be_cutover_batches_v3 enable row level security;
alter table private.be_cutover_items_v3 enable row level security;
alter table private.be_cutover_rows_v3 enable row level security;
revoke all on private.be_cutover_scope_v3,private.be_cutover_batches_v3,private.be_cutover_items_v3,private.be_cutover_rows_v3 from public,anon,authenticated,service_role;

create table private.be_cutover_retired_v3(batch_id uuid references private.be_cutover_batches_v3(id),source_table text,key_field text,key_value text,primary key(batch_id,source_table,key_field,key_value));
alter table private.be_cutover_retired_v3 enable row level security;
revoke all on private.be_cutover_retired_v3 from public,anon,authenticated,service_role;
create function private.be_cutover_finance_archive_v3(p_batch uuid)returns jsonb language sql security definer set search_path=''as $$
select jsonb_build_object('britium_owes',coalesce(sum(abs((payload->>'britium_owes')::numeric))filter(where table_name='be_party_wallet_accounts'),0),
'owes_britium',coalesce(sum(abs((payload->>'owes_britium')::numeric))filter(where table_name='be_party_wallet_accounts'),0),
'wallet_balance',coalesce(sum((payload->>'balance')::numeric)filter(where table_name='wallet_accounts'),0),
'wallet_available',coalesce(sum((payload->>'available_balance')::numeric)filter(where table_name='wallet_accounts'),0),
'wallet_pending',coalesce(sum((payload->>'pending_balance')::numeric)filter(where table_name='wallet_accounts'),0),
'wallet_projection_note','Separate overlapping projections; do not sum them as independent liabilities',
 'treatment','Outstanding historical claims retained in archive; not paid or forgiven')from private.be_cutover_rows_v3 where batch_id=p_batch and table_name in('be_party_wallet_accounts','wallet_accounts')$$;
revoke all on function private.be_cutover_finance_archive_v3(uuid)from public,anon,authenticated,service_role;

create function private.be_cutover_fingerprint_v3(p_table text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n bigint;h text;layout text;
begin
 execute format($q$select count(*),md5(coalesce(string_agg(h,'' order by h),'')) from(select md5(to_jsonb(x)::text) h from public.%I x)s$q$,p_table) into n,h;
 select md5(coalesce(string_agg(attnum||':'||attname||':'||atttypid||':'||atttypmod||':'||attgenerated::text||':'||attidentity::text,',' order by attnum),'')) into layout from pg_attribute where attrelid=format('public.%I',p_table)::regclass and attnum>0 and not attisdropped;
 return jsonb_build_object('rows',n,'hash',h,'layout',layout,'triggers',coalesce((select jsonb_object_agg(tgname,jsonb_build_object('enabled',tgenabled,'definition',pg_get_triggerdef(oid),'function_hash',md5(pg_get_functiondef(tgfoid)))) from pg_trigger where tgrelid=format('public.%I',p_table)::regclass and not tgisinternal),'{}'::jsonb),
 'constraints',coalesce((select jsonb_object_agg(conname,pg_get_constraintdef(oid)) from pg_constraint where conrelid=format('public.%I',p_table)::regclass),'{}'::jsonb));
end $$;
create function private.be_cutover_finance_v3() returns jsonb language plpgsql security definer set search_path='' as $$
declare owes numeric:=0;receivable numeric:=0;wallet numeric:=0;
begin
 if to_regclass('public.be_party_wallet_accounts') is not null then execute 'select coalesce(sum(abs(britium_owes)),0),coalesce(sum(abs(owes_britium)),0) from public.be_party_wallet_accounts' into owes,receivable;end if;
 if to_regclass('public.wallet_accounts') is not null then execute 'select coalesce(sum(abs(balance)+abs(available_balance)+abs(pending_balance)),0) from public.wallet_accounts' into wallet;end if;
 return jsonb_build_object('status',case when owes+receivable+wallet=0 then 'PASS' else 'BLOCKED' end,'britium_owes',owes,'owes_britium',receivable,'wallet_exposure',wallet,'treatment','Preserve all balances; no payment, forgiveness or opening journal is implied');
end $$;
create function private.be_cutover_protected_v3() returns jsonb language plpgsql security definer set search_path='' as $$
declare t record;result jsonb:='{}';h text;n bigint;projection text;
begin
 for t in select ns.nspname,c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where c.relkind in('r','p') and
 ((ns.nspname='public' and (not exists(select 1 from private.be_cutover_scope_v3 s where s.table_name=c.relname) or c.relname in('wallet_accounts','be_party_wallet_accounts'))) or(ns.nspname='auth' and c.relname='users') or(ns.nspname='private' and c.relname not like 'be_cutover_%' and c.relname not like 'be_oct2026_%')) order by ns.nspname,c.relname loop
 projection:='to_jsonb(x)';
 if t.relname='wallet_accounts' then projection:=projection||' - array[''balance'',''available_balance'',''pending_balance'',''updated_at'']';end if;
 if t.relname='be_party_wallet_accounts' then projection:=projection||' - array[''britium_owes'',''owes_britium'',''net_position'',''updated_at'']';end if;
 execute format($q$select count(*),md5(coalesce(string_agg(h,'' order by h),'')) from(select md5((%s)::text) h from %I.%I x)s$q$,projection,t.nspname,t.relname) into n,h;
 result:=result||jsonb_build_object(t.nspname||'.'||t.relname,jsonb_build_object('rows',n,'hash',h));end loop;return result;
end $$;
create function private.be_cutover_prepare_v3(p_cutoff timestamptz,p_authorization text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;t record;fp jsonb;tables jsonb:='[]';total bigint:=0;v_report jsonb;f jsonb;
begin
 if session_user not in('postgres','supabase_admin') then raise exception 'Database administrator required' using errcode='42501';end if;
 if p_cutoff is null or p_cutoff<=now() or nullif(btrim(p_authorization),'') is null then raise exception 'Future cutoff and explicit owner authorization required';end if;
 insert into private.be_cutover_batches_v3(cutoff_at,owner_authorization) values(p_cutoff,p_authorization) returning be_cutover_batches_v3.id into v_id;
 for t in select table_name from private.be_cutover_scope_v3 order by table_name loop
 fp:=private.be_cutover_fingerprint_v3(t.table_name);
 insert into private.be_cutover_items_v3(batch_id,table_name,fingerprint) values(v_id,t.table_name,fp);
 tables:=tables||jsonb_build_array(jsonb_build_object('table',t.table_name,'records',fp->'rows','row_hash',fp->'hash','schema_hash',fp->'layout'));
 total:=total+(fp->>'rows')::bigint;end loop;
 f:=private.be_cutover_finance_v3();
 v_report:=jsonb_build_object('batch_id',v_id,'mode','OWNER_ALL_CURRENT_TRANSACTIONS','status','PREPARED','execution_enabled',false,'cutoff_at',p_cutoff,'tables',tables,'total_rows',total,'finance',f,
 'required_evidence',jsonb_build_array('Complete dependency and consumer review','Archive/restore rehearsal','Finance opening-balance acceptance','Android phone/tablet acceptance','Release/build and active-path security evidence'),
 'manifest_hash',md5(tables::text||p_cutoff::text||p_authorization),'expires_at',now()+interval '15 minutes');
 update private.be_cutover_batches_v3 set manifest=v_report where be_cutover_batches_v3.id=v_id;return v_report;
end $$;

create function private.be_cutover_archive_v3(p_batch uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.be_cutover_batches_v3; t record;v record;ids text;all_ids text;fp jsonb;before_hash jsonb;seq jsonb;prior jsonb;v_report jsonb;cols text;archive_hash text;policy text;
begin
 if session_user not in('postgres','supabase_admin') then raise exception 'Database administrator required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('britium.cutover.v3',0));
 select * into strict b from private.be_cutover_batches_v3 where id=p_batch for update;
 if b.status<>'PREPARED' then raise exception 'MANIFEST_NOT_PREPARED';end if;
 if not b.activation_authorized then raise exception 'ACTIVATION_NOT_AUTHORIZED';end if;
 if exists(select 1 from private.be_cutover_batches_v3 where status='ACTIVE')then raise exception 'CUTOVER_ALREADY_ACTIVE';end if;
 if b.expires_at<=clock_timestamp() then raise exception 'MANIFEST_EXPIRED';end if;
 if private.be_cutover_finance_v3()->>'status'<>'PASS' and b.evidence->>'financial_policy' is distinct from 'OWNER_ARCHIVE_ALL_WITHOUT_PAYMENT' then raise exception 'FINANCE_ACCEPTANCE_REQUIRED: unresolved wallet liabilities are preserved; obtain an opening-balance treatment before isolation';end if;
 select string_agg(format('public.%I',table_name),',' order by table_name) into ids from private.be_cutover_items_v3 where batch_id=p_batch and table_name not in('wallet_accounts','be_party_wallet_accounts');
 select string_agg(format('%I.%I',n.nspname,c.relname),',' order by n.nspname,c.relname)into all_ids from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')and(n.nspname='public' or(n.nspname='auth'and c.relname='users')or(n.nspname='private'and c.relname not like 'be_cutover_%'and c.relname not like 'be_oct2026_%'));
 execute 'lock table '||all_ids||' in share row exclusive mode';
 execute 'lock table '||ids||' in access exclusive mode';
 if private.be_cutover_finance_v3()->>'status'<>'PASS' and b.evidence->>'financial_policy' is distinct from 'OWNER_ARCHIVE_ALL_WITHOUT_PAYMENT' then raise exception 'FINANCE_ACCEPTANCE_REQUIRED';end if;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 fp:=private.be_cutover_fingerprint_v3(t.table_name);if fp is distinct from t.fingerprint then raise exception 'MANIFEST_DRIFT: %',t.table_name;end if;end loop;
 if b.evidence->>'dependency_consumer_review' is distinct from 'PASS' or b.evidence->>'recovery_rehearsal' is distinct from 'PASS' or b.evidence->>'active_path_security' is distinct from 'PASS'
 or not(b.evidence ?& array['dependency_consumer_review','recovery_rehearsal','active_path_security']) then raise exception 'CUTOVER_EVIDENCE_REQUIRED';end if;
 if exists(select 1 from pg_constraint c where c.contype='f' and c.confrelid in(select format('public.%I',table_name)::regclass from private.be_cutover_items_v3 where batch_id=p_batch and table_name not in('wallet_accounts','be_party_wallet_accounts')) and c.conrelid not in(select format('public.%I',table_name)::regclass from private.be_cutover_items_v3 where batch_id=p_batch)) then raise exception 'EXTERNAL_FOREIGN_KEY_REVIEW_REQUIRED';end if;
 if exists(select 1 from pg_inherits i where i.inhrelid in(select format('public.%I',table_name)::regclass from private.be_cutover_items_v3 where batch_id=p_batch) or i.inhparent in(select format('public.%I',table_name)::regclass from private.be_cutover_items_v3 where batch_id=p_batch)) then raise exception 'PARTITION_REVIEW_REQUIRED';end if;
 if to_regprocedure('private.be_oct2026_write_guard()')is null or to_regclass('private.be_oct2026_retired_keys')is null then raise exception 'GUARD_ENGINE_NOT_AVAILABLE';end if;
 if clock_timestamp()>=b.cutoff_at then raise exception 'CUTOFF_PASSED';end if;
 before_hash:=private.be_cutover_protected_v3();select to_jsonb(e) into prior from private.be_oct2026_epoch e where singleton for update;
 select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}') into seq from pg_sequences where schemaname='public';
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 execute format('insert into private.be_cutover_rows_v3 select $1,%L,row_number() over(),to_jsonb(x) from public.%I x',t.table_name,t.table_name) using p_batch;
 if (select count(*) from private.be_cutover_rows_v3 r where r.batch_id=p_batch and r.table_name=t.table_name)<>(t.fingerprint->>'rows')::bigint then raise exception 'ARCHIVE_COUNT_MISMATCH';end if;
 select md5(coalesce(string_agg(md5(r.payload::text),'' order by md5(r.payload::text)),''))into archive_hash from private.be_cutover_rows_v3 r where r.batch_id=p_batch and r.table_name=t.table_name;
 if archive_hash is distinct from t.fingerprint->>'hash' then raise exception 'ARCHIVE_HASH_MISMATCH';end if;
 if t.table_name in('wallet_accounts','be_party_wallet_accounts')then continue;end if;
 if exists(select 1 from pg_trigger where tgrelid=format('public.%I',t.table_name)::regclass and tgname in('aaa_oct2026_guard','zzzzzz_oct2026_guard','oct2026_truncate_guard')and(tgfoid<>'private.be_oct2026_write_guard()'::regprocedure or tgenabled not in('O','A')or tgtype<>case tgname when 'aaa_oct2026_guard'then 31 when 'zzzzzz_oct2026_guard'then 21 else 34 end))then raise exception 'INVALID_EPOCH_GUARD_BINDING: %',t.table_name;end if;
 -- Only the reviewed existing epoch truncate guard can be suspended for this atomic operation.
 for v in select tgname from pg_trigger where tgrelid=format('public.%I',t.table_name)::regclass and not tgisinternal and (tgtype & 32)=32 and tgenabled<>'D' loop
 if v.tgname<>'oct2026_truncate_guard' then raise exception 'UNREVIEWED_TRUNCATE_TRIGGER: %',v.tgname;end if;
 execute format('alter table public.%I disable trigger %I',t.table_name,v.tgname);end loop;
 end loop;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch and table_name not in('wallet_accounts','be_party_wallet_accounts')loop
 insert into private.be_cutover_retired_v3 select p_batch,t.table_name,k.key,lower(btrim(k.value)) from private.be_cutover_rows_v3 r cross join lateral jsonb_each_text(r.payload)k where r.batch_id=p_batch and r.table_name=t.table_name and k.key in('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','shipment_id','parcel_id','wayplan_id','wayplan_code','route_id','manifest_id','batch_id')and nullif(btrim(k.value),'')is not null and not exists(select 1 from private.be_oct2026_retired_keys q where q.source_table=t.table_name and q.key_field=k.key and q.key_value=lower(btrim(k.value)))on conflict do nothing;
 end loop;
 insert into private.be_oct2026_retired_keys(source_table,key_field,key_value)select source_table,key_field,key_value from private.be_cutover_retired_v3 where batch_id=p_batch on conflict do nothing;
 execute 'truncate table '||ids||' continue identity restrict';
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 if t.table_name in('wallet_accounts','be_party_wallet_accounts')then
 execute format('alter table public.%I disable trigger user',t.table_name);
 if t.table_name='wallet_accounts'then execute 'update public.wallet_accounts set balance=0,available_balance=0,pending_balance=0';else execute 'update public.be_party_wallet_accounts set britium_owes=0,owes_britium=0,net_position=0';end if;
 for v in select key,value from jsonb_each(t.fingerprint->'triggers')loop execute format('alter table public.%I %s trigger %I',t.table_name,case v.value->>'enabled'when 'D'then 'disable'when 'A'then 'enable always'when 'R'then 'enable replica'else 'enable'end,v.key);end loop;
 else
 if not(t.fingerprint->'triggers'?'aaa_oct2026_guard')then execute format('create trigger aaa_oct2026_guard before insert or update or delete on public.%I for each row execute function private.be_oct2026_write_guard()',t.table_name);end if;
 if not(t.fingerprint->'triggers'?'zzzzzz_oct2026_guard')then execute format('create trigger zzzzzz_oct2026_guard after insert or update on public.%I for each row execute function private.be_oct2026_write_guard()',t.table_name);end if;
 if not(t.fingerprint->'triggers'?'oct2026_truncate_guard')then execute format('create trigger oct2026_truncate_guard before truncate on public.%I for each statement execute function private.be_oct2026_write_guard()',t.table_name);end if;
 end if;end loop;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 if t.fingerprint->'triggers' ? 'oct2026_truncate_guard' then
 execute format('alter table public.%I %s trigger oct2026_truncate_guard',t.table_name,case t.fingerprint#>>'{triggers,oct2026_truncate_guard,enabled}' when 'D' then 'disable' when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end);end if;
 fp:=private.be_cutover_fingerprint_v3(t.table_name);if t.table_name not in('wallet_accounts','be_party_wallet_accounts')and (fp->>'rows')::bigint<>0 then raise exception 'ACTIVE_DATA_REGENERATED';end if;
 update private.be_cutover_items_v3 set active_fingerprint=fp where batch_id=p_batch and table_name=t.table_name;end loop;
 if private.be_cutover_protected_v3() is distinct from before_hash then raise exception 'PROTECTED_RECORDS_CHANGED';end if;
 if seq is distinct from(select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')from pg_sequences where schemaname='public')then raise exception 'NUMBERING_CHANGED';end if;
 v_report:=b.manifest||jsonb_build_object('ok',true,'status','ACTIVE','mode','PRODUCTION_ISOLATION','archive_batch_id',p_batch,'archived_rows',b.manifest->'total_rows','rows_removed',(select coalesce(sum((fingerprint->>'rows')::bigint),0)from private.be_cutover_items_v3 where batch_id=p_batch and table_name not in('wallet_accounts','be_party_wallet_accounts')),'balance_accounts_reset',(select coalesce(sum((fingerprint->>'rows')::bigint),0)from private.be_cutover_items_v3 where batch_id=p_batch and table_name in('wallet_accounts','be_party_wallet_accounts')),'table_count',jsonb_array_length(b.manifest->'tables'),'protected_records_verified',true,'recoverable_archive',true,'production_readiness','PENDING_ACCEPTANCE','archived_financial_exposure',private.be_cutover_finance_archive_v3(p_batch),'financial_effect','ARCHIVE_ONLY_NOT_A_PAYMENT_OR_FORGIVENESS');
 update private.be_oct2026_epoch set epoch=to_char(b.cutoff_at at time zone 'Asia/Yangon','YYYY-MM-DD'),cutoff_at=b.cutoff_at,is_active=true,activated_at=clock_timestamp(),report=v_report where singleton;
 update private.be_cutover_batches_v3 set status='ACTIVE',archived_at=clock_timestamp(),prior_epoch=prior,protected_digest=before_hash,sequence_digest=seq where id=p_batch;
 return v_report;
end $$;

create function private.be_cutover_restore_v3(p_batch uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.be_cutover_batches_v3;t record;v record;ids text;all_ids text;cols text;fp jsonb;
begin
 if session_user not in('postgres','supabase_admin')then raise exception 'Database administrator required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('britium.cutover.v3',0));
 select * into strict b from private.be_cutover_batches_v3 where id=p_batch for update;
 if not exists(select 1 from private.be_oct2026_epoch where report->>'archive_batch_id'=p_batch::text)then raise exception 'RESTORE_EPOCH_OWNERSHIP_MISMATCH';end if;
 if b.status<>'ACTIVE' then raise exception 'ARCHIVE_NOT_ACTIVE';end if;
 select string_agg(format('public.%I',table_name),',' order by table_name) into ids from private.be_cutover_items_v3 where batch_id=p_batch;
 select string_agg(format('%I.%I',n.nspname,c.relname),',' order by n.nspname,c.relname)into all_ids from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')and(n.nspname='public' or(n.nspname='auth'and c.relname='users')or(n.nspname='private'and c.relname not like 'be_cutover_%'and c.relname not like 'be_oct2026_%'));
 execute 'lock table '||all_ids||' in share row exclusive mode';
 execute 'lock table '||ids||' in access exclusive mode';
 perform 1 from private.be_oct2026_epoch where singleton for update;
 if not exists(select 1 from private.be_oct2026_epoch where report->>'archive_batch_id'=p_batch::text)then raise exception 'RESTORE_EPOCH_OWNERSHIP_MISMATCH';end if;
 if private.be_cutover_protected_v3() is distinct from b.protected_digest then raise exception 'RESTORE_PROTECTED_DRIFT';end if;
 if b.sequence_digest is distinct from(select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')from pg_sequences where schemaname='public')then raise exception 'RESTORE_NUMBERING_DRIFT';end if;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 fp:=private.be_cutover_fingerprint_v3(t.table_name);
 if fp is distinct from t.active_fingerprint then raise exception 'RESTORE_ACTIVE_OR_SCHEMA_DRIFT: %',t.table_name;end if;
 for v in select tgname from pg_trigger where tgrelid=format('public.%I',t.table_name)::regclass and not tgisinternal loop execute format('alter table public.%I disable trigger %I',t.table_name,v.tgname);end loop;
 for v in select conname from pg_constraint where conrelid=format('public.%I',t.table_name)::regclass and contype='f' loop execute format('alter table public.%I alter constraint %I deferrable initially deferred',t.table_name,v.conname);end loop;
 end loop;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 if t.table_name in('wallet_accounts','be_party_wallet_accounts')then
 if t.table_name='wallet_accounts'then execute 'update public.wallet_accounts x set balance=(r.payload->>''balance'')::numeric,available_balance=(r.payload->>''available_balance'')::numeric,pending_balance=(r.payload->>''pending_balance'')::numeric from private.be_cutover_rows_v3 r where r.batch_id=$1 and r.table_name=''wallet_accounts''and x.id::text=r.payload->>''id''' using p_batch;
 else execute 'update public.be_party_wallet_accounts x set britium_owes=(r.payload->>''britium_owes'')::numeric,owes_britium=(r.payload->>''owes_britium'')::numeric,net_position=(r.payload->>''net_position'')::numeric from private.be_cutover_rows_v3 r where r.batch_id=$1 and r.table_name=''be_party_wallet_accounts''and x.id::text=r.payload->>''id''' using p_batch;end if;
 continue;end if;
 select string_agg(quote_ident(attname),',' order by attnum) into cols from pg_attribute where attrelid=format('public.%I',t.table_name)::regclass and attnum>0 and not attisdropped and attgenerated='';
 execute format('insert into public.%I(%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I,(select coalesce(jsonb_agg(payload order by ordinal),''[]''::jsonb) from private.be_cutover_rows_v3 where batch_id=$1 and table_name=$2))',t.table_name,cols,cols,t.table_name) using p_batch,t.table_name;
 end loop;
 set constraints all immediate;
 for t in select * from private.be_cutover_items_v3 where batch_id=p_batch loop
 for v in select tgname from pg_trigger where tgrelid=format('public.%I',t.table_name)::regclass and not tgisinternal and not(t.fingerprint->'triggers'?tgname)loop execute format('drop trigger %I on public.%I',v.tgname,t.table_name);end loop;
 for v in select key,value from jsonb_each(t.fingerprint->'triggers')loop execute format('alter table public.%I %s trigger %I',t.table_name,case v.value->>'enabled' when 'D' then 'disable' when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end,v.key);end loop;
 for v in select key,value from jsonb_each_text(t.fingerprint->'constraints') where value like 'FOREIGN KEY%' loop
 execute format('alter table public.%I alter constraint %I %s',t.table_name,v.key,case when v.value like '%DEFERRABLE%' and v.value not like '%NOT DEFERRABLE%' then case when v.value like '%INITIALLY DEFERRED%' then 'deferrable initially deferred' else 'deferrable initially immediate' end else 'not deferrable' end);end loop;
 if private.be_cutover_fingerprint_v3(t.table_name) is distinct from t.fingerprint then raise exception 'RESTORE_FINGERPRINT_MISMATCH: %',t.table_name;end if;
 end loop;
 if private.be_cutover_protected_v3() is distinct from b.protected_digest then raise exception 'RESTORE_PROTECTED_MISMATCH';end if;
 if b.sequence_digest is distinct from(select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')from pg_sequences where schemaname='public')then raise exception 'RESTORE_SEQUENCE_MISMATCH';end if;
 delete from private.be_oct2026_retired_keys k using private.be_cutover_retired_v3 r where r.batch_id=p_batch and k.source_table=r.source_table and k.key_field=r.key_field and k.key_value=r.key_value;
 update private.be_oct2026_epoch set epoch=b.prior_epoch->>'epoch',cutoff_at=(b.prior_epoch->>'cutoff_at')::timestamptz,is_active=(b.prior_epoch->>'is_active')::boolean,activated_at=(b.prior_epoch->>'activated_at')::timestamptz,report=b.prior_epoch->'report' where singleton;
 update private.be_cutover_batches_v3 set status='RESTORED',restored_at=clock_timestamp()where id=p_batch;
 return jsonb_build_object('ok',true,'status','RESTORED','batch_id',p_batch,'archived_rows_restored',b.manifest->'total_rows');
end $$;
revoke all on function private.be_cutover_fingerprint_v3(text),private.be_cutover_finance_v3(),private.be_cutover_protected_v3(),private.be_cutover_prepare_v3(timestamptz,text),private.be_cutover_archive_v3(uuid),private.be_cutover_restore_v3(uuid) from public,anon,authenticated,service_role;

-- Every non-administrator active writer, including server/Edge writers, must identify the new epoch.
create or replace function private.be_oct2026_write_guard()returns trigger
language plpgsql security definer set search_path='' as $$
declare e private.be_oct2026_epoch; j jsonb; h jsonb; claims jsonb; k text; v text; link record;
begin
 select * into e from private.be_oct2026_epoch where singleton for share;
 if not e.is_active then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='TRUNCATE' then raise exception 'GO_LIVE_TRUNCATE_DISABLED' using errcode='42501';end if;
 if clock_timestamp()<e.cutoff_at then raise exception 'GO_LIVE_NOT_OPEN: see the production cutoff' using errcode='55000';end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if session_user not in ('postgres','supabase_admin') and (e.epoch<>'2026-10-20' or coalesce(claims->>'role','')<>'service_role')
   and h->>'x-britium-data-epoch' is distinct from e.epoch then
  raise exception 'OBSOLETE_CLIENT_EPOCH: refresh or upgrade the application before submitting' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_table_name in ('wallet_accounts','be_party_wallet_accounts')then return new;end if;
 j:=to_jsonb(new);
 if tg_when='BEFORE' and tg_op='INSERT' and j ? 'created_at' and nullif(j->>'created_at','') is null then
  new:=jsonb_populate_record(new,jsonb_build_object('created_at',clock_timestamp()));j:=to_jsonb(new);
 end if;
 if j ? 'created_at' and nullif(j->>'created_at','') is not null and (j->>'created_at')::timestamptz<e.cutoff_at then
  raise exception 'PRE_CUTOFF_TRANSACTION_REJECTED' using errcode='22023';
 end if;
 for k,v in select key,value from jsonb_each_text(j) where key in
 ('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','shipment_id','parcel_id','wayplan_id','wayplan_code','route_id','manifest_id','batch_id') loop
  if nullif(btrim(v),'') is null then continue;end if;
  if exists(select 1 from private.be_oct2026_retired_keys r where r.key_value=lower(btrim(v)) and
    ((k='id' and r.source_table=tg_table_name and r.key_field='id') or (k<>'id' and r.key_family=private.be_oct2026_key_family(k,tg_table_name)))) then
   raise exception 'RETIRED_TRANSACTION_REJECTED: %',k using errcode='22023';
  end if;
 end loop;
 if tg_when='AFTER' then
  for link in select * from private.be_oct2026_identity_links where parent_table=tg_table_name loop
   execute format('insert into private.%I(%I) select ($1->>$2)::%s where nullif($1->>$2,'''') is not null on conflict do nothing',link.identity_table,link.parent_column,link.parent_type) using j,link.parent_column;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.be_oct2026_write_guard() from public,anon,authenticated,service_role;

-- Read-only owner status; no archive, restore or approval mutation is exposed to clients.
create function public.be_go_live_cutover_status_v3()returns jsonb language plpgsql stable security definer set search_path=''as $$
declare b private.be_cutover_batches_v3;e private.be_oct2026_epoch;
begin
 if auth.uid()is null or not exists(select 1 from public.be_user_account_registry r where r.auth_user_id=auth.uid()and upper(r.role)in('SUPERADMIN','SUPER_ADMIN')and coalesce(r.active,true)and coalesce(r.is_active,true))then raise exception 'Active Superadmin status permission required'using errcode='42501';end if;
 select * into b from private.be_cutover_batches_v3 order by (status='ACTIVE')desc,created_at desc limit 1;
 select * into e from private.be_oct2026_epoch where singleton;
 return jsonb_build_object('ok',true,'current_isolation',e.report,'plan',case when b.id is null then null else b.manifest||jsonb_build_object('status',b.status,'expires_at',b.expires_at,'technical_evidence',b.evidence,'activation_authorized',b.activation_authorized)end,
 'current_wallet_exposure',private.be_cutover_finance_v3(),'archived_financial_exposure',case when b.status='ACTIVE'then private.be_cutover_finance_archive_v3(b.id)else null end,
 'execution_enabled',false,'acceptance',jsonb_build_array(jsonb_build_object('name','Finance business acceptance','status','PENDING'),jsonb_build_object('name','Android phone/tablet acceptance','status','PENDING')));
end $$;
revoke all on function public.be_go_live_cutover_status_v3()from public,anon;
grant execute on function public.be_go_live_cutover_status_v3()to authenticated;
