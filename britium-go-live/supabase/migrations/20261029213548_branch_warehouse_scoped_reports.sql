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
