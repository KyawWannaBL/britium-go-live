-- Super Admin-only read model for pickup quantity amendments.
-- Never grant direct access to the underlying requests table.
create or replace function public.be_superadmin_pending_pickup_count_reviews_v1()
returns table (
  id uuid,
  pickup_id text,
  original_count integer,
  requested_count integer,
  reason text,
  status text,
  requested_by uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id=auth.uid();
  if not exists (
    select 1 from public.be_user_roles r
    where lower(r.email)=v_email and lower(r.role)='superadmin'
  ) then
    raise exception 'Enterprise superadmin authorization required' using errcode='42501';
  end if;
  return query
    select q.id,q.pickup_id,q.original_count,q.requested_count,
           q.reason,q.status,q.requested_by
    from public.be_pickup_count_change_requests_v1 q
    where q.status='PENDING_REVIEW'
    order by q.id desc
    limit 100;
end;
$function$;

revoke all on function public.be_superadmin_pending_pickup_count_reviews_v1() from public, anon;
grant execute on function public.be_superadmin_pending_pickup_count_reviews_v1() to authenticated;
