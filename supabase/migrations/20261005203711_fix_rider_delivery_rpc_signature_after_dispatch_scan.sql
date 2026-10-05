create or replace function public.be_rider_delivery_wayplan_jobs_v187(
  p_rider_code text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_base jsonb := public.be_rider_delivery_wayplan_jobs(p_rider_code, p_limit);
  v_started timestamptz := public.be_rider_app_test_started_at_v187();
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(e),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'jobs','[]'::jsonb)) e
  where coalesce(
    nullif(e->>'wayplan_created_at','')::timestamptz,
    nullif(e->>'updated_at','')::timestamptz,
    '-infinity'::timestamptz
  ) >= v_started;

  return jsonb_build_object(
    'ok', true,
    'identity', v_base->'identity',
    'jobs', v_rows,
    'count', jsonb_array_length(v_rows),
    'source', 'be_rider_delivery_wayplan_jobs_v187',
    'test_started_at', v_started
  );
end;
$function$;

revoke all on function public.be_rider_delivery_wayplan_jobs_v187(text,integer) from public, anon;
grant execute on function public.be_rider_delivery_wayplan_jobs_v187(text,integer) to authenticated, service_role;
