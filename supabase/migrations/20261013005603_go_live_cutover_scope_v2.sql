-- The root chain must preserve V20's trusted-account prerequisite even when
-- its historical migration exists only in an archived/nested source tree.
revoke insert,update,delete,truncate,references,trigger on public.be_user_account_registry from public,anon,authenticated;

-- Read-only scope checkpoint. This migration deliberately creates no cutover,
-- archive, deletion, restore or epoch writer. Incomplete paths stay BLOCKED.
create table private.be_go_live_scope_registry_v2(
 schema_name text not null,
 table_name text not null,
 category text not null check(category in ('UNCLASSIFIED','PROTECTED_MASTER','TRANSACTION_ROOT')),
 root_key text,
 reviewed_note text not null default 'Dependency and consumer review pending',
 primary key(schema_name,table_name)
);
alter table private.be_go_live_scope_registry_v2 enable row level security;
revoke all on private.be_go_live_scope_registry_v2 from public,anon,authenticated;

insert into private.be_go_live_scope_registry_v2(schema_name,table_name,category)
select n.nspname,c.relname,'UNCLASSIFIED'
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p')
 and not(n.nspname='private' and c.relname='be_go_live_scope_registry_v2');

-- Exact approved master/configuration names, never a pattern-based delete rule.
update private.be_go_live_scope_registry_v2 set category='PROTECTED_MASTER',reviewed_note='Preserve master/configuration, numbering or billing control'
where schema_name='public' and table_name in (
 'be_user_account_registry','be_mobile_workforce_accounts','be_merchants','be_merchant_profiles',
 'be_delivery_tariff_rules','be_township_master','be_branch_nodes','be_location_aliases',
 'be_chart_of_accounts','be_accounting_periods','be_mapbox_budget_month_v1','be_mapbox_geocode_cache_v1'
);
update private.be_go_live_scope_registry_v2 set category='TRANSACTION_ROOT',root_key=case table_name
 when 'be_data_entry_parcel_details' then 'delivery_way_id' when 'be_wayplan_dispatches' then 'wayplan_id' else 'pickup_id' end,
 reviewed_note='Root lookup only; linked rows, financial scope and consumers are not yet approved for isolation'
where schema_name='public' and table_name in ('be_data_entry_parcel_details','be_wayplan_dispatches','be_pickup_requests');

create function public.be_go_live_cutover_preview_v2(p_cutoff_at timestamptz,p_root_keys jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path to ''
as $$
declare
 v_entry jsonb; v_scope record; v_count bigint; v_selected integer;
 v_counts jsonb:='[]'::jsonb; v_preserved jsonb:='[]'::jsonb;
 v_blockers jsonb; v_unknown integer;
begin
 -- Fresh trusted account state; editable JWT metadata never supplies authority.
 if auth.uid() is null or not exists(select 1 from public.be_user_account_registry r
   where r.auth_user_id=auth.uid() and upper(r.role) in ('SUPERADMIN','SUPER_ADMIN')
    and coalesce(r.active,true) and coalesce(r.is_active,true)) then
  raise exception 'Active Superadmin cutover-preview permission is required' using errcode='42501';
 end if;
 if p_cutoff_at is null or p_cutoff_at>now() then raise exception 'Choose a non-future preview cutoff'; end if;
 if jsonb_typeof(p_root_keys) is distinct from 'array' or jsonb_array_length(p_root_keys)>1000 then
  raise exception 'Provide an explicit array of at most 1000 test-root keys';
 end if;
 for v_entry in select value from jsonb_array_elements(p_root_keys) loop
  if jsonb_typeof(v_entry) is distinct from 'object' or length(coalesce(v_entry->>'key','')) not between 1 and 200 then
   raise exception 'Each test root requires a supported table and nonempty key';
  end if;
  select * into v_scope from private.be_go_live_scope_registry_v2
   where schema_name='public' and table_name=v_entry->>'table' and category='TRANSACTION_ROOT';
  if not found then raise exception 'Protected or unclassified tables are not supported test roots'; end if;
  execute format('select count(*) from %I.%I r where r.%I=$1',v_scope.schema_name,v_scope.table_name,v_scope.root_key)
   into v_count using v_entry->>'key';
  if v_count<>1 then raise exception 'Explicit test root was not found uniquely'; end if;
 end loop;
 for v_scope in select * from private.be_go_live_scope_registry_v2 where category in ('TRANSACTION_ROOT','PROTECTED_MASTER') order by schema_name,table_name loop
  if to_regclass(format('%I.%I',v_scope.schema_name,v_scope.table_name)) is null then continue; end if;
  execute format('select count(*) from %I.%I',v_scope.schema_name,v_scope.table_name) into v_count;
  if v_scope.category='PROTECTED_MASTER' then
   v_preserved:=v_preserved||jsonb_build_array(jsonb_build_object('schema',v_scope.schema_name,'table',v_scope.table_name,'records',v_count));
  else
   select count(distinct value->>'key') into v_selected from jsonb_array_elements(p_root_keys) where value->>'table'=v_scope.table_name;
   v_counts:=v_counts||jsonb_build_array(jsonb_build_object('schema',v_scope.schema_name,'table',v_scope.table_name,'records',v_count,'selected_roots',v_selected,'scope_complete',false));
  end if;
 end loop;
 select count(*) into v_unknown from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 left join private.be_go_live_scope_registry_v2 r on r.schema_name=n.nspname and r.table_name=c.relname
 where n.nspname in ('public','private') and c.relkind in ('r','p')
  and not(n.nspname='private' and c.relname='be_go_live_scope_registry_v2') and (r.category is null or r.category='UNCLASSIFIED');
 v_blockers:=jsonb_build_array(jsonb_build_object('code','DEPENDENCY_SCOPE_INCOMPLETE','detail','Root counts are preliminary. Linked financial, storage, offline and active consumer paths require review.','unclassified_tables',v_unknown),
 jsonb_build_object('code','CUTOVER_ENGINE_NOT_RELEASED','detail','Atomic archive, restore and stale-client guards are not yet released. Activation is unavailable.'));
 if jsonb_array_length(p_root_keys)=0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NO_TEST_ROOTS_SELECTED','detail','Explicitly identify approved test roots; age alone does not establish test ownership.')); end if;
 return jsonb_build_object('ok',true,'mode','PREVIEW','status','BLOCKED','execution_enabled',false,'scope_complete',false,
  'manifest_hash',null,'source_epoch',null,'cutoff_at',p_cutoff_at,'table_counts',v_counts,'preserved_counts',v_preserved,
  'financial_exceptions',jsonb_build_array(jsonb_build_object('code','NOT_EVALUATED','detail','Mixed live/test and outstanding financial relationships have not been classified.')),
  'blockers',v_blockers,'gates',jsonb_build_array(
   jsonb_build_object('name','Finance acceptance','status','PENDING'),jsonb_build_object('name','Complete dependency and consumer scope','status','BLOCKED'),
   jsonb_build_object('name','Atomic isolation and recovery rehearsal','status','PENDING'),jsonb_build_object('name','Android phone/tablet acceptance','status','PENDING'),
   jsonb_build_object('name','Release/build and active-path security evidence','status','PENDING')),
  'generated_at',now(),'expires_at',now()+interval '15 minutes');
end;
$$;
revoke all on function public.be_go_live_cutover_preview_v2(timestamptz,jsonb) from public,anon;
grant execute on function public.be_go_live_cutover_preview_v2(timestamptz,jsonb) to authenticated;
