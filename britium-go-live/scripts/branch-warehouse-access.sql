-- Existing HQ Warehouse procedures remain canonical; branch identities gain scoped entrypoints.
create or replace function public.be_branch_warehouse_scope_v1(p_write boolean default false)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return null;end if;
 return public.be_branch_department_scope_v1(null,p_write);
end $$;
create or replace function public.be_branch_warehouse_visible_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false);
begin
 if b is null then return true;end if;
 return exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=p_way and (
  exists(select 1 from public.be_portal_pickup_requests p where p.pickup_id=d.pickup_id and upper(p.branch_code)=b)
  or exists(select 1 from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 t on t.id=i.transfer_id where i.delivery_way_id=d.delivery_way_id and b in(t.from_branch,t.to_branch))
  or exists(select 1 from public.be_wayplan_membership_v40 m join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id where m.delivery_way_id=d.delivery_way_id and upper(w.branch_code)=b)
 ));
end $$;
create or replace function public.be_branch_warehouse_local_receipt_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false);
begin
 if b is null then return true;end if;
 return public.be_branch_parcel_at_v1(p_way,b) and exists(select 1 from public.be_warehouse_receipts_v36 r where r.delivery_way_id=p_way and upper(r.warehouse_code)=b||'-MAIN' and r.scanned_at is not null and r.scanned_at>=coalesce((select max(i.received_at) from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 t on t.id=i.transfer_id where i.delivery_way_id=p_way and t.to_branch=b),'-infinity'::timestamptz));
end $$;
revoke all on function public.be_branch_warehouse_local_receipt_v1(text) from public,anon,authenticated;
create or replace function public.be_branch_warehouse_require_way_v1(p_way text,p_operation text)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(true); w text:=upper(btrim(p_way));
begin
 if b is null then return null;end if;
 -- Same parcel lock as transfer creation: custody cannot move while a scan is committed.
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=w for update;
 if not found or not public.be_branch_parcel_at_v1(w,b) then raise exception 'BRANCH_CUSTODY_DENIED: acknowledge received interbranch parcels before scanning or staging' using errcode='42501';end if;
 if p_operation in('READY','DISPATCH','RETURN','RECEIPT_EDIT') and not public.be_branch_warehouse_local_receipt_v1(w) then raise exception 'LOCAL_RECEIPT_REQUIRED: scan this parcel into the receiving branch warehouse first';end if;
 if p_operation='DISPATCH' and not exists(select 1 from public.be_wayplan_membership_v40 m join public.be_wayplan_dispatches d on d.wayplan_id=m.wayplan_id where m.delivery_way_id=w and upper(d.branch_code)=b and exists(select 1 from public.be_wayplan_review_v43 rv where rv.wayplan_id=d.wayplan_id and rv.review_status='DISPATCH_READY') and m.membership_status='READY_FOR_DISPATCH' and upper(coalesce(d.wayplan_status,'')) not in('CANCELLED','COMPLETED')) then raise exception 'BRANCH_DISPATCH_WAYPLAN_REQUIRED';end if;
 return b;
end $$;
create or replace function public.be_branch_warehouse_resolve_v1(p_scan text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false); raw text:=upper(btrim(coalesce(p_scan,''))); matches jsonb; exact boolean;
begin
 if b is null then raise exception 'BRANCH_SCANNER_ONLY';end if;
 if raw !~ '^[A-Z0-9][A-Z0-9._-]{0,127}$' then return jsonb_build_object('ok',false,'error','INVALID_SCAN','message','Scan a canonical Delivery Way or source Way ID.');end if;
 select exists(select 1 from be_data_entry_parcel_details d where upper(d.delivery_way_id)=raw and public.be_branch_warehouse_visible_v1(d.delivery_way_id)) into exact;
 select coalesce(jsonb_agg(jsonb_build_object('canonical_id',d.delivery_way_id,'pickup_id',d.pickup_id,'waybill_no',coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id),'display_id',coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)) order by d.delivery_way_id),'[]') into matches
 from be_data_entry_parcel_details d where coalesce(d.parcel_status,'')<>'duplicate_archived' and public.be_branch_warehouse_visible_v1(d.delivery_way_id) and(
  (exact and upper(d.delivery_way_id)=raw) or(not exact and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=raw)
 );
 return jsonb_build_object('ok',jsonb_array_length(matches)>0,'matches',matches,'resolved_candidate_count',jsonb_array_length(matches),'error',case when jsonb_array_length(matches)=0 then 'WAYBILL_NOT_FOUND' end,'message',case when jsonb_array_length(matches)=0 then 'No related branch Way ID was found.' end,'branch_code',b);
end $$;
create or replace function public.be_branch_warehouse_fast_dispatch_v1(p_scan text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare found jsonb:=public.be_branch_warehouse_resolve_v1(p_scan); way text; b text; result jsonb;
begin
 if found->>'ok'<>'true' then return found;end if;
 if jsonb_array_length(found->'matches')<>1 then return found||jsonb_build_object('ok',false,'error','AMBIGUOUS_SCAN','message','Choose the canonical parcel before dispatch scanning.');end if;
 way:=found#>>'{matches,0,canonical_id}';b:=public.be_branch_warehouse_require_way_v1(way,'DISPATCH');
 result:=public.be_warehouse_dispatch_scan(way,public.be_warehouse_actor_email(),b||'-MAIN');
 return result||jsonb_build_object('canonical_id',way,'waybill_no',found#>>'{matches,0,waybill_no}','resolved_candidate_count',1,'branch_code',b);
end $$;
create or replace function public.be_branch_warehouse_rto_confirmed_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare outcome text;
begin
 if not public.be_branch_warehouse_visible_v1(p_way) then return false;end if;
 select upper(last_status) into outcome from be_delivery_attempt_state_v39 where delivery_way_id=p_way limit 1;
 if nullif(outcome,'') is not null then return outcome in('RTO','RETURN_TO_SENDER');end if;
 select upper(delivery_status) into outcome from be_dispatch_job_assignments where tracking_no=p_way order by updated_at desc nulls last limit 1;
 if nullif(outcome,'') is not null then return outcome in('RTO','RETURN_TO_SENDER');end if;
 select upper(coalesce(nullif(stop_status,''),nullif(rider_status,''),nullif(dispatch_status,''))) into outcome from be_wayplan_dispatch_stops where delivery_way_id=p_way order by updated_at desc nulls last,created_at desc nulls last limit 1;
 return coalesce(outcome in('RTO','RETURN_TO_SENDER'),false);
end $$;
revoke all on function public.be_branch_warehouse_scope_v1(boolean),public.be_branch_warehouse_visible_v1(text),public.be_branch_warehouse_require_way_v1(text,text),public.be_branch_warehouse_resolve_v1(text),public.be_branch_warehouse_fast_dispatch_v1(text),public.be_branch_warehouse_rto_confirmed_v1(text) from public,anon,authenticated;

-- Guarded rewrites preserve the live Warehouse implementation and every existing HQ gate.
do $branch_warehouse_entrypoints$
declare f record; d text; inject text; wayarg text; op text; codearg boolean; actorarg boolean;
begin
 -- Add the active branch scope before privileged test/service shortcuts.
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in('be_warehouse_assert_internal','be_warehouse_assert_read_v1') loop
  d:=pg_get_functiondef(f.oid);if strpos(d,'BRANCH_WAREHOUSE_AUTH_V1')>0 then continue;end if;
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_WAREHOUSE_AUTH_V1\n if replace(public.be_current_role(),''-'',''_'') in(''branch_manager'',''branch_office_manager'') then perform public.be_branch_department_scope_v1(null);return ''BRANCH_MANAGER'';end if;','i');execute d;
 end loop;
 for f in select p.oid,p.proname,p.proargnames,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in(
  'be_warehouse_inbound_scan','be_warehouse_receive_scan_v36','be_warehouse_receive_scan_v39','be_warehouse_receive_scan_v39_legacy_20260823',
  'be_warehouse_mark_delivery_ready_v149','be_warehouse_mark_delivery_ready_v150','be_warehouse_dispatch_scan','be_dispatch_scan_parcel_v39',
  'be_warehouse_return_scan','be_warehouse_return_scan_v71','be_warehouse_return_scan_v39','be_warehouse_return_scan_v39_legacy_20260823',
  'be_warehouse_resolve_scan_v3','be_warehouse_dispatch_scan_fast_v64',
  'be_warehouse_scan','be_warehouse_scan_action','be_warehouse_mark_scanned_ready_v36','be_warehouse_snapshot','be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827')
 loop
  d:=pg_get_functiondef(f.oid);if strpos(d,'BRANCH_WAREHOUSE_ENTRY_V1')>0 then continue;end if;
  inject:=E'\n -- BRANCH_WAREHOUSE_ENTRY_V1\n if replace(public.be_current_role(),''-'',''_'') in(''branch_manager'',''branch_office_manager'') then\n';
  if f.proname='be_warehouse_resolve_scan_v3' then inject:=inject||'return public.be_branch_warehouse_resolve_v1(p_scan);';
  elsif f.proname='be_warehouse_dispatch_scan_fast_v64' then inject:=inject||'return public.be_branch_warehouse_fast_dispatch_v1(p_scan);';
  elsif f.proname in('be_warehouse_scan','be_warehouse_scan_action','be_warehouse_mark_scanned_ready_v36','be_warehouse_snapshot','be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827') then
   inject:=inject||'raise exception ''USE_CANONICAL_WAREHOUSE_ACTION'' using errcode=''42501'';';
  else
   wayarg:=case when 'p_tracking_no'=any(f.proargnames) then 'p_tracking_no' when 'p_delivery_way_id'=any(f.proargnames) then 'p_delivery_way_id' else 'p_way_id' end;
   op:=case when f.proname like '%mark_delivery_ready%' then 'READY' when f.proname in('be_warehouse_dispatch_scan','be_dispatch_scan_parcel_v39') then 'DISPATCH' when f.proname like '%return_scan%' then 'RETURN' else 'INBOUND' end;
   if 'p_action'=any(f.proargnames) then
    inject:=inject||format('perform public.be_branch_warehouse_require_way_v1(%s,case when upper(p_action)=''RECEIVE'' then ''INBOUND'' else ''RECEIPT_EDIT'' end);',wayarg);
   else inject:=inject||format('perform public.be_branch_warehouse_require_way_v1(%s,%L);',wayarg,op);end if;
   if 'p_wayplan_code'=any(f.proargnames) then inject:=inject||'perform public.be_branch_require_wayplan_v1(p_wayplan_code);if not exists(select 1 from public.be_wayplan_membership_v40 where wayplan_id=p_wayplan_code and delivery_way_id=p_way_id and membership_status=''READY_FOR_DISPATCH'') then raise exception ''WAYPLAN_MEMBERSHIP_REQUIRED'';end if;';end if;
   if 'p_pickup_id'=any(f.proargnames) then inject:=inject||format('if not exists(select 1 from public.be_data_entry_parcel_details where delivery_way_id=upper(btrim(%s)) and pickup_id=p_pickup_id) then raise exception ''PICKUP_WAY_MISMATCH'';end if;',wayarg);end if;
   if 'p_warehouse_code'=any(f.proargnames) then inject:=inject||'p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||''-MAIN'';';end if;
   if 'p_actor_email'=any(f.proargnames) then inject:=inject||'p_actor_email:=public.be_warehouse_actor_email();';end if;
   if f.prosrc ~* '\mv_actor[[:space:]]+text' then inject:=inject||'v_actor:=public.be_warehouse_actor_email();';end if;
   if f.proname like '%receive_scan%' and f.prosrc ~* '\mv_actor[[:space:]]+text' then inject:=inject||'v_actor:=public.be_warehouse_actor_email();';end if;
  end if;
  if f.proname='be_warehouse_receive_scan_v36' then
   d:=replace(d,'scanned_at = coalesce(scanned_at, now())','scanned_at = case when public.be_branch_warehouse_scope_v1(true) is not null and v_action=''RECEIVE'' then now() else coalesce(scanned_at,now()) end');
   d:=replace(d,'scanned_by = coalesce(scanned_by, v_actor)','scanned_by = case when public.be_branch_warehouse_scope_v1(true) is not null and v_action=''RECEIVE'' then v_actor else coalesce(scanned_by,v_actor) end');
  end if;
  inject:=inject||E'\n end if;\n';d:=regexp_replace(d,'\m(begin)\M','begin'||inject,'i');execute d;
 end loop;
end $branch_warehouse_entrypoints$;

-- Scope the root queries before aggregation and limits, so counts and exports agree.
do $branch_warehouse_reads$
declare d text; body text; n text; f record;
begin
 select pg_get_functiondef('public.be_warehouse_scan_lifecycle_snapshot()'::regprocedure) into d;
 if strpos(d,'BRANCH_WAREHOUSE_ROWS_V1')=0 then
  if (length(d)-length(replace(d,'from public.be_v_warehouse_lifecycle_v39 v','')))/length('from public.be_v_warehouse_lifecycle_v39 v')<>2 then raise exception 'Unexpected Warehouse lifecycle root';end if;
  d:=replace(d,'v.waybill_no,','public.be_branch_warehouse_local_receipt_v1(v.delivery_way_id) as branch_receipt_current, v.waybill_no,');
  d:=replace(d,'from public.be_v_warehouse_lifecycle_v39 v','from (select * from public.be_v_warehouse_lifecycle_v39 where public.be_branch_warehouse_visible_v1(delivery_way_id)) v /* BRANCH_WAREHOUSE_ROWS_V1 */');execute d;
 end if;
 select pg_get_functiondef('public.be_warehouse_wayplan_handoff_archive_v150()'::regprocedure) into d;
 if strpos(d,'BRANCH_WAREHOUSE_ARCHIVE_V1')=0 then
  d:=replace(d,'expires_at < now()','expires_at < now() and public.be_branch_warehouse_visible_v1(delivery_way_id)');
  d:=replace(d,'expires_at>=now()','expires_at>=now() and public.be_branch_warehouse_visible_v1(delivery_way_id) /* BRANCH_WAREHOUSE_ARCHIVE_V1 */');execute d;
 end if;
 select pg_get_functiondef('public.be_warehouse_ack_wayplan_handoff_v150(jsonb)'::regprocedure) into d;
 if strpos(d,'BRANCH_WAREHOUSE_ACK_V1')=0 then
  d:=replace(d,'''warehouse'',''supervisor''','''branch-manager'',''branch_manager'',''branch_office_manager'',''warehouse'',''supervisor''');
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_WAREHOUSE_ACK_V1\n if public.be_branch_warehouse_scope_v1(true) is not null then\n if jsonb_typeof(p_delivery_way_ids)<>''array'' then raise exception ''Delivery Way ID array is required'';end if;\n perform public.be_branch_warehouse_require_way_v1(value,''READY'') from jsonb_array_elements_text(p_delivery_way_ids);end if;','i');
  d:=replace(d,'expires_at < now()','expires_at < now() and public.be_branch_warehouse_visible_v1(delivery_way_id)');execute d;
 end if;
 select pg_get_functiondef('public.be_dispatch_command_snapshot_v63()'::regprocedure) into d;
 if strpos(d,'BRANCH_DISPATCH_SNAPSHOT_V1')=0 then
  select prosrc into body from pg_proc where oid='public.be_dispatch_command_snapshot_v63()'::regprocedure;
  if strpos(body,'from public.be_wayplan_dispatches d')=0 then raise exception 'Missing dispatch root';end if;
  body:=replace(body,$old$where upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED')$old$,$new$where (public.be_branch_warehouse_scope_v1(false) is null or public.be_branch_wayplan_allowed_v1(d.wayplan_id)) and upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED')$new$);
  if strpos(body,'public.be_branch_wayplan_allowed_v1(d.wayplan_id)')=0 then raise exception 'Unexpected dispatch predicate';end if;
  body:=regexp_replace(body,';[[:space:]]*$','');
  execute 'create or replace function public.be_dispatch_command_snapshot_v63() returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $fn$ begin /* BRANCH_DISPATCH_SNAPSHOT_V1 */ perform public.be_branch_warehouse_scope_v1(false);return ('||body||');end $fn$';
 end if;
 foreach n in array array['be_warehouse_wayplan_view_v199','be_warehouse_rto_report_v199'] loop
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace='public'::regnamespace and proname=n;
  if strpos(d,'BRANCH_WAREHOUSE_REPORT_V1')>0 then continue;end if;
  d:=replace(d,'''warehouse'',''warehouse_staff''','''branch-manager'',''branch_manager'',''branch_office_manager'',''warehouse'',''warehouse_staff''');
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n /* BRANCH_WAREHOUSE_REPORT_V1 */ perform public.be_branch_warehouse_scope_v1(false);','i');
  if n='be_warehouse_rto_report_v199' then
   d:=replace(d,'having max(r.attempt_number)>=3','');
   d:=replace(d,'where (p_date_from is null','where public.be_branch_warehouse_rto_confirmed_v1(b.delivery_way_id) and (p_date_from is null');
   d:=replace(d,'b.return_scan_3_at::date','(coalesce(b.return_scan_3_at,b.last_return_scan_at) at time zone ''Asia/Yangon'')::date');
  end if;execute d;
 end loop;
end $branch_warehouse_reads$;

create or replace function public.be_branch_ops_workflow_v1()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false); s jsonb; plans jsonb; jobs jsonb; counts jsonb;
begin
 if b is null then raise exception 'BRANCH_WORKFLOW_ONLY';end if;
 s:=public.be_dispatch_command_snapshot_v63();plans:=coalesce(s->'wayplans','[]');jobs:=coalesce(s->'jobs','[]');
 select jsonb_build_object('ready_wayplan_rows',coalesce(sum((x->>'ready_count')::integer),0),'wayplan_headers',count(*),'dispatch_ready_wayplans',count(*) filter(where x->>'review_status'='DISPATCH_READY'),'out_for_delivery_wayplans',count(*) filter(where upper(x->>'wayplan_status')='DISPATCHED')) into counts from jsonb_array_elements(plans) x;
 return jsonb_build_object('ok',true,'branch_code',b,'wayplans',plans,'items',jobs,'stats',counts||jsonb_build_object('wayplan_items',jsonb_array_length(jobs),'completed_items',coalesce(s#>'{stats,delivered}','0'),'failed_items',coalesce(s#>'{stats,failed}','0')),'read_only',true,'build','BRANCH_WAREHOUSE_WORKFLOW_V1');
end $$;
revoke all on function public.be_branch_ops_workflow_v1() from public,anon,authenticated;
do $workflow$
declare d text;
begin
 select pg_get_functiondef('public.be_unified_ops_workflow_snapshot()'::regprocedure) into d;
 if strpos(d,'BRANCH_WAREHOUSE_WORKFLOW_V1')=0 then
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n /* BRANCH_WAREHOUSE_WORKFLOW_V1 */ if public.be_branch_warehouse_scope_v1(false) is not null then return public.be_branch_ops_workflow_v1()::json;end if;','i');execute d;
 end if;
end $workflow$;
