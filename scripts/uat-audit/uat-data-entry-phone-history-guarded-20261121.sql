-- UAT ONLY: role-guarded Data Entry recipient phone history (no real customer dataset).
BEGIN;
SET LOCAL statement_timeout='35s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Not verified UAT'; END IF;
IF to_regprocedure('public.be_data_entry_phone_history_v81(text,integer)') IS NOT NULL THEN RAISE EXCEPTION 'Phone history already exists'; END IF;
END $gate$;
CREATE FUNCTION public.be_data_entry_phone_history_v81(p_phone text, p_limit integer DEFAULT 3)
 RETURNS TABLE(history_rank integer, recipient_name text, recipient_phone text, secondary_phone text, township text, city text, region_state text, recipient_address text, merchant_id text, delivery_way_id text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with input as (
    select regexp_replace(coalesce(p_phone,''), '\D', '', 'g') as normalized
    where auth.uid() IS NOT NULL
      and coalesce((public.be_data_entry_actor_access_v57('view',false)->>'allowed')::boolean,false)
  ),
  matches as (
    select
      d.recipient_name,
      d.contact_no_1,
      d.contact_no_2,
      d.township,
      d.city,
      d.region_state,
      d.recipient_address,
      d.merchant_id,
      d.delivery_way_id,
      d.saved_at,
      row_number() over (
        order by d.saved_at desc nulls last, d.updated_at desc nulls last, d.created_at desc nulls last
      )::integer as history_rank
    from public.be_data_entry_parcel_details d
    cross join input i
    where length(i.normalized) >= 6
      and (not exists (
       select 1 from public.be_user_account_registry sc
       where sc.auth_user_id=auth.uid()
         and (replace(lower(sc.role_code),'-','_')='branch_manager'
           or (upper(sc.branch_code)='MDY'
             and replace(lower(sc.role_code),'-','_') in ('data_entry','encoder','supervisor')))
     ) or exists (
       select 1 from public.be_portal_pickup_requests p
       join public.be_user_account_registry sc on sc.auth_user_id=auth.uid()
       where p.pickup_id=d.pickup_id and upper(p.branch_code)=upper(sc.branch_code)
         and sc.active and sc.is_active and lower(sc.status)='active'
         and public.be_employee_can_access_territory(null::uuid,p.branch_code,p.pickup_township,'read')
     ))
      and (
        regexp_replace(coalesce(d.contact_no_1,''), '\D', '', 'g') = i.normalized
        or regexp_replace(coalesce(d.contact_no_2,''), '\D', '', 'g') = i.normalized
      )
  )
  select
    m.history_rank,
    m.recipient_name,
    coalesce(nullif(m.contact_no_1,''), nullif(m.contact_no_2,''), p_phone),
    m.contact_no_2,
    m.township,
    m.city,
    m.region_state,
    m.recipient_address,
    m.merchant_id,
    m.delivery_way_id,
    m.saved_at
  from matches m
  order by m.history_rank
  limit greatest(1,least(coalesce(p_limit,3),10));
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_phone_history_v81(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_phone_history_v81(text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
