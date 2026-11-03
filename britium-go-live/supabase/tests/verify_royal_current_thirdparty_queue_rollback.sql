-- Run only AFTER the paired Royal Express migration is authorized and installed.
-- Execute as a database administrator; the transaction always rolls back.
-- It tests CS visibility, denied Rider access, and Finance review creation
-- without persisting any third-party outcome or monetary movement.
begin;
do $verify$
declare
  cs_user uuid;
  rider_user uuid;
  royal_way text;
  queue_result jsonb;
  save_result jsonb;
  denied_result jsonb;
  before_cs integer;
  before_finance integer;
begin
  select auth_user_id into cs_user
  from public.be_user_account_registry
  where lower(replace(coalesce(nullif(role_code,''),nullif(app_role,''),nullif(user_role,''),role),'-','_'))='customer_service'
    and auth_user_id is not null
    and coalesce(active,true) and coalesce(is_active,true)
    and lower(coalesce(status,'active')) in ('active','enabled')
  limit 1;
  select auth_user_id into rider_user
  from public.be_user_account_registry
  where lower(replace(coalesce(nullif(role_code,''),nullif(app_role,''),nullif(user_role,''),role),'-','_'))='rider'
    and auth_user_id is not null
    and coalesce(active,true) and coalesce(is_active,true)
    and lower(coalesce(status,'active')) in ('active','enabled')
  limit 1;
  select p.delivery_way_id into royal_way
  from public.be_data_entry_parcel_details p
  where p.delivery_route_mode='ROYAL_EXPRESS'
    and private.be_current_operational_way_v1(p.delivery_way_id)
    and not exists(select 1 from public.be_thirdparty_cs_current_v1 c where c.delivery_way_id=p.delivery_way_id)
  order by p.delivery_way_id limit 1;
  if cs_user is null or rider_user is null or royal_way is null
  then raise exception 'POST_DEPLOY_QA_PRECONDITIONS_NOT_MET';end if;
  select count(*) into before_cs from public.be_thirdparty_cs_current_v1;
  select count(*) into before_finance from public.be_thirdparty_finance_review_v1;
  perform set_config('request.jwt.claim.sub',cs_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  queue_result:=public.be_cs_thirdparty_queue_v1(null,'ALL',300);
  if queue_result->>'ok'<>'true' or (queue_result->>'total')::int < 1
  then raise exception 'CS_QUEUE_UNEXPECTED: %',queue_result;end if;
  if not exists(
    select 1 from jsonb_array_elements(queue_result->'rows') elem
    where elem->>'delivery_way_id'=royal_way
      and coalesce((elem->>'schedule_occurrences')::integer,0)=0
  ) then raise exception 'CURRENT_ROYAL_WAY_NOT_IN_QUEUE';end if;
  save_result:=public.be_cs_thirdparty_confirm_v1(
    royal_way,'Royal Express','HANDED_TO_PARTNER','OTHER',
    'TRANSACTIONAL QA ONLY - ROLLED BACK','QA TEST ONLY',0);
  if save_result->>'ok'<>'true'
  then raise exception 'CS_SAVE_FAILED: %',save_result;end if;
  if not exists(select 1 from public.be_thirdparty_finance_review_v1
    where delivery_way_id=royal_way and finance_review_status='PARTNER_HANDOVER_REVIEW')
  then raise exception 'FINANCE_REVIEW_NOT_CREATED';end if;
  if (select count(*) from public.be_thirdparty_cs_current_v1)<>before_cs+1
    or (select count(*) from public.be_thirdparty_finance_review_v1)<>before_finance+1
  then raise exception 'UNEXPECTED_CONFIRMATION_REVIEW_CHANGE';end if;
  perform set_config('request.jwt.claim.sub',rider_user::text,true);
  denied_result:=public.be_cs_thirdparty_queue_v1(null,'ALL',300);
  if denied_result->>'error'<>'CS_OR_FINANCE_ROLE_REQUIRED'
  then raise exception 'RIDER_READ_ACCESS_NOT_DENIED';end if;
  denied_result:=public.be_cs_thirdparty_confirm_v1(
    royal_way,'Royal Express','DELIVERED',null,'DENIED QA TEST',null,1);
  if denied_result->>'error'<>'CS_ROLE_REQUIRED'
  then raise exception 'RIDER_WRITE_ACCESS_NOT_DENIED';end if;
  raise notice 'PASS Royal queue, unscheduled label, CS save, Finance review and Rider denial. ALL CHANGES ROLLED BACK.';
end $verify$;
rollback;
