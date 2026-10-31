-- Extend retired shipment business keys without changing existing key families.
create or replace function private.be_oct2026_key_family(p_field text,p_table text)returns text
language sql immutable set search_path='' as $$select case when p_field='id' then case
 when p_table in ('be_pickup_requests','be_portal_pickup_requests','be_merchant_portal_pickup_requests','pickup_requests','pickup_request','pickups','pickups_2026_04_24','pickup_intake_requests','britium_pickup_request_master')then 'pickup'
 when p_table in ('be_wayplan_dispatches','be_wayplans','be_wayplans_v25','wayplans','way_plans','be_supervisor_wayplans','be_delivery_wayplans','be_dedicated_wayplans')then 'wayplan'
 when p_table in ('shipments','shipments_2026_02_11_14_10','shipments_2026_02_17_18_40','shipments_2026_02_19_13_00','shipments_2026_02_28_20_06')then 'shipment'
 when p_table in ('parcels','parcels_2026_02_18_17_00','be_data_entry_parcel_details','be_v32_parcels')then 'parcel'
 when p_table in ('routes','routes_2026_02_19_13_00','routes_2026_02_28_20_06','route_plans_2026_02_18_17_00','be_dispatch_routes','be_wayplan_routes','delivery_routes')then 'route'
 when p_table in ('manifests','warehouse_manifests','be_warehouse_manifests')then 'manifest'
 else 'row:'||p_table end else case
 when p_field in ('pickup_id','pickup_way_id','pickup_request_id','pickup_code','pickup_waybill_id')then 'pickup'
 when p_field in ('delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','awb','awb_number','tracking_code','tracking_waybill_no','deliver_id','delivery_id','waybill_id')then 'delivery'
 when p_field in ('wayplan_id','wayplan_code')then 'wayplan'
 when p_field='shipment_id'then 'shipment' when p_field='parcel_id'then 'parcel'
 when p_field='route_id'then 'route' when p_field='manifest_id'then 'manifest'
 when p_field='batch_id'then 'batch' else 'field:'||p_field end end$$;
revoke all on function private.be_oct2026_key_family(text,text)from public,anon,authenticated,service_role;

create or replace function private.be_cutover_archive_v3(p_batch uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
 insert into private.be_cutover_retired_v3 select p_batch,t.table_name,k.key,lower(btrim(k.value)) from private.be_cutover_rows_v3 r cross join lateral jsonb_each_text(r.payload)k where r.batch_id=p_batch and r.table_name=t.table_name and k.key in('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','awb','awb_number','tracking_code','tracking_waybill_no','deliver_id','delivery_id','waybill_id','pickup_waybill_id','shipment_id','parcel_id','wayplan_id','wayplan_code','route_id','manifest_id','batch_id')and nullif(btrim(k.value),'')is not null and not exists(select 1 from private.be_oct2026_retired_keys q where q.source_table=t.table_name and q.key_field=k.key and q.key_value=lower(btrim(k.value)))on conflict do nothing;
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
 ('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','awb','awb_number','tracking_code','tracking_waybill_no','deliver_id','delivery_id','waybill_id','pickup_waybill_id','shipment_id','parcel_id','wayplan_id','wayplan_code','route_id','manifest_id','batch_id') loop
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
