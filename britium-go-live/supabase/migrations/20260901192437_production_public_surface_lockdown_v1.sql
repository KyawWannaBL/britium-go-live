begin;

-- Public tracking is intentionally anonymous, but a tracking identifier alone
-- must never disclose a customer or an operational record. Require both the
-- exact shipment identifier and the exact normalized customer phone number,
-- and return only customer-safe lifecycle fields.
create or replace function public.be_customer_portal_snapshot(
  p_actor_email text,
  p_phone text,
  p_tracking_no text default null
)
returns json
language sql
stable
security definer
set search_path = ''
as $function$
  with input as (
    select
      upper(btrim(coalesce(p_tracking_no, ''))) as tracking_no,
      regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as phone_no
  ), matches as (
    select p.*
    from public.be_portal_pickup_requests p
    cross join input i
    where length(i.tracking_no) >= 4
      and length(i.phone_no) >= 6
      and i.tracking_no = any (array[
        upper(btrim(coalesce(p.delivery_way_id, ''))),
        upper(btrim(coalesce(p.tracking_no, ''))),
        upper(btrim(coalesce(p.tracking_number, ''))),
        upper(btrim(coalesce(p.waybill_no, ''))),
        upper(btrim(coalesce(p.deliver_id, ''))),
        upper(btrim(coalesce(p.pickup_id, ''))),
        upper(btrim(coalesce(p.pickup_way_id, ''))),
        upper(btrim(coalesce(p.request_code, ''))),
        upper(btrim(coalesce(p.pickup_waybill_id, '')))
      ])
      and i.phone_no = any (array[
        regexp_replace(coalesce(p.recipient_phone, ''), '[^0-9]', '', 'g'),
        regexp_replace(coalesce(p.customer_phone, ''), '[^0-9]', '', 'g'),
        regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
      ])
    order by p.updated_at desc nulls last
    limit 10
  )
  select json_build_object(
    'shipments', coalesce(
      json_agg(
        json_build_object(
          'tracking_no', coalesce(
            nullif(m.delivery_way_id, ''),
            nullif(m.tracking_no, ''),
            nullif(m.tracking_number, ''),
            nullif(m.waybill_no, ''),
            nullif(m.deliver_id, ''),
            nullif(m.pickup_id, ''),
            nullif(m.request_code, '')
          ),
          'pickup_id', nullif(m.pickup_id, ''),
          'delivery_status', coalesce(
            nullif(m.delivery_status, ''),
            nullif(m.status, ''),
            nullif(m.operation_status, ''),
            nullif(m.workflow_stage, '')
          ),
          'warehouse_status', nullif(m.warehouse_status, ''),
          'dispatch_status', nullif(m.dispatch_status, ''),
          'township', coalesce(nullif(m.delivery_township, ''), nullif(m.township, '')),
          'exception_reason', nullif(m.exception_reason, ''),
          'delivered_at', m.delivered_at,
          'updated_at', m.updated_at
        ) order by m.updated_at desc nulls last
      ),
      '[]'::json
    ),
    'stats', json_build_object('matches', count(*))
  )
  from matches m;
$function$;

-- Legacy/UAT policies used PUBLIC or anon as the policy role. Retarget them to
-- authenticated so the existing authenticated behavior remains available
-- while anonymous sessions can no longer satisfy the policies.
do $block$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and ('public' = any(roles) or 'anon' = any(roles))
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end;
$block$;

-- Remove all anonymous table and sequence access. Public customer tracking and
-- field-team login resolution are exposed only through the narrow RPCs below.
revoke all privileges on all tables in schema public from public, anon;
revoke all privileges on all sequences in schema public from public, anon;

-- PostgreSQL grants function execution to PUBLIC by default. Close the current
-- surface, preserve authenticated application compatibility, and explicitly
-- reopen only the two pre-authentication endpoints required by the application.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant usage on schema public to anon;
grant execute on function public.be_customer_portal_snapshot(text, text, text) to anon;
grant execute on function public.be_field_team_resolve_login(text) to anon;

-- Keep future objects least-privilege by default. These defaults apply to
-- migrations created by the postgres owner used by this project.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

commit;
