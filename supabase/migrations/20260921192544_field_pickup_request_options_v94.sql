-- V94: authenticated Rider/Driver/Helper pickup request dropdown synchronized with Enterprise Pickup Request.

create or replace function public.be_field_pickup_request_options_v94(p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_uid text:=coalesce(v_identity->>'auth_user_id','');
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_email text:=lower(coalesce(v_identity->>'email',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_branch text:=upper(coalesce(v_identity->>'branch_code',''));
  v_limit integer:=least(greatest(coalesce(p_limit,300),1),500);
  v_rows jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  if v_role not in ('rider','driver','helper') then
    raise exception 'SIGNED_IN_ACCOUNT_IS_NOT_FIELD_TEAM' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(row_json order by assigned_to_me desc, pickup_date desc nulls last, created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select
      jsonb_strip_nulls(jsonb_build_object(
        'id',p.id,
        'pickup_id',coalesce(nullif(p.pickup_id,''),nullif(p.pickup_way_id,''),nullif(p.request_code,'')),
        'pickup_way_id',coalesce(nullif(p.pickup_way_id,''),nullif(p.pickup_id,''),nullif(p.request_code,'')),
        'request_code',coalesce(nullif(p.request_code,''),nullif(p.pickup_id,''),nullif(p.pickup_way_id,'')),
        'merchant_code',p.merchant_code,
        'merchant_name',p.merchant_name,
        'sender_name',coalesce(nullif(p.sender_name,''),nullif(p.contact_person,''),nullif(p.merchant_name,'')),
        'sender_phone',coalesce(nullif(p.sender_phone,''),nullif(p.phone,''),nullif(p.customer_phone,'')),
        'pickup_address',coalesce(nullif(p.pickup_address,''),nullif(p.address,''),nullif(p.metadata->>'pickup_address','')),
        'pickup_township',coalesce(nullif(p.pickup_township,''),nullif(p.township,''),nullif(p.metadata->>'pickup_township','')),
        'pickup_city',coalesce(nullif(p.pickup_city,''),nullif(p.city,''),nullif(p.metadata->>'pickup_city','')),
        'pickup_date',p.pickup_date,
        'pickup_time',p.pickup_time,
        'parcel_count',greatest(coalesce(p.expected_parcels,p.expected_parcel_count,p.parcel_count,1),1),
        'expected_parcels',greatest(coalesce(p.expected_parcels,p.expected_parcel_count,p.parcel_count,1),1),
        'required_vehicle',coalesce(nullif(p.required_vehicle,''),nullif(p.vehicle_type,''),nullif(p.metadata->>'required_vehicle','')),
        'status',p.status,
        'pickup_status',p.pickup_status,
        'workflow_stage',p.workflow_stage,
        'assignment_status',p.assignment_status,
        'team_acceptance_status',p.team_acceptance_status,
        'branch_code',coalesce(nullif(p.branch_code,''),nullif(p.assigned_branch,''),nullif(p.branch,'')),
        'assigned_rider_code',p.assigned_rider_code,
        'assigned_rider_name',p.assigned_rider_name,
        'assigned_driver_code',p.assigned_driver_code,
        'assigned_driver_name',p.assigned_driver_name,
        'assigned_helper_code',p.assigned_helper_code,
        'assigned_helper_name',p.assigned_helper_name,
        'assigned_vehicle_plate',p.assigned_vehicle_plate,
        'assigned_to_me',x.assigned_to_me,
        'has_field_assignment',x.has_assignment,
        'can_verify',x.assigned_to_me,
        'assignment_scope',
          case
            when x.assigned_to_me then 'ASSIGNED_TO_ME'
            when not x.has_assignment then 'WAITING_ASSIGNMENT'
            else 'ASSIGNED_TO_OTHER'
          end,
        'assignment_label',
          case
            when x.assigned_to_me then 'Assigned to me'
            when not x.has_assignment then 'Waiting assignment'
            else 'Assigned to another worker'
          end,
        'source','be_portal_pickup_requests',
        'created_at',p.created_at,
        'updated_at',p.updated_at
      )) as row_json,
      x.assigned_to_me,
      p.pickup_date,
      p.created_at
    from public.be_portal_pickup_requests p
    cross join lateral (
      select
        case v_role
          when 'rider' then
            coalesce(p.assigned_rider_id::text,'')=v_uid
            or upper(coalesce(p.assigned_rider_code,''))=v_code
            or lower(coalesce(p.assigned_rider_email,''))=v_email
          when 'driver' then
            coalesce(p.assigned_driver_id::text,'')=v_uid
            or upper(coalesce(p.assigned_driver_code,''))=v_code
            or lower(coalesce(p.assigned_driver_email,''))=v_email
          else
            coalesce(p.assigned_helper_id::text,'')=v_uid
            or upper(coalesce(p.assigned_helper_code,''))=v_code
            or lower(coalesce(p.assigned_helper_email,''))=v_email
        end as assigned_to_me,
        (
          nullif(btrim(coalesce(p.assigned_rider_code,'')),'') is not null
          or nullif(btrim(coalesce(p.assigned_driver_code,'')),'') is not null
          or nullif(btrim(coalesce(p.assigned_helper_code,'')),'') is not null
          or nullif(btrim(coalesce(p.assigned_workforce_code,'')),'') is not null
          or p.assigned_rider_id is not null
          or p.assigned_driver_id is not null
          or p.assigned_helper_id is not null
          or nullif(btrim(coalesce(p.assigned_rider_email,'')),'') is not null
          or nullif(btrim(coalesce(p.assigned_driver_email,'')),'') is not null
          or nullif(btrim(coalesce(p.assigned_helper_email,'')),'') is not null
        ) as has_assignment
    ) x
    where coalesce(nullif(p.pickup_id,''),nullif(p.pickup_way_id,''),nullif(p.request_code,'')) is not null
      and upper(coalesce(p.status,'')) not in ('CANCELLED','ARCHIVED_TEST_DATA','COMPLETED','CLOSED')
      and upper(coalesce(p.pickup_status,'')) not in ('CANCELLED','COMPLETED','CLOSED')
      and (
        v_branch=''
        or upper(coalesce(nullif(p.branch_code,''),nullif(p.assigned_branch,''),nullif(p.branch,''),v_branch))=v_branch
      )
    order by x.assigned_to_me desc,p.pickup_date desc nulls last,p.created_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'requests',v_rows,
    'counts',jsonb_build_object(
      'total',jsonb_array_length(v_rows),
      'assigned_to_me',(select count(*) from jsonb_array_elements(v_rows)e where coalesce((e->>'assigned_to_me')::boolean,false)),
      'waiting_assignment',(select count(*) from jsonb_array_elements(v_rows)e where e->>'assignment_scope'='WAITING_ASSIGNMENT'),
      'assigned_to_other',(select count(*) from jsonb_array_elements(v_rows)e where e->>'assignment_scope'='ASSIGNED_TO_OTHER')
    ),
    'source','be_portal_pickup_requests',
    'build','FIELD_PICKUP_REQUEST_OPTIONS_V94'
  );
end;
$$;

revoke all on function public.be_field_pickup_request_options_v94(integer) from public,anon;
grant execute on function public.be_field_pickup_request_options_v94(integer) to authenticated;
