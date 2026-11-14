-- V151: archive all Warehouse->Wayplan handoffs immediately for 7 days.
-- A handed-off Way ID must disappear from active Warehouse readiness buttons
-- even before the Wayplan is created. Dispatch Scan remains governed by the
-- existing Supervisor DISPATCH_READY contract.

create or replace function public.be_warehouse_wayplan_handoff_archive_v150()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text:=public.be_warehouse_assert_internal();
  v_rows jsonb;
  v_ids jsonb;
begin
  delete from public.be_warehouse_wayplan_handoffs_v150 where expires_at < now();

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ready_at desc),'[]'::jsonb)
  into v_rows
  from (
    select delivery_way_id,pickup_id,ready_at,ready_by,visible_in_wayplan_at,expires_at,
           case when visible_in_wayplan_at is null
             then 'HANDED_OFF_AWAITING_WAYPLAN'
             else 'VISIBLE_IN_WAYPLAN'
           end as handoff_status
    from public.be_warehouse_wayplan_handoffs_v150
    where expires_at>=now()
    order by ready_at desc
    limit 1000
  ) x;

  select coalesce(jsonb_agg(delivery_way_id order by ready_at desc),'[]'::jsonb)
  into v_ids
  from public.be_warehouse_wayplan_handoffs_v150
  where expires_at>=now();

  return jsonb_build_object(
    'ok',true,
    'rows',v_rows,
    'count',jsonb_array_length(v_rows),
    'handed_off_ids',v_ids,
    'retention_days',7,
    'authorized_role',v_role,
    'build','WAREHOUSE_WAYPLAN_HANDOFF_V151'
  );
end
$function$;

comment on function public.be_warehouse_wayplan_handoff_archive_v150()
is 'V151: returns all active 7-day Warehouse->Wayplan handoffs immediately, including those not yet acknowledged by Wayplan Command.';
