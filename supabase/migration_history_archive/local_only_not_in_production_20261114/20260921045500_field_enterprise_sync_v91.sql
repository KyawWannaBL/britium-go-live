-- V91: field workforce enterprise synchronization, departmental failure fan-out, canonical profile and financial snapshot.

create or replace function public.be_sync_field_failure_departments_v91(
  p_delivery_way_id text,
  p_pickup_id text,
  p_attempt integer,
  p_status text,
  p_reason text,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_way text:=upper(nullif(btrim(coalesce(p_delivery_way_id,'')),''));
  v_pickup text:=nullif(btrim(coalesce(p_pickup_id,'')),'');
  v_attempt integer:=greatest(coalesce(p_attempt,1),1);
  v_status text:=upper(coalesce(nullif(btrim(p_status),''),'ATTEMPTED_FAILED'));
  v_reason text:=upper(coalesce(nullif(btrim(p_reason),''),'DELIVERY_FAILED'));
  v_actor text:=lower(coalesce(nullif(btrim(p_actor_email),''),auth.jwt()->>'email','field-worker'));
  v_is_rto boolean:=v_status='RTO';
  v_reason_en text;
  v_reason_mm text;
  v_reason_label text;
  v_wayplan text;
  v_waybill text;
  v_branch text;
  v_merchant_code text;
  v_merchant_name text;
  v_receiver text;
  v_phone text;
  v_township text;
  v_address text;
  v_proof text;
  v_event_key text;
  v_cs_ticket_no text;
  v_owner text;
  v_case_id uuid;
begin
  if v_way is null then return jsonb_build_object('ok',false,'error','DELIVERY_WAY_ID_REQUIRED'); end if;

  select r.exception_name_en,r.exception_name_mm
  into v_reason_en,v_reason_mm
  from public.be_exception_rules r
  where upper(r.exception_code)=v_reason
    and coalesce(r.active,true)
    and upper(coalesce(r.process_type,''))='DELIVERY'
  limit 1;

  v_reason_en:=coalesce(v_reason_en,initcap(replace(lower(v_reason),'_',' ')));
  v_reason_mm:=coalesce(v_reason_mm,v_reason_en);
  v_reason_label:=coalesce(nullif(v_reason_mm,''),v_reason_en,v_reason);

  select
    s.wayplan_id,
    coalesce(s.waybill_no,l.waybill_no),
    coalesce(s.branch_code,(s.metadata->>'branch_code')),
    coalesce(l.merchant_code,(s.metadata->>'merchant_code')),
    coalesce(l.merchant_name,(s.metadata->>'merchant_name')),
    coalesce(s.receiver_name,s.recipient_name,l.recipient_name),
    coalesce(s.receiver_phone,s.recipient_phone,l.recipient_phone,l.contact_no_1),
    coalesce(s.delivery_township,s.recipient_township,s.township,l.township),
    coalesce(s.delivery_address,s.address,l.delivery_address,l.recipient_address),
    coalesce(s.rider_proof_url,s.proof_url,l.rider_proof_url)
  into
    v_wayplan,v_waybill,v_branch,v_merchant_code,v_merchant_name,
    v_receiver,v_phone,v_township,v_address,v_proof
  from public.be_wayplan_dispatch_stops s
  left join public.be_waybill_ledger l
    on l.delivery_way_id=s.delivery_way_id or l.tracking_no=s.delivery_way_id
  where s.delivery_way_id=v_way
  order by s.updated_at desc nulls last
  limit 1;

  if v_pickup is null then
    select coalesce(l.pickup_id,l.pickup_way_id)
    into v_pickup
    from public.be_waybill_ledger l
    where l.delivery_way_id=v_way or l.tracking_no=v_way
    order by l.updated_at desc nulls last
    limit 1;
  end if;

  v_event_key:='FIELD_FAILURE:'||v_way||':'||v_attempt::text;

  if not exists(
    select 1 from public.be_parcel_exception_events e
    where e.delivery_way_id=v_way and e.attempt_no=v_attempt
  ) then
    insert into public.be_parcel_exception_events(
      tracking_no,delivery_way_id,waybill_no,pickup_id,wayplan_code,
      merchant_code,merchant_name,recipient_name,recipient_phone,township,
      process_type,exception_code,exception_name_en,exception_name_mm,
      mapped_status,attempt_no,remarks,reported_by_email,branch_code,
      previous_status,new_status,next_action,is_rto,created_at
    ) values (
      v_way,v_way,v_waybill,v_pickup,v_wayplan,
      v_merchant_code,v_merchant_name,v_receiver,v_phone,v_township,
      'DELIVERY',v_reason,v_reason_en,v_reason_mm,
      v_status,v_attempt,v_reason_label,v_actor,v_branch,
      'OUT_FOR_DELIVERY',v_status,
      case when v_is_rto then 'RTO_RETURN_SCAN' else 'WAREHOUSE_RETURN_SCAN' end,
      v_is_rto,now()
    );
  end if;

  select c.id into v_case_id
  from public.be_exception_cases c
  where c.tracking_no=v_way
    and upper(coalesce(c.status,'')) not in ('RESOLVED','CLOSED','CANCELLED')
  order by c.created_at desc
  limit 1;

  if v_case_id is null then
    insert into public.be_exception_cases(
      tracking_no,delivery_id,merchant_name,receiver_name,receiver_phone,township,address,
      exception_type,reason,status,priority,pod_photo_url,payload,created_by,created_at,updated_at
    ) values (
      v_way,v_way,v_merchant_name,v_receiver,v_phone,v_township,v_address,
      case when v_is_rto then 'RTO' else 'DELIVERY_FAILED' end,
      v_reason_label,'OPEN',case when v_is_rto then 'HIGH' else 'MEDIUM' end,
      v_proof,
      jsonb_build_object(
        'event_key',v_event_key,'exception_code',v_reason,'attempt_no',v_attempt,
        'pickup_id',v_pickup,'wayplan_id',v_wayplan,'branch_code',v_branch,
        'reported_by',v_actor,'is_rto',v_is_rto,'source','FIELD_WORKFORCE_V91'
      ),
      auth.uid(),now(),now()
    )
    returning id into v_case_id;
  else
    update public.be_exception_cases
    set exception_type=case when v_is_rto then 'RTO' else 'DELIVERY_FAILED' end,
        reason=v_reason_label,
        priority=case when v_is_rto then 'HIGH' else priority end,
        pod_photo_url=coalesce(v_proof,pod_photo_url),
        payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
          'event_key',v_event_key,'exception_code',v_reason,'attempt_no',v_attempt,
          'pickup_id',v_pickup,'wayplan_id',v_wayplan,'branch_code',v_branch,
          'reported_by',v_actor,'is_rto',v_is_rto,'source','FIELD_WORKFORCE_V91'
        ),
        updated_at=now()
    where id=v_case_id;
  end if;

  foreach v_owner in array array['WAREHOUSE','CUSTOMER_SERVICE','OPERATIONS','FINANCE'] loop
    if not exists(
      select 1 from public.be_exception_ledger x
      where x.payload->>'event_key'=v_event_key
        and upper(coalesce(x.owner_team,''))=v_owner
    ) then
      insert into public.be_exception_ledger(
        exception_type,owner_team,required_action,pickup_id,deliver_id,waybill_no,
        tracking_number,status,priority,notes,payload,created_at,updated_at
      ) values (
        case when v_is_rto then 'RTO' else 'DELIVERY_FAILED' end,
        v_owner,
        case v_owner
          when 'WAREHOUSE' then case when v_is_rto then 'RECEIVE_RTO_RETURN' else 'RETURN_SCAN_AND_STAGE_FOR_REATTEMPT' end
          when 'CUSTOMER_SERVICE' then 'CUSTOMER_FOLLOW_UP_AND_REASON_REVIEW'
          when 'FINANCE' then 'REVIEW_COD_AND_SETTLEMENT_IMPACT'
          else 'MONITOR_EXCEPTION_AND_NEXT_ACTION'
        end,
        v_pickup,v_way,v_waybill,v_way,'OPEN',
        case when v_is_rto then 'HIGH' else 'MEDIUM' end,
        v_reason_label,
        jsonb_build_object(
          'event_key',v_event_key,'exception_code',v_reason,'attempt_no',v_attempt,
          'reason_en',v_reason_en,'reason_mm',v_reason_mm,'wayplan_id',v_wayplan,
          'branch_code',v_branch,'reported_by',v_actor,'is_rto',v_is_rto
        ),
        now(),now()
      );
    end if;
  end loop;

  if exists(
    select 1 from public.be_warehouse_exceptions w
    where w.delivery_way_id=v_way
      and upper(coalesce(w.exception_status,'')) not in ('RESOLVED','CLOSED')
  ) then
    update public.be_warehouse_exceptions
    set exception_code=v_reason,
        exception_status='AWAITING_RETURN_SCAN',
        priority=case when v_is_rto then 'HIGH' else 'MEDIUM' end,
        wayplan_id=coalesce(v_wayplan,wayplan_id),
        pickup_id=coalesce(v_pickup,pickup_id),
        tracking_no=v_way,
        reason=v_reason_label,
        actor_email=v_actor,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'event_key',v_event_key,'attempt_no',v_attempt,'is_rto',v_is_rto,'source','FIELD_WORKFORCE_V91'
        ),
        updated_at=now()
    where delivery_way_id=v_way
      and upper(coalesce(exception_status,'')) not in ('RESOLVED','CLOSED');
  else
    insert into public.be_warehouse_exceptions(
      exception_code,exception_status,priority,wayplan_id,delivery_way_id,pickup_id,
      tracking_no,reason,actor_email,metadata,created_at,updated_at
    ) values (
      v_reason,'AWAITING_RETURN_SCAN',case when v_is_rto then 'HIGH' else 'MEDIUM' end,
      v_wayplan,v_way,v_pickup,v_way,v_reason_label,v_actor,
      jsonb_build_object('event_key',v_event_key,'attempt_no',v_attempt,'is_rto',v_is_rto,'source','FIELD_WORKFORCE_V91'),
      now(),now()
    );
  end if;

  update public.be_wayplan_dispatch_stops
  set warehouse_status='AWAITING_RETURN_SCAN',
      warehouse_action=case when v_is_rto then 'RTO_RETURN_SCAN_REQUIRED' else 'RETURN_SCAN_REQUIRED' end,
      warehouse_exception_status='OPEN',
      warehouse_exception_reason=v_reason_label,
      warehouse_notes=concat_ws(' | ',nullif(warehouse_notes,''),v_reason_label),
      warehouse_metadata=coalesce(warehouse_metadata,'{}'::jsonb)||jsonb_build_object(
        'field_failure_event_key',v_event_key,'attempt_no',v_attempt,'exception_code',v_reason,
        'is_rto',v_is_rto,'reported_by',v_actor
      ),
      updated_at=now()
  where delivery_way_id=v_way;

  update public.be_waybill_ledger
  set warehouse_status='AWAITING_RETURN_SCAN',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'field_failure_event_key',v_event_key,'attempt_no',v_attempt,'exception_code',v_reason,
        'exception_reason_en',v_reason_en,'exception_reason_mm',v_reason_mm,
        'is_rto',v_is_rto,'reported_by',v_actor
      ),
      updated_at=now()
  where delivery_way_id=v_way or tracking_no=v_way;

  v_cs_ticket_no:='CS-FLD-'||upper(substr(md5(v_way),1,12));
  insert into public.be_cs_tickets(
    id,ticket_no,way_id,pickup_id,customer_name,customer_phone,
    issue_type,source,title,description,priority,status,created_by,payload,created_at,updated_at
  ) values (
    gen_random_uuid(),v_cs_ticket_no,v_way,v_pickup,v_receiver,v_phone,
    case when v_is_rto then 'RTO' else 'DELIVERY_EXCEPTION' end,
    'field_workforce',
    case when v_is_rto then 'RTO requires Customer Service follow-up' else 'Failed delivery requires Customer Service follow-up' end,
    v_way||' · '||v_reason_en||' / '||v_reason_mm||' · attempt '||v_attempt::text,
    case when v_is_rto then 'high' else 'medium' end,'open',auth.uid(),
    jsonb_build_object(
      'event_key',v_event_key,'delivery_way_id',v_way,'pickup_id',v_pickup,
      'exception_code',v_reason,'attempt_no',v_attempt,'is_rto',v_is_rto,
      'branch_code',v_branch,'reported_by',v_actor
    ),now(),now()
  )
  on conflict(ticket_no) do update
  set description=excluded.description,
      priority=excluded.priority,
      status=case when lower(coalesce(public.be_cs_tickets.status,'')) in ('resolved','closed') then public.be_cs_tickets.status else 'open' end,
      payload=coalesce(public.be_cs_tickets.payload,'{}'::jsonb)||excluded.payload,
      updated_at=now();

  update public.be_finance_cod_settlements_v48
  set settlement_status=case
        when upper(coalesce(settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED') then settlement_status
        else 'HOLD_EXCEPTION'
      end,
      hold_code=case
        when upper(coalesce(settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED') then hold_code
        else v_reason
      end,
      hold_note=case
        when upper(coalesce(settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED') then hold_note
        else v_reason_label
      end,
      held_by=case
        when upper(coalesce(settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED') then held_by
        else v_actor
      end,
      held_at=case
        when upper(coalesce(settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED') then held_at
        else now()
      end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'field_failure_event_key',v_event_key,'attempt_no',v_attempt,
        'exception_code',v_reason,'is_rto',v_is_rto
      ),
      updated_at=now()
  where delivery_way_id=v_way;

  if v_is_rto and not exists(
    select 1 from public.be_rto_events r
    where upper(coalesce(r.way_id,''))=v_way
      and upper(coalesce(r.status,'')) in ('RTO','OPEN','PENDING')
  ) then
    insert into public.be_rto_events(
      way_id,pickup_id,merchant_code,merchant_name,reason_code,status,
      scanned_by,scanned_at,note,metadata
    ) values (
      v_way,v_pickup,v_merchant_code,v_merchant_name,v_reason,'RTO',
      auth.uid(),now(),v_reason_label,
      jsonb_build_object(
        'event_key',v_event_key,'attempt_no',v_attempt,'wayplan_id',v_wayplan,
        'branch_code',v_branch,'reported_by',v_actor,'source','FIELD_WORKFORCE_V91'
      )
    );
  end if;

  foreach v_owner in array array['warehouse','customer_service','operations','finance'] loop
    insert into public.be_app_notifications(
      target_role,target_branch,pickup_id,title,message,is_read,created_at,
      source_table,source_key,notification_type,metadata,event_type,event_key,
      entity_type,entity_id,priority,status
    ) values (
      v_owner,v_branch,v_pickup,
      case when v_is_rto then 'RTO parcel requires action' else 'Failed delivery requires action' end,
      v_way||' · '||v_reason_en||' / '||v_reason_mm||' · attempt '||v_attempt::text,
      false,now(),'be_delivery_attempt_events_v39',v_event_key,
      case when v_is_rto then 'DELIVERY_RTO' else 'DELIVERY_FAILED' end,
      jsonb_build_object(
        'delivery_way_id',v_way,'pickup_id',v_pickup,'wayplan_id',v_wayplan,
        'exception_code',v_reason,'attempt_no',v_attempt,'is_rto',v_is_rto,
        'reason_en',v_reason_en,'reason_mm',v_reason_mm,'reported_by',v_actor
      ),
      case when v_is_rto then 'DELIVERY_RTO' else 'DELIVERY_FAILED' end,
      v_event_key||':'||v_owner,'DELIVERY_WAY',v_way,
      case when v_is_rto then 'HIGH' else 'MEDIUM' end,'OPEN'
    )
    on conflict(event_key) do update
    set message=excluded.message,
        is_read=false,
        read_at=null,
        status='OPEN',
        metadata=excluded.metadata,
        created_at=excluded.created_at;
  end loop;

  return jsonb_build_object(
    'ok',true,'event_key',v_event_key,'delivery_way_id',v_way,'pickup_id',v_pickup,
    'attempt_no',v_attempt,'status',v_status,'reason_code',v_reason,
    'reason_en',v_reason_en,'reason_mm',v_reason_mm,'is_rto',v_is_rto,
    'warehouse_synced',true,'customer_service_synced',true,
    'finance_synced',true,'operations_synced',true
  );
end;
$$;

create or replace function public.be_delivery_attempt_enterprise_sync_v91()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  perform public.be_sync_field_failure_departments_v91(
    new.delivery_way_id,new.pickup_id,new.attempt_number,new.result_status,new.reason,new.actor_email
  );
  return new;
end;
$$;

drop trigger if exists trg_be_delivery_attempt_enterprise_sync_v91 on public.be_delivery_attempt_events_v39;
create trigger trg_be_delivery_attempt_enterprise_sync_v91
after insert on public.be_delivery_attempt_events_v39
for each row execute function public.be_delivery_attempt_enterprise_sync_v91();


create or replace function public.be_field_profile_snapshot_v91()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_base jsonb:=public.be_rider_profile_snapshot();
  v_identity jsonb:=coalesce(v_base->'identity','{}'::jsonb);
  v_workforce jsonb:=coalesce(v_base->'workforce','{}'::jsonb);
  v_profile jsonb:=coalesce(v_base->'profile','{}'::jsonb);
  v_email text;
  v_username text;
  v_display text;
begin
  v_email:=lower(coalesce(
    nullif(v_identity->>'email',''),
    nullif(v_workforce->>'email',''),
    nullif(v_workforce->>'user_email',''),
    nullif(v_profile->>'email','')
  ));
  v_username:=coalesce(
    nullif(v_workforce->>'account',''),
    nullif(v_workforce->>'account_code',''),
    nullif(v_workforce->>'workforce_code',''),
    nullif(v_workforce->>'worker_code',''),
    nullif(v_identity->>'worker_code','')
  );
  v_display:=coalesce(
    nullif(v_identity->>'display_name',''),
    nullif(v_workforce->>'display_name',''),
    nullif(v_workforce->>'full_name',''),
    nullif(v_workforce->>'name',''),
    nullif(v_profile->>'full_name',''),
    v_username
  );

  return v_base||jsonb_build_object(
    'canonical',jsonb_build_object(
      'username',v_username,
      'email',v_email,
      'display_name',v_display,
      'worker_code',v_identity->>'worker_code',
      'role',v_identity->>'role',
      'branch_code',coalesce(v_identity->>'branch_code',v_workforce->>'branch_code',v_workforce->>'assigned_branch'),
      'assigned_zone',coalesce(v_identity->>'assigned_zone',v_workforce->>'assigned_zone',v_workforce->>'zone_code',v_workforce->>'zone')
    )
  );
end;
$$;

revoke all on function public.be_field_profile_snapshot_v91() from public,anon;
grant execute on function public.be_field_profile_snapshot_v91() to authenticated;


create or replace function public.be_field_financial_snapshot_v91(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_email text:=lower(coalesce(v_identity->>'email',''));
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=upper(coalesce(v_identity->>'role','RIDER'));
  v_days integer:=least(greatest(coalesce(p_days,30),1),90);
  v_commission_rows jsonb:='[]'::jsonb;
  v_cod_rows jsonb:='[]'::jsonb;
  v_wallet jsonb:='{}'::jsonb;
  v_total_commission numeric:=0;
  v_pending_commission numeric:=0;
  v_paid_commission numeric:=0;
  v_total_units numeric:=0;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  begin
    perform public.be_rebuild_auto_commission_events((now() at time zone 'Asia/Yangon')::date,v_email);
  exception when others then
    null;
  end;

  select
    coalesce(jsonb_agg(to_jsonb(x) order by x.work_date desc,x.operation_type),'[]'::jsonb),
    coalesce(sum(x.commission_mmk),0),
    coalesce(sum(x.total_units),0)
  into v_commission_rows,v_total_commission,v_total_units
  from (
    select *
    from public.be_v_commission_settlement s
    where lower(coalesce(s.assignee_email,''))=v_email
      and upper(coalesce(s.role_code,''))=v_role
      and s.work_date >= (now() at time zone 'Asia/Yangon')::date-(v_days-1)
    order by s.work_date desc,s.operation_type
  ) x;

  select
    coalesce(sum(e.commission_mmk) filter (where upper(coalesce(e.event_status,'')) in ('PAID','SETTLED','COMPLETED','POSTED')),0),
    coalesce(sum(e.commission_mmk) filter (where upper(coalesce(e.event_status,'')) not in ('PAID','SETTLED','COMPLETED','POSTED')),0)
  into v_paid_commission,v_pending_commission
  from public.be_commission_events e
  where lower(coalesce(e.assignee_email,''))=v_email
    and upper(coalesce(e.role_code,''))=v_role
    and e.work_date >= (now() at time zone 'Asia/Yangon')::date-(v_days-1);

  v_wallet:=public.be_rider_wallet_snapshot(jsonb_build_object('days',v_days));

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_cod_rows
  from (
    select
      f.delivery_way_id,f.pickup_id,f.expected_cod,f.reported_collected,
      f.rider_remittance,f.settled_amount,f.settlement_status,f.variance_type,
      f.variance_amount,f.hold_code,f.hold_note,f.created_at,f.updated_at
    from public.be_finance_cod_settlements_v48 f
    where case lower(v_identity->>'role')
      when 'driver' then upper(coalesce(f.driver_code,''))=v_code
      when 'helper' then false
      else upper(coalesce(f.rider_code,''))=v_code
    end
    order by f.created_at desc
    limit 200
  ) x;

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'period_days',v_days,
    'commission',jsonb_build_object(
      'total',v_total_commission,
      'paid',v_paid_commission,
      'pending',v_pending_commission,
      'units',v_total_units,
      'rows',v_commission_rows
    ),
    'wallet',coalesce(v_wallet->'totals','{}'::jsonb),
    'wallet_ledger',coalesce(v_wallet->'ledger','[]'::jsonb),
    'cod_settlements',v_cod_rows,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.be_field_financial_snapshot_v91(integer) from public,anon;
grant execute on function public.be_field_financial_snapshot_v91(integer) to authenticated;
