create or replace function private.be_oct2026_preserved_digest()returns jsonb
language plpgsql security definer set search_path='' as $$
declare t record;rowcount bigint;digest text;result jsonb:='{}';projection text;
begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and ((n.nspname='public' and not exists(select 1 from private.be_oct2026_scope s where s.table_name=c.relname)
   and c.relname not in ('be_golive_control','be_go_live_test_scope','be_active_test_scope_control','be_rider_app_test_control_v187'))
   or (n.nspname='auth' and c.relname='users') or (n.nspname='private' and c.relname='be_merchant_settlement_receipts_v200')) order by n.nspname,c.relname loop
  projection:='to_jsonb(x)';
  if t.relname='wallet_accounts' then projection:=projection||' - ARRAY[''available_balance'',''pending_balance'',''balance'',''updated_at'']';end if;
  if t.relname='be_party_wallet_accounts' then projection:=projection||' - ARRAY[''britium_owes'',''owes_britium'',''net_position'']';end if;
  execute format('select count(*),md5(coalesce(string_agg(h,'''' order by h),'''')) from(select md5((%s)::text) h from %I.%I x)q',projection,t.nspname,t.relname) into rowcount,digest;
  result:=result||jsonb_build_object(t.nspname||'.'||t.relname,jsonb_build_object('rows',rowcount,'digest',digest));
 end loop;
 return result;
end $$;
revoke all on function private.be_oct2026_preserved_digest() from public,anon,authenticated,service_role;

