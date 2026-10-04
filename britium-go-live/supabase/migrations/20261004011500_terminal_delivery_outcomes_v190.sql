-- Terminal delivery outcome completion v190.
-- Rules:
-- 1. Delivery failures remain ATTEMPTED_FAILED / return-to-warehouse until physical return processing.
-- 2. RTO is valid only after the third physical Warehouse Return Scan.
-- 3. FAILED/RTO/CANCELLED route outcomes automatically reach CS closure.
-- 4. Stale historical RTO markers with fewer than three return scans are voided, not deleted.

update public.be_rto_events r
set status='VOID',
    note=concat_ws(' | ',nullif(note,''),'Voided: RTO requires third physical Return Scan'),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'void_reason','RTO_REQUIRES_THIRD_PHYSICAL_RETURN_SCAN',
      'voided_at',now(),
      'policy_version','RETURN_SCAN_RTO_V190'
    )
where upper(coalesce(r.status,''))='RTO'
  and (
    select count(*)
    from public.be_warehouse_return_scans_v39 s
    where upper(s.delivery_way_id)=upper(r.way_id)
  ) < 3
  and coalesce((
    select upper(coalesce(w.stop_status,w.rider_status,w.dispatch_status,''))
    from public.be_wayplan_dispatch_stops w
    where upper(w.delivery_way_id)=upper(r.way_id)
    order by w.updated_at desc nulls last
    limit 1
  ),'') not in ('RTO','RETURN_TO_SENDER');

update public.be_app_notifications n
set status='RESOLVED',
    is_read=true,
    read_at=coalesce(read_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'resolved_reason','STALE_RTO_BEFORE_THIRD_RETURN_SCAN',
      'resolved_at',now()
    )
where upper(coalesce(n.event_type,n.notification_type,''))='DELIVERY_RTO'
  and exists(
    select 1
    from public.be_rto_events r
    where upper(r.way_id)=upper(coalesce(n.entity_id,n.source_key,''))
      and upper(r.status)='VOID'
  );

create or replace function public.be_sync_terminal_delivery_outcome_v190()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_status text := upper(coalesce(new.stop_status,''));
  v_cs jsonb;
begin
  if v_status not in ('FAILED','RTO','CANCELLED') then
    return new;
  end if;

  v_cs := public.be_cs_closure_sync_v49(new.wayplan_id);

  update public.be_rider_route_stop_state_v46
  set result_payload=coalesce(result_payload,'{}'::jsonb)||jsonb_build_object(
        'terminal_outcome_synced',true,
        'terminal_outcome_synced_at',now(),
        'terminal_outcome_build','TERMINAL_OUTCOME_V190',
        'cs_sync',v_cs
      ),
      updated_at=now()
  where wayplan_id=new.wayplan_id
    and delivery_way_id=new.delivery_way_id;

  return new;
exception
  when others then
    update public.be_rider_route_stop_state_v46
    set result_payload=coalesce(result_payload,'{}'::jsonb)||jsonb_build_object(
          'terminal_outcome_synced',false,
          'terminal_outcome_error',sqlerrm,
          'terminal_outcome_failed_at',now(),
          'terminal_outcome_build','TERMINAL_OUTCOME_V190'
        ),
        updated_at=now()
    where wayplan_id=new.wayplan_id
      and delivery_way_id=new.delivery_way_id;
    return new;
end;
$function$;

drop trigger if exists zz_trg_be_sync_terminal_delivery_outcome_v190
  on public.be_rider_route_stop_state_v46;

create trigger zz_trg_be_sync_terminal_delivery_outcome_v190
after insert or update of stop_status
on public.be_rider_route_stop_state_v46
for each row
when (upper(coalesce(new.stop_status,'')) in ('FAILED','RTO','CANCELLED'))
execute function public.be_sync_terminal_delivery_outcome_v190();

revoke execute on function public.be_sync_terminal_delivery_outcome_v190() from public;
revoke execute on function public.be_sync_terminal_delivery_outcome_v190() from anon;
revoke execute on function public.be_sync_terminal_delivery_outcome_v190() from authenticated;
