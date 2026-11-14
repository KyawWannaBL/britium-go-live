create or replace function public.be_field_assigned_delivery_locations_v1(p_delivery_way_ids text[])
returns table(delivery_way_id text, latitude numeric, longitude numeric, coordinate_source text, review_status text)
language plpgsql security definer set search_path = 'public','auth','pg_temp'
as $function$
declare v_identity jsonb; v_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;
  v_identity := public.be_current_field_team_identity();
  v_role := lower(coalesce(v_identity->>'role',''));
  if v_role not in ('rider','driver','helper') or nullif(v_identity->>'worker_code','') is null then
    raise exception 'FIELD_TEAM_ROLE_REQUIRED' using errcode='42501';
  end if;
  if coalesce(array_length(p_delivery_way_ids,1),0) > 300 then
    raise exception 'MAX_300_DELIVERY_IDS' using errcode='22023';
  end if;
  return query
  with assigned as (
    select distinct upper(e->>'delivery_way_id') as id
    from jsonb_array_elements(coalesce(
      public.be_rider_delivery_wayplan_jobs(null,500)->'jobs','[]'::jsonb)) e
  )
  select loc.delivery_way_id,loc.latitude,loc.longitude,
    loc.coordinate_source,loc.review_status
  from public.be_delivery_location_registry loc
  join assigned a on a.id = upper(loc.delivery_way_id)
  where upper(loc.delivery_way_id) = any(
    select upper(x) from unnest(coalesce(p_delivery_way_ids,array[]::text[])) x
  );
end;
$function$;
revoke all on function public.be_field_assigned_delivery_locations_v1(text[]) from public,anon;
grant execute on function public.be_field_assigned_delivery_locations_v1(text[]) to authenticated;