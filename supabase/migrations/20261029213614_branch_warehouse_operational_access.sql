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
