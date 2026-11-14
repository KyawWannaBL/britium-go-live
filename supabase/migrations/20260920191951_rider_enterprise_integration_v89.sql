
-- V89: canonical Rider App <-> Enterprise Portal integration bridge.

create or replace function public.be_pickup_parcel_capture_snapshot(p_pickup_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_pickup text:=nullif(btrim(coalesce(p_pickup_id,'')),'');
  v_expected integer:=0;
  v_rows jsonb:='[]'::jsonb;
begin
  if v_pickup is null then raise exception 'pickup_id is required'; end if;
  perform public.be_rider_assert_assigned_pickup(v_pickup);
  v_expected:=public.be_rider_authoritative_expected_count_v59(v_pickup);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,
    'line_no',v.parcel_sequence,
    'row_no',v.parcel_sequence,
    'parcel_sequence',v.parcel_sequence,
    'waybill_no',v.waybill_no,
    'delivery_way_id',v.delivery_way_id,
    'tracking_no',v.tracking_no,
    'temp_qr_code',coalesce(v.qr_payload,'TQR-'||upper(v_pickup)||'-'||lpad(v.parcel_sequence::text,3,'0')),
    'parcel_weight',coalesce(v.actual_weight_kg,v.parcel_weight_kg),
    'remarks',v.remarks,
    'cargo_photo_url',coalesce(v.proof_photo_url,v.proof_photo_path),
    'cargo_photo_name',v.proof_file_name,
    'photo_status',coalesce(v.proof_check_status,v.verification_status,v.status,'PENDING_REVIEW'),
    'saved',true,
    'submitted_at',v.submitted_at,
    'reviewed_at',v.reviewed_at
  ) order by v.parcel_sequence),'[]'::jsonb)
  into v_rows
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup;

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'pickup_id',v_pickup,
    'expected_count',v_expected,
    'parcels',v_rows
  );
end;
$$;

revoke all on function public.be_pickup_parcel_capture_snapshot(text) from public,anon;
grant execute on function public.be_pickup_parcel_capture_snapshot(text) to authenticated;


create or replace function public.be_pickup_parcel_capture_save(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_pickup text:=nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id','')),'');
  v_seq integer:=coalesce(nullif(p_payload->>'line_no','')::integer,nullif(p_payload->>'row_no','')::integer,0);
  v_weight numeric:=coalesce(nullif(p_payload->>'parcel_weight','')::numeric,nullif(p_payload->>'actual_weight_kg','')::numeric,0);
  v_delivery text:=nullif(upper(btrim(coalesce(p_payload->>'delivery_way_id',''))),'');
  v_waybill text:=nullif(btrim(coalesce(p_payload->>'waybill_no','')),'');
  v_proof text:=nullif(btrim(coalesce(p_payload->>'cargo_photo_url',p_payload->>'proof_url','')),'');
  v_result jsonb;
begin
  if v_pickup is null then raise exception 'pickup_id is required'; end if;
  perform public.be_rider_assert_assigned_pickup(v_pickup);

  if v_seq<1 then raise exception 'parcel line number is required'; end if;
  if v_weight<=0 then raise exception 'Actual parcel weight must be greater than zero'; end if;
  if v_proof is null then raise exception 'Approved cargo photo upload is required'; end if;

  v_result:=public.be_rider_upsert_parcel_proof(
    v_pickup,
    v_seq,
    v_weight,
    v_proof,
    v_delivery,
    coalesce(v_delivery,v_waybill),
    v_waybill,
    nullif(btrim(coalesce(p_payload->>'remarks','')),''),
    nullif(btrim(coalesce(p_payload->>'cargo_photo_name',p_payload->>'proof_file_name','')),''),
    null
  );

  update public.be_portal_cargo_events e
  set field_pickup_checked=true,
      field_pickup_checked_at=now(),
      field_pickup_checked_by=v_identity->>'worker_code',
      field_pickup_photo_url=v_proof,
      field_pickup_weight_kg=v_weight,
      pickup_verification_status='PENDING_REVIEW',
      pickup_verification_note=nullif(btrim(coalesce(p_payload->>'remarks','')),''),
      updated_at=now()
  where e.pickup_id=v_pickup
    and (
      v_delivery is null
      or upper(coalesce(e.delivery_way_id,e.deliver_way_id,e.tracking_no,e.tracking_number,''))=v_delivery
    );

  insert into public.be_portal_cargo_events(
    pickup_id,delivery_way_id,tracking_no,event_type,event_status,event_note,
    actor_role,actor_type,actor_code,actor_email,source_module,source_table,source_key,
    proof_url,weight_kg,field_pickup_checked,field_pickup_checked_at,field_pickup_checked_by,
    field_pickup_photo_url,field_pickup_weight_kg,pickup_verification_status,pickup_verification_note,
    metadata,created_at,updated_at
  ) values (
    v_pickup,v_delivery,coalesce(v_delivery,v_waybill),
    'PICKUP_PARCEL_VERIFIED','PENDING_REVIEW','Rider submitted parcel proof for Enterprise review.',
    coalesce(v_identity->>'role','rider'),coalesce(v_identity->>'role','rider'),
    v_identity->>'worker_code',v_identity->>'email','RIDER_APP','be_pickup_parcel_verifications',
    v_pickup||':'||v_seq::text,v_proof,v_weight,true,now(),v_identity->>'worker_code',
    v_proof,v_weight,'PENDING_REVIEW',nullif(btrim(coalesce(p_payload->>'remarks','')),''),
    jsonb_build_object('parcel_sequence',v_seq,'waybill_no',v_waybill,'source','RIDER_ENTERPRISE_V89'),
    now(),now()
  );

  return v_result||jsonb_build_object(
    'photo_status','PENDING_REVIEW',
    'enterprise_event_synced',true,
    'worker_code',v_identity->>'worker_code'
  );
end;
$$;

revoke all on function public.be_pickup_parcel_capture_save(jsonb) from public,anon;
grant execute on function public.be_pickup_parcel_capture_save(jsonb) to authenticated;


create or replace function public.be_rider_availability_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_row jsonb:='{}'::jsonb;
begin
  select coalesce(to_jsonb(a),'{}'::jsonb) into v_row
  from public.be_rider_availability a
  where upper(a.rider_code)=upper(v_identity->>'worker_code')
  limit 1;

  return jsonb_build_object('ok',true,'identity',v_identity,'availability',v_row);
end;
$$;

revoke all on function public.be_rider_availability_snapshot() from public,anon;
grant execute on function public.be_rider_availability_snapshot() to authenticated;


create or replace function public.be_rider_availability_save(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_row jsonb;
begin
  insert into public.be_rider_availability(
    rider_code,is_online,shift_date,shift_start,shift_end,vehicle_type,vehicle_plate,
    preferred_language,metadata,updated_at,created_at
  ) values (
    v_code,
    coalesce((p_payload->>'is_online')::boolean,false),
    nullif(p_payload->>'shift_date','')::date,
    nullif(p_payload->>'shift_start','')::time,
    nullif(p_payload->>'shift_end','')::time,
    nullif(btrim(coalesce(p_payload->>'vehicle_type','')),''),
    nullif(btrim(coalesce(p_payload->>'vehicle_plate','')),''),
    coalesce(nullif(btrim(coalesce(p_payload->>'preferred_language','')),''),'English'),
    jsonb_build_object('auth_user_id',auth.uid(),'email',v_identity->>'email','source','RIDER_APP_V89'),
    now(),now()
  )
  on conflict(rider_code) do update set
    is_online=excluded.is_online,
    shift_date=excluded.shift_date,
    shift_start=excluded.shift_start,
    shift_end=excluded.shift_end,
    vehicle_type=excluded.vehicle_type,
    vehicle_plate=excluded.vehicle_plate,
    preferred_language=excluded.preferred_language,
    metadata=coalesce(public.be_rider_availability.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now()
  returning to_jsonb(be_rider_availability.*) into v_row;

  update public.be_mobile_workforce_accounts
  set vehicle_type=coalesce(nullif(btrim(p_payload->>'vehicle_type'),''),vehicle_type),
      license_plate=coalesce(nullif(btrim(p_payload->>'vehicle_plate'),''),license_plate),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'rider_is_online',coalesce((p_payload->>'is_online')::boolean,false),
        'shift_date',nullif(p_payload->>'shift_date',''),
        'shift_start',nullif(p_payload->>'shift_start',''),
        'shift_end',nullif(p_payload->>'shift_end',''),
        'preferred_language',coalesce(nullif(p_payload->>'preferred_language',''),'English'),
        'rider_app_synced_at',now()
      ),
      updated_at=now()
  where auth_user_id=auth.uid();

  return jsonb_build_object('ok',true,'identity',v_identity,'availability',v_row);
end;
$$;

revoke all on function public.be_rider_availability_save(jsonb) from public,anon;
grant execute on function public.be_rider_availability_save(jsonb) to authenticated;


create or replace function public.be_rider_document_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_rows jsonb:='[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb)
  into v_rows
  from public.be_rider_documents d
  where upper(d.rider_code)=upper(v_identity->>'worker_code');

  return jsonb_build_object('ok',true,'identity',v_identity,'documents',v_rows);
end;
$$;

revoke all on function public.be_rider_document_snapshot() from public,anon;
grant execute on function public.be_rider_document_snapshot() to authenticated;


create or replace function public.be_rider_document_save(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_type text:=lower(nullif(btrim(coalesce(p_payload->>'document_type','')),''));
  v_name text:=nullif(btrim(coalesce(p_payload->>'file_name','')),'');
  v_data text:=nullif(coalesce(p_payload->>'file_data_url',''),'');
  v_row jsonb;
begin
  if v_type is null then raise exception 'document_type is required'; end if;
  if v_name is null or v_data is null then raise exception 'A document file is required'; end if;
  if octet_length(v_data)>8388608 then raise exception 'Document payload exceeds the 8 MB application limit'; end if;

  insert into public.be_rider_documents(
    rider_code,document_type,file_name,file_data_url,verification_status,metadata,created_at
  ) values (
    v_code,v_type,v_name,v_data,'PENDING',
    jsonb_build_object('auth_user_id',auth.uid(),'email',v_identity->>'email','source','RIDER_APP_V89'),
    now()
  )
  returning to_jsonb(be_rider_documents.*) into v_row;

  insert into public.be_app_notifications(
    target_role,title,message,notification_type,category,status,created_at,metadata
  ) values (
    'operations','Rider document submitted',
    coalesce(v_identity->>'display_name',v_code)||' submitted '||replace(v_type,'_',' ')||' for verification.',
    'RIDER_DOCUMENT','RIDER_OPERATIONS','OPEN',now(),
    jsonb_build_object('rider_code',v_code,'document_id',v_row->>'id','document_type',v_type,'source','RIDER_APP_V89')
  );

  return jsonb_build_object('ok',true,'document',v_row);
end;
$$;

revoke all on function public.be_rider_document_save(jsonb) from public,anon;
grant execute on function public.be_rider_document_save(jsonb) to authenticated;


create or replace function public.be_rider_support_snapshot(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_rows jsonb:='[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select *
    from public.be_rider_support_tickets t
    where upper(t.rider_code)=upper(v_identity->>'worker_code')
    order by t.created_at desc
    limit least(greatest(coalesce(p_limit,100),1),300)
  ) x;

  return jsonb_build_object('ok',true,'identity',v_identity,'tickets',v_rows);
end;
$$;

revoke all on function public.be_rider_support_snapshot(integer) from public,anon;
grant execute on function public.be_rider_support_snapshot(integer) to authenticated;


create or replace function public.be_rider_support_ticket_save(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_pickup text:=nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_type text:=lower(coalesce(nullif(btrim(p_payload->>'ticket_type'),''),'app_error'));
  v_priority text:=lower(coalesce(nullif(btrim(p_payload->>'priority'),''),'normal'));
  v_subject text:=coalesce(nullif(btrim(p_payload->>'subject'),''),'Rider support request');
  v_message text:=nullif(btrim(coalesce(p_payload->>'message','')),'');
  v_id uuid:=gen_random_uuid();
  v_cs_id uuid:=gen_random_uuid();
  v_ticket_no text;
  v_row jsonb;
begin
  if v_message is null then raise exception 'Support message is required'; end if;

  insert into public.be_rider_support_tickets(
    id,rider_code,pickup_id,ticket_type,priority,subject,message,status,metadata,created_at,updated_at
  ) values (
    v_id,v_code,v_pickup,v_type,v_priority,v_subject,v_message,'OPEN',
    jsonb_build_object('auth_user_id',auth.uid(),'email',v_identity->>'email','source','RIDER_APP_V89'),
    now(),now()
  )
  returning to_jsonb(be_rider_support_tickets.*) into v_row;

  v_ticket_no:='CS-RIDER-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_cs_id::text,'-',''),1,8));

  insert into public.be_cs_tickets(
    id,ticket_no,way_id,pickup_id,customer_name,customer_phone,issue_type,source,
    title,description,priority,status,created_by,payload,created_at,updated_at
  ) values (
    v_cs_id,v_ticket_no,null,v_pickup,
    coalesce(v_identity->>'display_name',v_code),null,
    upper(v_type),'rider_app',v_subject,v_message,v_priority,'open',auth.uid(),
    jsonb_build_object('rider_code',v_code,'rider_ticket_id',v_id,'role',v_identity->>'role','source','RIDER_APP_V89'),
    now(),now()
  );

  insert into public.be_app_notifications(
    target_role,pickup_id,title,message,notification_type,category,status,created_at,metadata
  ) values (
    'operations',v_pickup,'Rider support ticket',
    coalesce(v_identity->>'display_name',v_code)||': '||v_subject,
    'RIDER_SUPPORT','RIDER_OPERATIONS','OPEN',now(),
    jsonb_build_object('rider_code',v_code,'rider_ticket_id',v_id,'cs_ticket_id',v_cs_id,'cs_ticket_no',v_ticket_no)
  );

  return jsonb_build_object('ok',true,'ticket',v_row,'cs_ticket_no',v_ticket_no,'enterprise_synced',true);
end;
$$;

revoke all on function public.be_rider_support_ticket_save(jsonb) from public,anon;
grant execute on function public.be_rider_support_ticket_save(jsonb) to authenticated;


create or replace function public.be_rider_branch_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_branch_code text:=nullif(btrim(v_identity->>'branch_code'),'');
  v_assignment jsonb:='{}'::jsonb;
  v_branch jsonb:='{}'::jsonb;
  v_mobile jsonb;
  v_pickups jsonb:='[]'::jsonb;
begin
  select coalesce(to_jsonb(a),'{}'::jsonb)
  into v_assignment
  from public.be_branch_rider_assignments a
  where upper(a.rider_code)=v_code
    and upper(coalesce(a.status,'ACTIVE')) not in ('INACTIVE','DISABLED','TERMINATED')
  order by a.updated_at desc nulls last,a.created_at desc nulls last
  limit 1;

  v_branch_code:=coalesce(nullif(v_assignment->>'branch_code',''),v_branch_code);

  if v_branch_code is not null then
    select coalesce(to_jsonb(b),'{}'::jsonb)
    into v_branch
    from public.be_branch_offices b
    where upper(b.branch_code)=upper(v_branch_code)
    order by b.updated_at desc nulls last
    limit 1;
  end if;

  v_mobile:=public.be_field_team_mobile_snapshot_v77('{}'::jsonb);

  select coalesce(jsonb_agg(e),'[]'::jsonb)
  into v_pickups
  from jsonb_array_elements(coalesce(v_mobile->'jobs','[]'::jsonb)) e
  where coalesce(e->>'job_kind','PICKUP')='PICKUP';

  return jsonb_build_object(
    'ok',true,'identity',v_identity,'branch_code',v_branch_code,
    'branch',v_branch,'assignment',v_assignment,'pickups',v_pickups
  );
end;
$$;

revoke all on function public.be_rider_branch_snapshot() from public,anon;
grant execute on function public.be_rider_branch_snapshot() to authenticated;


create or replace function public.be_rider_history_snapshot(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_role text:=lower(v_identity->>'role');
  v_email text:=lower(coalesce(v_identity->>'email',''));
  v_pickups jsonb:='[]'::jsonb;
  v_deliveries jsonb:='[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.completed_at desc),'[]'::jsonb)
  into v_pickups
  from (
    select
      v.pickup_id,
      count(*) as parcel_count,
      count(*) filter (where upper(coalesce(v.proof_check_status,v.verification_status,'')) in ('APPROVED','VERIFIED','PASS')) as reviewed_count,
      max(coalesce(v.reviewed_at,v.submitted_at,v.updated_at,v.created_at)) as completed_at,
      max(v.remarks) as remarks
    from public.be_pickup_parcel_verifications v
    where coalesce(v.submitted_by,'')=auth.uid()::text
       or lower(coalesce(v.verified_by_email,v.actor_email,''))=v_email
    group by v.pickup_id
    order by max(coalesce(v.reviewed_at,v.submitted_at,v.updated_at,v.created_at)) desc
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.completed_at desc),'[]'::jsonb)
  into v_deliveries
  from (
    select
      j.wayplan_id,j.pickup_id,j.pickup_way_id,j.delivery_way_id,j.waybill_no,
      j.recipient_name,j.recipient_phone,j.township,j.address,j.cod_amount,j.cod_collected,
      j.stop_status,j.rider_status,j.failed_reason,j.rider_proof_url,
      coalesce(j.delivered_at,j.wayplan_created_at) as completed_at
    from public.be_v_rider_delivery_wayplan_jobs j
    where (
      case v_role
        when 'driver' then upper(coalesce(j.driver_code,''))=v_code
        when 'helper' then upper(coalesce(j.helper_code,''))=v_code
        else upper(coalesce(j.rider_code,''))=v_code
      end
    )
    and upper(coalesce(j.stop_status,j.rider_status,'')) in (
      'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','RETURN_TO_WAREHOUSE','RTO'
    )
    order by coalesce(j.delivered_at,j.wayplan_created_at) desc
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,'identity',v_identity,
    'pickups',v_pickups,'deliveries',v_deliveries,
    'counts',jsonb_build_object('pickups',jsonb_array_length(v_pickups),'deliveries',jsonb_array_length(v_deliveries))
  );
end;
$$;

revoke all on function public.be_rider_history_snapshot(integer) from public,anon;
grant execute on function public.be_rider_history_snapshot(integer) to authenticated;


create or replace function public.be_rider_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_mobile jsonb:=public.be_field_team_mobile_snapshot_v77('{}'::jsonb);
  v_wallet jsonb:=public.be_rider_wallet_snapshot('{}'::jsonb);
  v_branch jsonb:=public.be_rider_branch_snapshot();
  v_pickups jsonb:='[]'::jsonb;
  v_deliveries jsonb:='[]'::jsonb;
begin
  select coalesce(jsonb_agg(e),'[]'::jsonb)
  into v_pickups
  from jsonb_array_elements(coalesce(v_mobile->'jobs','[]'::jsonb)) e
  where coalesce(e->>'job_kind','PICKUP')='PICKUP';

  select coalesce(jsonb_agg(e),'[]'::jsonb)
  into v_deliveries
  from jsonb_array_elements(coalesce(v_mobile->'jobs','[]'::jsonb)) e
  where e->>'job_kind'='DELIVERY';

  return jsonb_build_object(
    'ok',true,
    'identity',v_mobile->'identity',
    'pickups',v_pickups,
    'deliveries',v_deliveries,
    'notifications',coalesce(v_mobile->'notifications','[]'::jsonb),
    'counts',coalesce(v_mobile->'counts','{}'::jsonb)||jsonb_build_object(
      'pickups',jsonb_array_length(v_pickups),
      'deliveries',jsonb_array_length(v_deliveries)
    ),
    'wallet',coalesce(v_wallet->'totals','{}'::jsonb),
    'branch',coalesce(v_branch->'branch','{}'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function public.be_rider_dashboard_snapshot() from public,anon;
grant execute on function public.be_rider_dashboard_snapshot() to authenticated;


create or replace function public.be_rider_submit_cod_settlement(
  p_pickup_id text default null,
  p_rider_email text default null,
  p_cod_amount numeric default 0,
  p_remark text default null,
  p_pickup_way_id text default null,
  p_rider_code text default null,
  p_delivery_way_id text default null,
  p_waybill_no text default null,
  p_invoice_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(v_identity->>'worker_code');
  v_role text:=lower(v_identity->>'role');
  v_email text:=lower(coalesce(v_identity->>'email',''));
  v_delivery text:=coalesce(
    public.be_normalize_deliveryway_id(p_delivery_way_id),
    public.be_normalize_deliveryway_id(p_pickup_id),
    public.be_deliveryway_id_from_waybill_no(p_waybill_no),
    public.be_deliveryway_id_from_invoice_no(p_invoice_no)
  );
  v_job public.be_v_rider_delivery_wayplan_jobs%rowtype;
  v_pickup_way text;
  v_amount numeric;
begin
  if v_delivery is null and public.be_normalize_pickupway_id(coalesce(p_pickup_way_id,p_pickup_id)) is not null then
    select j.* into v_job
    from public.be_v_rider_delivery_wayplan_jobs j
    where j.pickup_way_id=public.be_normalize_pickupway_id(coalesce(p_pickup_way_id,p_pickup_id))
      and upper(coalesce(j.stop_status,j.rider_status,'')) in ('DELIVERED','COMPLETED')
      and case v_role
        when 'driver' then upper(coalesce(j.driver_code,''))=v_code
        when 'helper' then upper(coalesce(j.helper_code,''))=v_code
        else upper(coalesce(j.rider_code,''))=v_code
      end
    order by j.delivered_at desc nulls last
    limit 1;
    v_delivery:=v_job.delivery_way_id;
  else
    select j.* into v_job
    from public.be_v_rider_delivery_wayplan_jobs j
    where j.delivery_way_id=v_delivery
      and case v_role
        when 'driver' then upper(coalesce(j.driver_code,''))=v_code
        when 'helper' then upper(coalesce(j.helper_code,''))=v_code
        else upper(coalesce(j.rider_code,''))=v_code
      end
    limit 1;
  end if;

  if v_delivery is null or v_job.delivery_way_id is null then
    raise exception 'Assigned delivered parcel is required for COD settlement';
  end if;

  if upper(coalesce(v_job.stop_status,v_job.rider_status,'')) not in ('DELIVERED','COMPLETED') then
    raise exception 'COD settlement is allowed only after delivery completion';
  end if;

  v_pickup_way:=coalesce(v_job.pickup_way_id,public.be_normalize_pickupway_id(p_pickup_way_id),public.be_normalize_pickupway_id(p_pickup_id));
  if v_pickup_way is null then raise exception 'Valid PickupWayID is required for COD settlement'; end if;

  v_amount:=coalesce(v_job.cod_collected,v_job.cod_amount,0);
  if v_amount<=0 then raise exception 'No collected COD is recorded for this delivered parcel'; end if;

  return public.be_rider_update_pickup_status(
    v_pickup_way,
    v_email,
    v_code,
    'COD_SUBMITTED',
    null,
    null,
    jsonb_build_object(
      'delivery_way_id',v_delivery,
      'tracking_no',v_delivery,
      'waybill_no',coalesce(v_job.waybill_no,public.be_make_waybill_no(v_delivery)),
      'invoice_no',public.be_make_invoice_no(v_delivery),
      'cod_collected_amount',v_amount,
      'cod_settlement_status','SUBMITTED_TO_FINANCE',
      'cod_handover_submitted_at',now(),
      'remark',p_remark,
      'authenticated_worker_code',v_code,
      'client_requested_amount',coalesce(p_cod_amount,0),
      'source','RIDER_ENTERPRISE_V89'
    )
  );
end;
$$;

revoke all on function public.be_rider_submit_cod_settlement(text,text,numeric,text,text,text,text,text,text) from public,anon;
grant execute on function public.be_rider_submit_cod_settlement(text,text,numeric,text,text,text,text,text,text) to authenticated;
