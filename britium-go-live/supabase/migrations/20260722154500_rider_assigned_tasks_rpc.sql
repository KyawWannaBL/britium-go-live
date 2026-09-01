-- Secure task feed for the authenticated Rider portal.

create or replace function public.be_rider_list_assigned_tasks(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := case
    when nullif(current_setting('request.jwt.claims', true), '') is null
      then '{}'::jsonb
    else current_setting('request.jwt.claims', true)::jsonb
  end;
  v_auth_role text := lower(coalesce(auth.role(), v_claims ->> 'role', ''));
  v_auth_email text := lower(coalesce(
    nullif(v_claims ->> 'email', ''),
    nullif(v_claims #>> '{user_metadata,email}', ''),
    ''
  ));
  v_auth_user_id uuid := auth.uid();
  v_claim_worker_code text := upper(coalesce(
    nullif(v_claims #>> '{app_metadata,worker_code}', ''),
    nullif(v_claims #>> '{user_metadata,worker_code}', ''),
    nullif(v_claims #>> '{app_metadata,account_code}', ''),
    nullif(v_claims #>> '{user_metadata,account_code}', ''),
    ''
  ));
  v_account jsonb := '{}'::jsonb;
  v_worker_code text := '';
  v_result jsonb := '[]'::jsonb;
begin
  if v_auth_role not in ('authenticated', 'service_role') then
    return jsonb_build_object(
      'ok', false,
      'error', 'AUTHENTICATION_REQUIRED'
    );
  end if;

  if v_auth_role <> 'service_role' then
    select to_jsonb(a)
    into v_account
    from public.be_mobile_workforce_accounts a
    where a.auth_user_id = v_auth_user_id
       or (
         v_auth_email <> ''
         and lower(coalesce(a.email, '')) = v_auth_email
       )
    order by
      case when a.auth_user_id = v_auth_user_id then 0 else 1 end,
      a.updated_at desc nulls last
    limit 1;

    v_worker_code := upper(coalesce(
      nullif(v_claim_worker_code, ''),
      nullif(v_account ->> 'workforce_code', ''),
      nullif(v_account ->> 'account_code', ''),
      ''
    ));

    if v_worker_code = '' and v_auth_email = '' and v_auth_user_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'RIDER_IDENTITY_NOT_RESOLVED'
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', x.id::text,
          'pickup_id', coalesce(
            nullif(x.record ->> 'pickup_id', ''),
            nullif(x.record ->> 'pickup_way_id', ''),
            x.id::text
          ),
          'pickup_way_id', coalesce(
            nullif(x.record ->> 'pickup_way_id', ''),
            nullif(x.record ->> 'pickup_id', '')
          ),
          'tracking_no', coalesce(
            nullif(x.record ->> 'tracking_no', ''),
            nullif(x.record ->> 'waybill_no', ''),
            nullif(x.record ->> 'delivery_way_id', ''),
            nullif(x.record ->> 'pickup_id', '')
          ),
          'merchant_name', coalesce(
            nullif(x.record ->> 'merchant_name', ''),
            nullif(x.record ->> 'merchant_code', '')
          ),
          'sender_name', coalesce(
            nullif(x.record ->> 'sender_name', ''),
            nullif(x.record ->> 'customer_name', ''),
            nullif(x.record ->> 'merchant_name', '')
          ),
          'sender_phone', coalesce(
            nullif(x.record ->> 'sender_phone', ''),
            nullif(x.record ->> 'customer_phone', '')
          ),
          'pickup_address', x.record ->> 'pickup_address',
          'pickup_township', coalesce(
            nullif(x.record ->> 'pickup_township', ''),
            nullif(x.record ->> 'township', '')
          ),
          'pickup_city', coalesce(
            nullif(x.record ->> 'pickup_city', ''),
            nullif(x.record ->> 'city', '')
          ),
          'parcel_count', case
            when coalesce(x.record ->> 'parcel_count', '') ~ '^[0-9]+$'
              then (x.record ->> 'parcel_count')::integer
            else 1
          end,
          'cod_amount', case
            when coalesce(
              nullif(x.record ->> 'cod_amount', ''),
              nullif(x.record ->> 'total_cod', ''),
              '0'
            ) ~ '^[0-9]+([.][0-9]+)?$'
              then coalesce(
                nullif(x.record ->> 'cod_amount', ''),
                nullif(x.record ->> 'total_cod', ''),
                '0'
              )::numeric
            else 0
          end,
          'status', coalesce(
            nullif(x.record ->> 'pickup_status', ''),
            nullif(x.record ->> 'rider_status', ''),
            nullif(x.record ->> 'status', ''),
            'assigned'
          ),
          'pickup_status', x.record ->> 'pickup_status',
          'rider_status', x.record ->> 'rider_status',
          'rider_app_stage', x.record ->> 'rider_app_stage',
          'assignment_status', x.record ->> 'assignment_status',
          'warehouse_status', x.record ->> 'warehouse_status',
          'workflow_stage', x.record ->> 'workflow_stage',
          'delivery_status', x.record ->> 'delivery_status',
          'assigned_rider_code', x.record ->> 'assigned_rider_code',
          'assigned_rider_name', x.record ->> 'assigned_rider_name',
          'assigned_at', x.record ->> 'assigned_at',
          'created_at', x.record ->> 'created_at',
          'updated_at', x.record ->> 'updated_at'
        )
      )
      order by
        nullif(x.record ->> 'assigned_at', '') desc nulls last,
        nullif(x.record ->> 'created_at', '') desc nulls last
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      p.id,
      to_jsonb(p) as record
    from public.be_portal_pickup_requests p
    where coalesce(to_jsonb(p) ->> 'status', '') not in (
      'cancelled',
      'archived_test_data'
    )
      and (
        v_auth_role = 'service_role'
        or (
          v_worker_code <> ''
          and upper(coalesce(
            to_jsonb(p) ->> 'assigned_rider_code',
            ''
          )) = v_worker_code
        )
        or (
          v_worker_code <> ''
          and upper(coalesce(
            to_jsonb(p) ->> 'assigned_workforce_code',
            ''
          )) = v_worker_code
        )
        or (
          v_auth_email <> ''
          and lower(coalesce(
            to_jsonb(p) ->> 'assigned_rider_email',
            ''
          )) = v_auth_email
        )
        or (
          v_auth_user_id is not null
          and coalesce(
            to_jsonb(p) ->> 'assigned_rider_id',
            ''
          ) = v_auth_user_id::text
        )
        or exists (
          select 1
          from public.be_mobile_workflow_tasks t
          where t.pickup_id = coalesce(
            nullif(to_jsonb(p) ->> 'pickup_id', ''),
            nullif(to_jsonb(p) ->> 'pickup_way_id', '')
          )
            and lower(coalesce(t.assignee_role, '')) = 'rider'
            and v_worker_code <> ''
            and upper(coalesce(t.assignee_code, '')) = v_worker_code
        )
      )
    order by
      nullif(to_jsonb(p) ->> 'assigned_at', '') desc nulls last,
      nullif(to_jsonb(p) ->> 'created_at', '') desc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'worker_code', nullif(v_worker_code, ''),
    'count', jsonb_array_length(v_result),
    'tasks', v_result
  );
end;
$$;
revoke all on function public.be_rider_list_assigned_tasks(integer)
from public;
revoke all on function public.be_rider_list_assigned_tasks(integer)
from anon;
grant execute on function public.be_rider_list_assigned_tasks(integer)
to authenticated;
grant execute on function public.be_rider_list_assigned_tasks(integer)
to service_role;
