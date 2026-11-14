create or replace function private.be_oct2026_write_guard()returns trigger
language plpgsql security definer set search_path='' as $$
declare e private.be_oct2026_epoch; j jsonb; h jsonb; claims jsonb; k text; v text; link record;
begin
 select * into e from private.be_oct2026_epoch where singleton for share;
 if not e.is_active then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='TRUNCATE' then raise exception 'GO_LIVE_TRUNCATE_DISABLED' using errcode='42501';end if;
 if clock_timestamp()<e.cutoff_at then raise exception 'GO_LIVE_OPENS_AT_2026_10_20_0000_MMT' using errcode='55000';end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if session_user not in ('postgres','supabase_admin') and coalesce(claims->>'role','')<>'service_role'
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
drop trigger if exists aaa_oct2026_wallet_guard on public.wallet_accounts;
create trigger aaa_oct2026_wallet_guard before update of available_balance,pending_balance,balance or delete on public.wallet_accounts for each row execute function private.be_oct2026_write_guard();
drop trigger if exists aaa_oct2026_wallet_guard on public.be_party_wallet_accounts;
create trigger aaa_oct2026_wallet_guard before update of britium_owes,owes_britium,net_position or delete on public.be_party_wallet_accounts for each row execute function private.be_oct2026_write_guard();

