-- V92: departmental exception visibility and return lifecycle synchronization.

create or replace function public.be_field_delivery_failure_reasons_v92()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'ok',true,
    'reasons',coalesce(jsonb_agg(jsonb_build_object(
      'code',r.exception_code,
      'name_en',r.exception_name_en,
      'name_mm',r.exception_name_mm,
      'mapped_status',r.mapped_status,
      'severity',r.severity,
      'require_photo',r.require_photo,
      'require_remark',r.require_remark,
      'next_action',r.next_action,
      'customer_message_en',r.customer_message_en,
      'customer_message_mm',r.customer_message_mm
    ) order by r.exception_code),'[]'::jsonb)
  )
  from public.be_exception_rules r
  where upper(coalesce(r.process_type,''))='DELIVERY'
    and coalesce(r.active,true);
$$;

revoke all on function public.be_field_delivery_failure_reasons_v92() from public,anon;
grant execute on function public.be_field_delivery_failure_reasons_v92() to authenticated;


create or replace function public.be_warehouse_scan_lifecycle_snapshot_v92()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_base jsonb:=public.be_warehouse_scan_lifecycle_snapshot();
  v_rows jsonb:='[]'::jsonb;
  v_stats jsonb:='{}'::jsonb;
  v_waiting integer:=0;
begin
  select coalesce(jsonb_agg(
    e
    || jsonb_build_object(
      'field_exception_pending',coalesce(wh.exception_status='AWAITING_RETURN_SCAN',false),
      'pending_return_reason_code',coalesce(wh.exception_code,pe.exception_code),
      'pending_return_reason_name',coalesce(wh.reason,pe.exception_name_mm,pe.exception_name_en),
      'pending_return_attempt_no',coalesce((wh.metadata->>'attempt_no')::integer,pe.attempt_no),
      'pending_return_is_rto',coalesce((wh.metadata->>'is_rto')::boolean,pe.is_rto,false),
      'pending_return_reported_by',coalesce(wh.actor_email,pe.reported_by_email),
      'pending_return_reported_at',coalesce(wh.created_at,pe.created_at),
      'warehouse_exception_status',wh.exception_status,
      'warehouse_exception_priority',wh.priority,
      'dispatch_workflow_stage',
        case when wh.exception_status='AWAITING_RETURN_SCAN'
          then case when coalesce((wh.metadata->>'is_rto')::boolean,false) then 'RTO_AWAITING_RETURN_SCAN' else 'AWAITING_RETURN_SCAN' end
          else e->>'dispatch_workflow_stage' end,
      'warehouse_scan_status',
        case when wh.exception_status='AWAITING_RETURN_SCAN' then 'AWAITING_RETURN_SCAN'
          else e->>'warehouse_scan_status' end,
      'dispatch_scan_required',
        case when wh.exception_status='AWAITING_RETURN_SCAN' then false
          else coalesce((e->>'dispatch_scan_required')::boolean,false) end,
      'dispatch_scan_allowed',
        case when wh.exception_status='AWAITING_RETURN_SCAN' then false
          else coalesce((e->>'dispatch_scan_allowed')::boolean,false) end,
      'dispatch_scan_instruction',
        case when wh.exception_status='AWAITING_RETURN_SCAN'
          then 'Field delivery failed — receive this parcel with Return Scan before any replan or dispatch.'
          else e->>'dispatch_scan_instruction' end
    )
    order by ord
  ),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality t(e,ord)
  left join lateral(
    select w.*
    from public.be_warehouse_exceptions w
    where upper(w.delivery_way_id)=upper(e->>'delivery_way_id')
    order by w.updated_at desc nulls last,w.created_at desc nulls last
    limit 1
  ) wh on true
  left join lateral(
    select p.*
    from public.be_parcel_exception_events p
    where upper(p.delivery_way_id)=upper(e->>'delivery_way_id')
    order by p.created_at desc nulls last
    limit 1
  ) pe on true;

  select count(*)::integer into v_waiting
  from jsonb_array_elements(v_rows) x
  where coalesce((x->>'field_exception_pending')::boolean,false);

  v_stats:=coalesce(v_base->'stats','{}'::jsonb)||jsonb_build_object(
    'awaiting_return_scan',v_waiting
  );

  return v_base||jsonb_build_object(
    'rows',v_rows,
    'stats',v_stats,
    'field_exception_source','be_warehouse_exceptions',
    'field_exception_sync_build','V92'
  );
end;
$$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot_v92() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v92() to authenticated;


create or replace function public.be_exception_screen_snapshot_v92(
  p_actor_email text default null,
  p_merchant_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_base jsonb:=public.be_exception_screen_snapshot(p_actor_email,p_merchant_code);
  v_rows jsonb:='[]'::jsonb;
  v_summary jsonb:=coalesce(v_base->'summary','{}'::jsonb);
begin
  select coalesce(jsonb_agg(
    e
    || jsonb_build_object(
      'exception_code',coalesce(pe.exception_code,e->>'failed_reason'),
      'reason_name_en',coalesce(pe.exception_name_en,e->>'reason'),
      'reason_name_mm',coalesce(pe.exception_name_mm,pe.exception_name_en,e->>'reason'),
      'attempt_no',pe.attempt_no,
      'is_rto',coalesce(pe.is_rto,false),
      'reported_by_email',pe.reported_by_email,
      'field_exception_created_at',pe.created_at,
      'department_actions',coalesce(dept.actions,'{}'::jsonb),
      'warehouse_exception_status',wh.exception_status,
      'warehouse_required_action',
        case
          when wh.exception_status='AWAITING_RETURN_SCAN' and coalesce((wh.metadata->>'is_rto')::boolean,false)
            then 'RTO_RETURN_SCAN_REQUIRED'
          when wh.exception_status='AWAITING_RETURN_SCAN'
            then 'RETURN_SCAN_REQUIRED'
          else null
        end,
      'finance_hold_status',fin.settlement_status,
      'finance_hold_code',fin.hold_code,
      'finance_hold_note',fin.hold_note
    )
    order by coalesce(pe.created_at,nullif(e->>'created_at','')::timestamptz) desc nulls last
  ),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) e
  left join lateral(
    select p.*
    from public.be_parcel_exception_events p
    where upper(p.delivery_way_id)=upper(e->>'delivery_way_id')
    order by p.created_at desc nulls last
    limit 1
  ) pe on true
  left join lateral(
    select jsonb_object_agg(x.owner_team,x.status) actions
    from (
      select distinct on (upper(l.owner_team))
        upper(l.owner_team) owner_team,l.status
      from public.be_exception_ledger l
      where upper(coalesce(l.deliver_id,l.tracking_number,''))=upper(e->>'delivery_way_id')
      order by upper(l.owner_team),l.updated_at desc nulls last,l.created_at desc nulls last
    ) x
  ) dept on true
  left join lateral(
    select w.*
    from public.be_warehouse_exceptions w
    where upper(w.delivery_way_id)=upper(e->>'delivery_way_id')
    order by w.updated_at desc nulls last
    limit 1
  ) wh on true
  left join lateral(
    select f.*
    from public.be_finance_cod_settlements_v48 f
    where upper(f.delivery_way_id)=upper(e->>'delivery_way_id')
    limit 1
  ) fin on true;

  return jsonb_build_object(
    'ok',true,
    'source','be_exception_screen_snapshot_v92',
    'summary',v_summary,
    'rows',v_rows,
    'stats',jsonb_build_object(
      'open',coalesce((v_summary->>'open_exceptions')::integer,0),
      'priority',coalesce((v_summary->>'priority_next_wayplan')::integer,0),
      'rto',coalesce((v_summary->>'rto')::integer,0),
      'displayed',jsonb_array_length(v_rows)
    ),
    'events',v_rows
  );
end;
$$;

revoke all on function public.be_exception_screen_snapshot_v92(text,text) from public,anon;
grant execute on function public.be_exception_screen_snapshot_v92(text,text) to authenticated;


create or replace function public.be_finance_wayplan_cod_center_v92(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_base jsonb:=public.be_finance_wayplan_cod_center(p_limit);
  v_holds jsonb:='[]'::jsonb;
  v_hold_count integer:=0;
  v_hold_amount numeric:=0;
begin
  select
    coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb),
    count(*)::integer,
    coalesce(sum(coalesce(reported_collected,expected_cod,0)),0)
  into v_holds,v_hold_count,v_hold_amount
  from (
    select
      f.delivery_way_id,f.pickup_id,f.expected_cod,f.reported_collected,
      f.rider_remittance,f.settled_amount,f.settlement_status,f.variance_type,
      f.variance_amount,f.hold_code,f.hold_note,f.held_by,f.held_at,
      f.rider_code,f.driver_code,f.created_at,f.updated_at,f.metadata
    from public.be_finance_cod_settlements_v48 f
    where upper(coalesce(f.settlement_status,''))='HOLD_EXCEPTION'
    order by f.updated_at desc
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) x;

  return v_base||jsonb_build_object(
    'exception_holds',v_holds,
    'summary',coalesce(v_base->'summary','{}'::jsonb)||jsonb_build_object(
      'exception_hold_count',v_hold_count,
      'exception_hold_amount',v_hold_amount
    ),
    'field_exception_sync_build','V92'
  );
end;
$$;

revoke all on function public.be_finance_wayplan_cod_center_v92(integer) from public,anon;
grant execute on function public.be_finance_wayplan_cod_center_v92(integer) to authenticated;


create or replace function public.be_warehouse_return_exception_close_v92()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_actor text:=coalesce(nullif(new.actor_email,''),auth.jwt()->>'email','warehouse');
begin
  update public.be_warehouse_exceptions
  set exception_status='RETURN_SCANNED',
      resolution_note=concat_ws(' | ',nullif(resolution_note,''),'Warehouse return scan completed.'),
      resolved_by=v_actor,
      resolved_at=coalesce(resolved_at,new.scanned_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'return_scan_id',new.id,
        'return_attempt_number',new.attempt_number,
        'return_reason_code',new.reason_code,
        'return_scanned_at',new.scanned_at
      ),
      updated_at=now()
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and exception_status='AWAITING_RETURN_SCAN';

  update public.be_parcel_exception_events
  set resolved_at=coalesce(resolved_at,new.scanned_at,now()),
      resolved_by=v_actor,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'warehouse_return_scan_id',new.id,
        'warehouse_return_scan_at',new.scanned_at
      )
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and resolved_at is null;

  update public.be_exception_ledger
  set status='COMPLETED',
      notes=concat_ws(' | ',nullif(notes,''),'Warehouse return scan completed.'),
      payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
        'return_scan_id',new.id,
        'return_scan_at',new.scanned_at,
        'return_reason_code',new.reason_code
      ),
      updated_at=now()
  where upper(coalesce(deliver_id,tracking_number,''))=upper(new.delivery_way_id)
    and upper(coalesce(owner_team,''))='WAREHOUSE'
    and upper(coalesce(status,'')) not in ('COMPLETED','CLOSED','RESOLVED');

  update public.be_app_notifications
  set status='CLOSED',
      is_read=true,
      read_at=coalesce(read_at,new.scanned_at,now()),
      updated_at=now()
  where upper(coalesce(target_role,''))='WAREHOUSE'
    and entity_id=new.delivery_way_id
    and event_key like 'FIELD_FAILURE:%'
    and upper(coalesce(status,''))='OPEN';

  return new;
end;
$$;

drop trigger if exists trg_be_warehouse_return_exception_close_v92 on public.be_warehouse_return_scans_v39;
create trigger trg_be_warehouse_return_exception_close_v92
after insert on public.be_warehouse_return_scans_v39
for each row execute function public.be_warehouse_return_exception_close_v92();
