create or replace function private.be_activate_oct2026_isolation(p_archive_waived boolean default false)returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.be_oct2026_epoch; t record;f record;cols text;ids text;fkddl text;identity_name text;before_hash jsonb;after_hash jsonb;counts jsonb:='{}';total bigint:=0;n bigint;future_count bigint;ref_type text;child_col text;parent_col text;seq_before jsonb;seq_after jsonb;lock_list text;
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'Direct database administrator activation required' using errcode='42501';end if;
 if not p_archive_waived then raise exception 'Explicit unarchived disposal authorization required';end if;
 select * into e from private.be_oct2026_epoch where singleton;
 if e.is_active then return e.report||jsonb_build_object('already_active',true);end if;
 if clock_timestamp()>=e.cutoff_at then raise exception 'This clean-start cutover must execute before the approved cutoff; after-cutoff rows require separate review';end if;
 select string_agg(format('public.%I',table_name),',' order by table_name)into ids from private.be_oct2026_scope;
 execute 'lock table '||ids||' in access exclusive mode';
 select * into e from private.be_oct2026_epoch where singleton for update;
 if e.is_active then return e.report||jsonb_build_object('already_active',true);end if;
 select string_agg(format('%I.%I',n.nspname,c.relname),',' order by n.nspname,c.relname) into lock_list
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and
  ((n.nspname='public' and not exists(select 1 from private.be_oct2026_scope s where s.table_name=c.relname))or(n.nspname='auth' and c.relname='users')or(n.nspname='private' and c.relname='be_merchant_settlement_receipts_v200'));
 if lock_list is not null then execute 'lock table '||lock_list||' in share mode';end if;
 if clock_timestamp()>=e.cutoff_at then raise exception 'Cutoff passed while acquiring locks; aborting clean-start cutover';end if;
 if exists(select 1 from pg_inherits i where i.inhparent in(select format('public.%I',s.table_name)::regclass from private.be_oct2026_scope s)) then raise exception 'Unreviewed inheritance/partition closure';end if;
 if exists(select 1 from pg_trigger g where not g.tgisinternal and (g.tgtype & 32)=32 and g.tgname<>'oct2026_truncate_guard' and g.tgrelid in(select format('public.%I',s.table_name)::regclass from private.be_oct2026_scope s)) then raise exception 'Unreviewed TRUNCATE trigger';end if;

 if exists(select 1 from pg_trigger g join pg_proc p on p.oid=g.tgfoid where not g.tgisinternal and g.tgenabled<>'D'
 and g.tgrelid in ('public.wallet_accounts'::regclass,'public.be_party_wallet_accounts'::regclass,'public.be_golive_control'::regclass,'public.be_go_live_test_scope'::regclass,'public.be_active_test_scope_control'::regclass,'public.be_rider_app_test_control_v187'::regclass)
 and not ((g.tgname='aaa_oct2026_wallet_guard' and p.oid='private.be_oct2026_write_guard()'::regprocedure)
 or(g.tgname='wallet_accounts_set_updated_at' and md5(pg_get_functiondef(p.oid))='79453fa6d18804ac1dd00cccb044fee6')))then raise exception 'Unreviewed cutover side-effect trigger';end if;
 if to_regclass('public.vehicles_2026_02_18_17_00')is not null then
  execute 'select count(*)from public.vehicles_2026_02_18_17_00 where current_route_id is not null'into n;
  if n>0 then raise exception 'Legacy vehicle assignments require explicit clearing';end if;
 end if;
 if to_regclass('public.delivery_personnel_2026_02_18_17_00')is not null then
  execute 'select count(*)from public.delivery_personnel_2026_02_18_17_00 where current_route_id is not null'into n;
  if n>0 then raise exception 'Legacy workforce assignments require explicit clearing';end if;
 end if;
 before_hash:=private.be_oct2026_preserved_digest();
 select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}') into seq_before from pg_sequences where schemaname='public';
 for t in select s.table_name from private.be_oct2026_scope s order by s.table_name loop
  execute format('select count(*) from public.%I',t.table_name) into n;
  counts:=counts||jsonb_build_object(t.table_name,n);total:=total+n;
  if exists(select 1 from pg_attribute where attrelid=format('public.%I',t.table_name)::regclass and attname='created_at' and not attisdropped) then
   execute format('select count(*) from public.%I where created_at >= $1',t.table_name)into future_count using e.cutoff_at;
   if future_count>0 then raise exception 'Post-cutoff rows in %: %',t.table_name,future_count;end if;
  end if;
  select string_agg(quote_literal(attname),',' order by attnum) into cols from pg_attribute where attrelid=format('public.%I',t.table_name)::regclass and attnum>0 and not attisdropped and attname in
   ('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','shipment_id','parcel_id','wayplan_id','wayplan_code','route_id','manifest_id','batch_id');
  if cols is not null then
   execute format('insert into private.be_oct2026_retired_keys(source_table,key_field,key_value) select %L,k.key,lower(btrim(k.value)) from public.%I r cross join lateral jsonb_each_text(to_jsonb(r)) k where k.key in(%s) and nullif(btrim(k.value),'''') is not null on conflict do nothing',t.table_name,t.table_name,cols);
  end if;
 end loop;
 -- A permanent identity-only catalog keeps preserved historical foreign keys valid.
 -- It has no operational or financial transaction payload.
 for f in select c.*,c.conrelid::regclass as child,c.confrelid::regclass as parent,p.relname as parent_name
  from pg_constraint c join pg_class p on p.oid=c.confrelid where c.contype='f' and p.relnamespace='public'::regnamespace
   and exists(select 1 from private.be_oct2026_scope s where s.table_name=p.relname)
   and not exists(select 1 from private.be_oct2026_scope s where format('public.%I',s.table_name)::regclass=c.conrelid)
  order by c.confrelid,c.conrelid,c.conname loop
  if cardinality(f.conkey)<>1 or cardinality(f.confkey)<>1 then raise exception 'Composite historical FK requires review: %',f.conname;end if;
  select attname into child_col from pg_attribute where attrelid=f.conrelid and attnum=f.conkey[1];
  select attname,format_type(atttypid,atttypmod)into parent_col,ref_type from pg_attribute where attrelid=f.confrelid and attnum=f.confkey[1];
  identity_name:='be_oct2026_identity_'||substr(md5(f.parent_name||'.'||parent_col),1,16);
  execute format('create table if not exists private.%I(%I %s primary key)',identity_name,parent_col,ref_type);
  execute format('alter table private.%I enable row level security',identity_name);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',identity_name);
  execute format('insert into private.%I select %I from public.%I where %I is not null on conflict do nothing',identity_name,parent_col,f.parent_name,parent_col);
  insert into private.be_oct2026_identity_links values(f.parent_name,parent_col,identity_name,ref_type)on conflict do nothing;
  insert into private.be_oct2026_fk_history values(f.child::text,f.conname,pg_get_constraintdef(f.oid),identity_name)on conflict do nothing;
  fkddl:=pg_get_constraintdef(f.oid);
  -- Preserve key columns and delete/update actions; defer audit checks until identity mirroring finishes.
  fkddl:=regexp_replace(fkddl,'REFERENCES [^ (]+','REFERENCES private.'||quote_ident(identity_name));
  fkddl:=regexp_replace(fkddl,' DEFERRABLE( INITIALLY (DEFERRED|IMMEDIATE))?','');
  fkddl:=regexp_replace(fkddl,' NOT DEFERRABLE','');
  execute format('alter table %s drop constraint %I',f.child,f.conname);
  execute format('alter table %s add constraint %I %s DEFERRABLE INITIALLY DEFERRED',f.child,f.conname,fkddl);
 end loop;
 -- One RESTRICT operation covers internal FK cycles. No CASCADE, sequence reset or DELETE-trigger side effects.
 execute 'truncate table '||ids||' continue identity restrict';
 for t in select table_name from private.be_oct2026_scope loop
  execute format('select count(*) from public.%I',t.table_name)into n;
  if n<>0 then raise exception 'Table not empty after cutover: %',t.table_name;end if;
 end loop;
 update public.wallet_accounts set available_balance=0,pending_balance=0,balance=0;
 update public.be_party_wallet_accounts set britium_owes=0,owes_britium=0,net_position=0;
 delete from public.be_golive_control where key='active_test_scope';
 update public.be_go_live_test_scope set active=false,updated_at=clock_timestamp() where active;
 update public.be_active_test_scope_control set is_active=false,updated_at=clock_timestamp()where is_active;
 insert into public.be_rider_app_test_control_v187(singleton,started_at,note,updated_at)values(true,e.cutoff_at,'Production epoch 2026-10-20; obsolete assignments isolated.',clock_timestamp())on conflict(singleton)do update set started_at=excluded.started_at,note=excluded.note,updated_at=excluded.updated_at;

 set constraints all immediate;
 for t in select table_name from private.be_oct2026_scope loop
  execute format('select count(*) from public.%I',t.table_name)into n;
  if n<>0 then raise exception 'Transactions regenerated during cutover: %',t.table_name;end if;
 end loop;
 after_hash:=private.be_oct2026_preserved_digest();
 if before_hash is distinct from after_hash then raise exception 'PROTECTED_DATA_CHANGED' using detail=(select string_agg(k,',')from jsonb_each(before_hash)b(k,v)where v is distinct from after_hash->k);end if;
 select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}')into seq_after from pg_sequences where schemaname='public';
 if seq_before is distinct from seq_after then raise exception 'NUMBERING_SEQUENCE_CHANGED';end if;
 update private.be_oct2026_epoch set is_active=true,activated_at=clock_timestamp(),report=jsonb_build_object(
  'ok',true,'status','ACTIVE','mode','PRODUCTION_ISOLATION','epoch',e.epoch,'cutoff_at',e.cutoff_at,'rows_removed',total,'table_count',(select count(*)from private.be_oct2026_scope),'table_counts',counts,
  'protected_records_verified',true,'protected_table_count',(select count(*) from jsonb_object_keys(before_hash)),'numbering_preserved',true,'unarchived_disposal_authorized',true,'activated_at',clock_timestamp())where singleton returning * into e;
 return e.report;
end $$;
revoke all on function private.be_activate_oct2026_isolation(boolean) from public,anon,authenticated,service_role;


