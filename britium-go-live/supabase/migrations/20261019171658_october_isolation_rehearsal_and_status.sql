create or replace function private.be_rehearse_oct2026_isolation()returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;t record;n bigint;after_counts jsonb:='{}';before_preserved jsonb;after_preserved jsonb;lock_list text;
begin
 if session_user not in ('postgres','supabase_admin')then raise exception 'Database administrator required';end if;
 if exists(select 1 from private.be_oct2026_epoch where singleton and is_active)then raise exception 'Already active: destructive rehearsal disabled';end if;
 select string_agg(format('public.%I',table_name),',' order by table_name)into lock_list from private.be_oct2026_scope;
 execute 'lock table '||lock_list||' in access exclusive mode';
 before_preserved:=private.be_oct2026_preserved_digest();
 begin
  result:=private.be_activate_oct2026_isolation(true);
  raise exception using errcode='PZ001',message='ROLLBACK_REHEARSAL_ONLY';
 exception when sqlstate 'PZ001' then null;
 end;
 for t in select table_name from private.be_oct2026_scope loop
  execute format('select count(*)from public.%I',t.table_name)into n;after_counts:=after_counts||jsonb_build_object(t.table_name,n);
 end loop;
 after_preserved:=private.be_oct2026_preserved_digest();
 if after_counts is distinct from result->'table_counts' or after_preserved is distinct from before_preserved or exists(select 1 from private.be_oct2026_epoch where singleton and is_active)then raise exception 'REHEARSAL_ROLLBACK_VERIFICATION_FAILED';end if;
 return result||jsonb_build_object('mode','ROLLBACK_REHEARSAL','status','NOT_ACTIVATED','activation_rolled_back',true,'transaction_counts_restored',true,'protected_records_restored',true);
end $$;
revoke all on function private.be_rehearse_oct2026_isolation()from public,anon,authenticated,service_role;

create or replace function public.be_golive_live_cutoff_v1()returns timestamptz language sql stable security definer set search_path='' as $$
 select coalesce((select cutoff_at from private.be_oct2026_epoch where singleton and is_active),(select cutoff_at from private.be_golive_readiness_cutovers_v1 where cutover_code='PRE_GOLIVE_UAT_20260901')) $$;
create or replace function public.be_go_live_isolation_report()returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select report from private.be_oct2026_epoch where singleton and is_active),public.be_go_live_readiness_isolation_report_v1()) $$;
