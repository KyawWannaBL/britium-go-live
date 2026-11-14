do $migration$
declare v_sql text;
declare v_old text := '(coalesce(w.dispatched_at,w.planned_at,w.created_at) at time zone ''Asia/Yangon'')::date=v_date';
declare v_new text := '((coalesce(w.dispatched_at,w.planned_at,w.created_at) at time zone ''Asia/Yangon'')::date=v_date or exists (select 1 from public.be_wayplan_dispatch_stops today_stop where today_stop.wayplan_id=w.wayplan_id and (today_stop.delivered_at at time zone ''Asia/Yangon'')::date=v_date and upper(coalesce(today_stop.stop_status,today_stop.rider_status,today_stop.dispatch_status,'''')) in (''DELIVERED'',''COMPLETED'')))';
begin
 select pg_get_functiondef('public.be_finance_live_wayplan_dashboard_v1(date,text,text,text)'::regprocedure) into v_sql;
 if position(v_old in v_sql)=0 then raise exception 'Expected finance date filter not found; migration not applied'; end if;
 v_sql:=replace(v_sql,v_old,v_new);
 execute v_sql;
end $migration$;