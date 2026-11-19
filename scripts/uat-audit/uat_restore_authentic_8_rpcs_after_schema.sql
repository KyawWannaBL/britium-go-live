-- Britium Express Mandalay/Insein UAT ONLY.
-- Authentic server-side functions exported directly from production's PostgreSQL catalog.
-- Not a standalone baseline migration: first restore historical operational dependencies.
-- Refuses to overwrite the existing production implementation.
BEGIN;
DO $preflight$
DECLARE missing text;
BEGIN
  IF to_regprocedure('public.be_role_dashboard_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to overwrite an existing operational Dashboard RPC';
  END IF;
  WITH required(name) AS (
    VALUES
    ('be_user_account_registry'),
    ('be_branch_intake_actor_v1'),
    ('be_branch_intake_parcels_v1'),
    ('be_branch_intake_manifests_v1'),
    ('be_current_user_role'),
    ('be_current_role'),
    ('be_data_entry_parcel_details'),
    ('be_employee_can_access_territory'),
    ('be_cs_resolve_parcel_branch'),
    ('be_customer_service_can_manage_pickup_request'),
    ('be_warehouse_scan_events'),
    ('be_operational_events'),
    ('be_waybill_status_events'),
    ('be_customer_voice_actions'),
    ('be_customer_voices'),
    ('be_customer_voice_escalations'),
    ('be_golive_live_cutoff_v1'),
    ('be_merchant_master'),
    ('be_thirdparty_cs_current_v1'),
    ('be_thirdparty_finance_review_v1'),
    ('be_data_entry_require_access_v57'),
    ('merchant_master'),
    ('be_portal_pickup_requests'),
    ('be_wayplan_dispatch_stops'),
    ('be_v_finance_merchant_settlement_queue_v2'),
    ('be_hr_dashboard'),
    ('be_mobile_workforce_accounts'),
    ('be_master_merchants'),
    ('be_marketing_leads'),
    ('be_bd_accounts'),
    ('be_branch_amendment_requests'),
    ('be_branch_staff'),
    ('be_branch_offices'),
    ('be_warehouse_scan_lifecycle_snapshot_v158'),
    ('be_warehouse_return_scans_v39'),
    ('be_dispatch_scans_v39'),
    ('be_delivery_attempt_state_v39'),
    ('be_wayplan_membership_v40'),
    ('be_wayplan_dispatches'),
    ('be_wayplan_review_v43'),
    ('be_delivery_reschedules_v71')
  )
  SELECT string_agg(name,', ' ORDER BY name) INTO missing
  FROM required
  WHERE to_regclass(format('%I.%I','public',name)) IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=name
    );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'UAT schema incomplete; restore authentic dependencies first: %', missing;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.be_branch_intake_snapshot_v1(p_branch text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_branch text;v_hq boolean;
BEGIN
 v_hq:=EXISTS(SELECT 1 FROM public.be_user_account_registry r
 WHERE r.auth_user_id=auth.uid() AND upper(r.branch_code)='YGN'
 AND coalesce(r.active,true) AND coalesce(r.is_active,true)
 AND lower(r.status) IN ('active','enabled'));
 v_branch:=public.be_branch_intake_actor_v1(p_branch,v_hq);
 RETURN jsonb_build_object('ok',true,'branch_code',v_branch,
 'intakes',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.received_at DESC)
     FROM (SELECT * FROM public.be_branch_intake_parcels_v1
       WHERE branch_code=v_branch ORDER BY received_at DESC LIMIT 250) i),'[]'::jsonb),
 'manifests',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC)
     FROM (SELECT * FROM public.be_branch_intake_manifests_v1
       WHERE branch_code=v_branch ORDER BY created_at DESC LIMIT 50) m),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.be_branch_intake_snapshot_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_branch_intake_snapshot_v1(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_cs_parcel_support_queue(p_limit integer DEFAULT 300, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_result jsonb;
begin
 -- BRANCH_DEPARTMENT_LEGACY_GUARD_V1
 if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then raise exception 'USE_BRANCH_DEPARTMENT_WORKSPACE' using errcode='42501';end if;
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_role not in (
    'customer_service','cs','support','super_admin','superadmin','app_owner','sys',
    'admin','operations_admin','operations','supervisor'
  ) then
    raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  with parcel_base as (
    select
      d.delivery_way_id,
      d.pickup_id,
      d.created_at,
      d.updated_at,
      to_jsonb(d) as parcel_json
    from public.be_data_entry_parcel_details d
    where nullif(btrim(coalesce(d.delivery_way_id, '')), '') is not null
  ), accessible as (
    select p.*
    from parcel_base p
    where
      public.be_employee_can_access_territory(
        null,
        public.be_cs_resolve_parcel_branch(p.parcel_json),
        coalesce(
          nullif(p.parcel_json->>'township', ''),
          nullif(p.parcel_json->>'delivery_township', ''),
          nullif(p.parcel_json->>'recipient_township', '')
        ),
        'read'
      )
      or public.be_customer_service_can_manage_pickup_request(
        public.be_cs_resolve_parcel_branch(p.parcel_json),
        coalesce(
          nullif(p.parcel_json->>'township', ''),
          nullif(p.parcel_json->>'delivery_township', ''),
          nullif(p.parcel_json->>'recipient_township', '')
        ),
        'read'
      )
  ), searched as (
    select p.*
    from accessible p
    where nullif(btrim(coalesce(p_search, '')), '') is null
       or lower(concat_ws(' ',
          p.delivery_way_id,
          p.pickup_id,
          p.parcel_json->>'waybill_no',
          p.parcel_json->>'recipient_name',
          p.parcel_json->>'recipient_phone',
          p.parcel_json->>'contact_no_1',
          p.parcel_json->>'delivery_address',
          p.parcel_json->>'recipient_address',
          p.parcel_json->>'address',
          p.parcel_json->>'township',
          p.parcel_json->>'assigned_rider_name'
       )) like '%' || lower(btrim(p_search)) || '%'
  ), enriched as (
    select
      p.delivery_way_id,
      p.pickup_id,
      p.updated_at,
      p.parcel_json,
      ws.scan_type as latest_warehouse_event,
      ws.scan_note as latest_warehouse_note,
      ws.created_at as latest_warehouse_event_at,
      oe.to_status as latest_operation_event,
      oe.event_note as latest_operation_note,
      oe.created_at as latest_operation_event_at,
      se.event_code as latest_status_event_code,
      se.event_name as latest_status_event_name,
      se.source_module as latest_status_source,
      se.created_at as latest_status_event_at,
      cv.open_voice_count,
      cv.current_owner_department,
      cv.latest_customer_voice,
      cv.latest_internal_action,
      cv.escalation_flag,
      cv.sla_due_at,
      cv.latest_voice_priority,
      cv.latest_voice_status
    from searched p
    left join lateral (
      select w.scan_type, w.scan_note, w.created_at
      from public.be_warehouse_scan_events w
      where w.pickup_id = p.pickup_id
         or w.waybill_no = p.delivery_way_id
         or w.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by w.created_at desc nulls last
      limit 1
    ) ws on true
    left join lateral (
      select o.to_status, o.event_note, o.created_at
      from public.be_operational_events o
      where o.pickup_id = p.pickup_id
         or o.waybill_no = p.delivery_way_id
         or o.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by o.created_at desc nulls last
      limit 1
    ) oe on true
    left join lateral (
      select s.event_code, s.event_name, s.source_module, s.created_at
      from public.be_waybill_status_events s
      where s.pickup_id = p.pickup_id
         or s.waybill_no = p.delivery_way_id
         or s.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by s.created_at desc nulls last
      limit 1
    ) se on true
    left join lateral (
      select
        count(*) filter (where v.workflow_status not in ('CLOSED'))::integer as open_voice_count,
        (array_agg(v.current_department order by v.created_at desc))[1] as current_owner_department,
        (array_agg(v.customer_voice_text order by v.created_at desc))[1] as latest_customer_voice,
        (
          select a.action_note
          from public.be_customer_voice_actions a
          where a.customer_voice_id in (
            select vx.id from public.be_customer_voices vx where vx.delivery_way_id = p.delivery_way_id
          )
          order by a.created_at desc
          limit 1
        ) as latest_internal_action,
        exists (
          select 1
          from public.be_customer_voice_escalations e
          join public.be_customer_voices ve on ve.id = e.customer_voice_id
          where ve.delivery_way_id = p.delivery_way_id and e.status = 'PENDING'
        ) as escalation_flag,
        min(v.due_at) filter (where v.workflow_status not in ('CLOSED','RESOLVED')) as sla_due_at,
        (array_agg(v.priority order by v.created_at desc))[1] as latest_voice_priority,
        (array_agg(v.workflow_status order by v.created_at desc))[1] as latest_voice_status
      from public.be_customer_voices v
      where v.delivery_way_id = p.delivery_way_id
    ) cv on true
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit greatest(least(coalesce(p_limit, 300), 1000), 1)
  ), rows_json as (
    select jsonb_build_object(
      'delivery_way_id', e.delivery_way_id,
      'waybill_no', coalesce(nullif(e.parcel_json->>'waybill_no',''), e.delivery_way_id),
      'pickup_id', e.pickup_id,
      'recipient_name', coalesce(e.parcel_json->>'recipient_name', e.parcel_json->>'customer_name'),
      'recipient_phone', coalesce(e.parcel_json->>'recipient_phone', e.parcel_json->>'contact_no_1', e.parcel_json->>'customer_phone'),
      'delivery_address', coalesce(e.parcel_json->>'delivery_address', e.parcel_json->>'recipient_address', e.parcel_json->>'address'),
      'township', coalesce(e.parcel_json->>'township', e.parcel_json->>'delivery_township'),
      'ward', coalesce(e.parcel_json->>'ward', e.parcel_json->>'source_ward'),
      'postal_code', coalesce(e.parcel_json->>'postal_code', e.parcel_json->>'source_postal_code'),
      'branch_code', public.be_cs_resolve_parcel_branch(e.parcel_json),
      'merchant_name', e.parcel_json->>'merchant_name',
      'parcel_status', e.parcel_json->>'parcel_status',
      'warehouse_status', e.parcel_json->>'warehouse_status',
      'operation_status', coalesce(e.parcel_json->>'way_management_status', e.latest_operation_event),
      'finance_status', e.parcel_json->>'finance_status',
      'assigned_rider_code', coalesce(e.parcel_json->>'assigned_rider_code', e.parcel_json->>'rider_code'),
      'assigned_rider_name', coalesce(e.parcel_json->>'assigned_rider_name', e.parcel_json->>'rider_name'),
      'vehicle_plate', coalesce(e.parcel_json->>'vehicle_plate', e.parcel_json->>'assigned_vehicle_plate'),
      'wayplan_id', e.parcel_json->>'wayplan_id',
      'cod_amount', coalesce(e.parcel_json->>'cod_amount', e.parcel_json->>'item_price'),
      'latest_warehouse_event', e.latest_warehouse_event,
      'latest_warehouse_note', e.latest_warehouse_note,
      'latest_warehouse_event_at', e.latest_warehouse_event_at,
      'latest_operation_event', e.latest_operation_event,
      'latest_operation_note', e.latest_operation_note,
      'latest_operation_event_at', e.latest_operation_event_at,
      'latest_status_event_code', e.latest_status_event_code,
      'latest_status_event_name', e.latest_status_event_name,
      'latest_status_source', e.latest_status_source,
      'latest_status_event_at', e.latest_status_event_at,
      'open_voice_count', coalesce(e.open_voice_count, 0),
      'current_owner_department', e.current_owner_department,
      'latest_customer_voice', e.latest_customer_voice,
      'latest_internal_action', e.latest_internal_action,
      'escalation_flag', coalesce(e.escalation_flag, false),
      'sla_due_at', e.sla_due_at,
      'latest_voice_priority', e.latest_voice_priority,
      'latest_voice_status', e.latest_voice_status,
      'updated_at', e.updated_at
    ) as row_json,
    e.open_voice_count,
    e.escalation_flag,
    e.latest_voice_priority
    from enriched e
  )
  select jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'total_records', count(*),
      'open_voices', coalesce(sum(coalesce(open_voice_count, 0)), 0),
      'escalated', count(*) filter (where coalesce(escalation_flag, false)),
      'urgent', count(*) filter (where lower(coalesce(latest_voice_priority, '')) = 'urgent')
    ),
    'rows', coalesce(jsonb_agg(row_json), '[]'::jsonb)
  )
  into v_result
  from rows_json;

  return coalesce(v_result, jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object('total_records', 0, 'open_voices', 0, 'escalated', 0, 'urgent', 0),
    'rows', '[]'::jsonb
  ));
end
$function$;
REVOKE ALL ON FUNCTION public.be_cs_parcel_support_queue(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_cs_parcel_support_queue(integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_cs_thirdparty_queue_v1(p_search text DEFAULT NULL::text, p_outcome text DEFAULT 'ALL'::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_rows jsonb;v_total int;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 v_role:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 if v_role not in ('customer_service','cs','support','superadmin','super_admin','admin','operation_manager','finance','finance_manager','accountant')
 then return jsonb_build_object('ok',false,'error','CS_OR_FINANCE_ROLE_REQUIRED');end if;
 if upper(coalesce(p_outcome,'ALL')) <> 'ALL' and upper(p_outcome) not in ('UNCONFIRMED','DELIVERED','RTO','FAILED','POSTPONED','NO_ATTEMPT','UNREACHABLE','REFUSED','ADDRESS_ISSUE','LOST','DAMAGED','HANDED_TO_PARTNER','OTHER')
 then return jsonb_build_object('ok',false,'error','INVALID_OUTCOME');end if;
 with source as (
 select eligible.delivery_way_id,
   max(eligible.scheduled_on) last_schedule_date,
   sum(eligible.schedule_occurrences)::bigint schedule_occurrences
 from (
  select sch.delivery_way_id,max(sch.scheduled_on) scheduled_on,count(*)::bigint schedule_occurrences
  from private.be_thirdparty_schedule_way_rows_v1 sch
  where sch.scheduled_on >= (public.be_golive_live_cutoff_v1() at time zone 'Asia/Yangon')::date
    and private.be_current_operational_way_v1(sch.delivery_way_id)
  group by sch.delivery_way_id
  union all
  select p.delivery_way_id,null::date as scheduled_on,0::bigint schedule_occurrences
  from public.be_data_entry_parcel_details p
  where p.delivery_route_mode='ROYAL_EXPRESS'
    and private.be_current_operational_way_v1(p.delivery_way_id)
  group by p.delivery_way_id
 ) eligible
 group by eligible.delivery_way_id
), info as (
 select s.delivery_way_id,s.last_schedule_date,s.schedule_occurrences,
  coalesce(nullif(p.merchant_id,''),mm.merchant_code) merchant_code,
  mm.merchant_name,
  p.recipient_name,
  p.parcel_status system_parcel_status,
  p.cod_amount system_cod_amount,
  coalesce(c.outcome,'UNCONFIRMED') cs_outcome,c.reason_code,c.provider_code,
  c.notes,c.evidence_ref,c.updated_at confirmation_at,coalesce(c.revision,0) revision,
  f.finance_review_status, f.verified_cash_received_mmk, f.actual_settlement_posted,
  (nullif(p.merchant_id,'') is not null and p.merchant_id <> split_part(s.delivery_way_id,'-',2)) merchant_prefix_conflict
 from source s
 left join public.be_data_entry_parcel_details p on p.delivery_way_id=s.delivery_way_id
 left join public.be_merchant_master mm on mm.merchant_code=coalesce(nullif(p.merchant_id,''),split_part(s.delivery_way_id,'-',2))
 left join public.be_thirdparty_cs_current_v1 c on c.delivery_way_id=s.delivery_way_id
 left join public.be_thirdparty_finance_review_v1 f on f.delivery_way_id=s.delivery_way_id
 )
 select count(*) into v_total from info
 where (nullif(btrim(coalesce(p_search,'')),'') is null or delivery_way_id ilike '%'||p_search||'%' or merchant_name ilike '%'||p_search||'%')
 and (upper(coalesce(p_outcome,'ALL'))='ALL' or cs_outcome=upper(p_outcome));
 with source as (
 select eligible.delivery_way_id,
   max(eligible.scheduled_on) last_schedule_date,
   sum(eligible.schedule_occurrences)::bigint schedule_occurrences
 from (
  select sch.delivery_way_id,max(sch.scheduled_on) scheduled_on,count(*)::bigint schedule_occurrences
  from private.be_thirdparty_schedule_way_rows_v1 sch
  where sch.scheduled_on >= (public.be_golive_live_cutoff_v1() at time zone 'Asia/Yangon')::date
    and private.be_current_operational_way_v1(sch.delivery_way_id)
  group by sch.delivery_way_id
  union all
  select p.delivery_way_id,null::date as scheduled_on,0::bigint schedule_occurrences
  from public.be_data_entry_parcel_details p
  where p.delivery_route_mode='ROYAL_EXPRESS'
    and private.be_current_operational_way_v1(p.delivery_way_id)
  group by p.delivery_way_id
 ) eligible
 group by eligible.delivery_way_id
), info as (
 select s.delivery_way_id,s.last_schedule_date,s.schedule_occurrences,
  coalesce(nullif(p.merchant_id,''),mm.merchant_code) merchant_code,
  mm.merchant_name,p.recipient_name,
  p.parcel_status system_parcel_status,p.cod_amount system_cod_amount,
  coalesce(c.outcome,'UNCONFIRMED') cs_outcome,c.reason_code,c.provider_code,
  c.notes,c.evidence_ref,c.updated_at confirmation_at,coalesce(c.revision,0) revision,
  f.finance_review_status,f.verified_cash_received_mmk,f.actual_settlement_posted,
  (nullif(p.merchant_id,'') is not null and p.merchant_id <> split_part(s.delivery_way_id,'-',2)) merchant_prefix_conflict
 from source s
 left join public.be_data_entry_parcel_details p on p.delivery_way_id=s.delivery_way_id
 left join public.be_merchant_master mm on mm.merchant_code=coalesce(nullif(p.merchant_id,''),split_part(s.delivery_way_id,'-',2))
 left join public.be_thirdparty_cs_current_v1 c on c.delivery_way_id=s.delivery_way_id
 left join public.be_thirdparty_finance_review_v1 f on f.delivery_way_id=s.delivery_way_id
 )
 select coalesce(jsonb_agg(to_jsonb(i) order by i.last_schedule_date desc,i.delivery_way_id),'[]'::jsonb) into v_rows
 from (select * from info
 where (nullif(btrim(coalesce(p_search,'')),'') is null or delivery_way_id ilike '%'||p_search||'%' or merchant_name ilike '%'||p_search||'%')
 and (upper(coalesce(p_outcome,'ALL'))='ALL' or cs_outcome=upper(p_outcome))
 order by last_schedule_date desc,delivery_way_id limit least(greatest(coalesce(p_limit,200),1),300)) i;
 return jsonb_build_object('ok',true,'total',v_total,'rows',v_rows,'source','current_royal_or_live_thirdparty_schedule_not_proof_of_delivery','finance_rule','confirmation creates per-merchant Finance review, not paid settlement');
end $function$;
REVOKE ALL ON FUNCTION public.be_cs_thirdparty_queue_v1(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_cs_thirdparty_queue_v1(text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_schema()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
  v_fields jsonb;
begin
  v_access := public.be_data_entry_require_access_v57('view', false);
  v_fields := jsonb_build_array(
      jsonb_build_object('name','id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','parcels.id'),
      jsonb_build_object('name','way_id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',false,'source','parcels.way_id'),
      jsonb_build_object('name','customer_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client selection; validated on mutation'),
      jsonb_build_object('name','merchant_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection; profile resolved by backend'),
      jsonb_build_object('name','status','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','operational status when permitted'),
      jsonb_build_object('name','recipient_name','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','recipient_phone','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','township','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input; deterministic normalized township tariff lookup'),
      jsonb_build_object('name','delivery_address','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','item_price','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','delivery_charges','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','merchant-declared delivery charge'),
      jsonb_build_object('name','cod_amount','section','Collection Instructions','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend amount-entry calculation'),
      jsonb_build_object('name','weight_kg','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','numeric','required',true,'source','client input'),
      jsonb_build_object('name','created_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','updated_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','environment','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',true,'source','PRODUCTION'),
      jsonb_build_object('name','customer_tier','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','text','required',true,'source','registered merchant: active approved profile overrides; truly unregistered merchant: operator selects STANDARD, ROYAL, or COMMITMENT'),
      jsonb_build_object('name','monthly_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','backend parcel count'),
      jsonb_build_object('name','amount_entry_type','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection'),
      jsonb_build_object('name','merchant_stated_total_amount','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','additional_customer_charge','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','cbm_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','other_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','merchant_payable_charges','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','other_merchant_credits','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','remarks','section','Audit Information','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client input'),
      jsonb_build_object('name','entered_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',true,'source','auth.uid()'),
      jsonb_build_object('name','authorized_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','set by authorized mutation'),
      jsonb_build_object('name','tariff_zone','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','tariff_zone_code','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','base_tariff','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','included_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','active tariff'),
      jsonb_build_object('name','extra_per_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_min_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_refund_per_way','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','chargeable_weight_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','extra_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','weight_surcharge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','gross_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','commitment_refund','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','net_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','effective_declared_delivery_charge','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','delivery_difference','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','settlement_direction','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend calculation'),
      jsonb_build_object('name','merchant_settlement_adjustment','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','merchant_final_settlement_amount','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','validation_status','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','validation_message','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','calculation_version','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend version'),
      jsonb_build_object('name','calculated_at','section','Validation','ownership','SERVER','editable',false,'data_type','timestamptz','required',true,'source','backend timestamp')
  );

  return jsonb_build_object(
    'ok', true,
    'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
    'generated_at', now(),
    'data', jsonb_build_object(
      'schema_version', 'FINANCIAL_V2_SCHEMA_V61_3_3_2026_08_02',
      'field_count', jsonb_array_length(v_fields),
      'environment', 'PRODUCTION',
      'mutation_rpcs_activated', false,
      'fields', v_fields
    ),
    'access', v_access
  );
end
$function$;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_schema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_data_entry_financial_v2_schema() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_get_merchants_dropdown()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with active_merchants as (
    select
      coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),'')) as merchant_code,
      coalesce(
        nullif(btrim(m.merchant_name),''),
        nullif(btrim(m.business_name),''),
        nullif(btrim(m.sender_name),''),
        coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),''))
      ) as merchant_name,
      coalesce(nullif(btrim(m.business_type),''), '') as business_type,
      coalesce(nullif(btrim(m.contact_person),''), nullif(btrim(m.sender_name),''), '') as contact_person,
      coalesce(
        nullif(btrim(m.contact_phone),''),
        nullif(btrim(m.default_pickup_phone),''),
        nullif(btrim(m.sender_phone),''),
        nullif(btrim(m.phone_primary),''),
        nullif(btrim(m.phone_secondary),''),
        ''
      ) as phone,
      coalesce(
        nullif(btrim(m.default_pickup_address),''),
        nullif(btrim(m.pickup_address),''),
        nullif(btrim(m.sender_address),''),
        nullif(btrim(m.address_line_1),''),
        nullif(btrim(m.address_en),''),
        nullif(btrim(m.address_mm),''),
        ''
      ) as address,
      coalesce(nullif(btrim(m.township),''), '') as township,
      coalesce(nullif(btrim(m.city),''), '') as city,
      coalesce(nullif(btrim(m.region_state),''), nullif(btrim(m.region),''), nullif(btrim(m.city_region),''), '') as region_state,
      coalesce(nullif(btrim(m.payment_terms),''), 'COD') as payment_terms,
      coalesce(nullif(btrim(m.status),''), nullif(btrim(m.merchant_status),''), nullif(btrim(m.account_status),''), 'ACTIVE') as status,
      m.customer_tier,
      array(select distinct btrim(n) from unnest(array[m.merchant_name,m.business_name,m.sender_name])n where nullif(btrim(n),'')is not null)as search_names,
      m.business_name,m.sender_name,m.updated_at
    from public.merchant_master m
    where coalesce(m.is_active,true) and coalesce(m.active,true)
      and not coalesce(m.is_deleted,false)
      and lower(btrim(coalesce(nullif(btrim(m.status),''),nullif(btrim(m.merchant_status),''),nullif(btrim(m.account_status),''),'active')))
          in ('active','enabled')
      and coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),'')) is not null
  )
  select jsonb_build_object(
    'source','merchant_master',
    'synced',true,
    'option_count',count(*),
    'options',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'value', merchant_code,
          'label', merchant_code || ' - ' || merchant_name || case when nullif(btrim(business_name),'')is not null and btrim(business_name)<>merchant_name then ' / '||btrim(business_name)else ''end,
          'merchant_code', merchant_code,
          'merchant_name', merchant_name,
          'business_name',business_name,'sender_name',sender_name,'search_names',to_jsonb(search_names),'customer_tier',customer_tier,
          'business_type', business_type,
          'contact_person', contact_person,
          'phone', phone,
          'address', address,
          'township', township,
          'city', city,
          'region_state', region_state,
          'payment_terms', payment_terms,
          'status', status,
          'updated_at', updated_at
        )
        order by upper(merchant_name), upper(merchant_code)
      ),
      '[]'::jsonb
    )
  )
  from active_merchants;
$function$;
REVOKE ALL ON FUNCTION public.be_get_merchants_dropdown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_get_merchants_dropdown() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_role_dashboard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_branch text;
  v_today date:=(now() at time zone 'Asia/Yangon')::date;
  v_operations jsonb:='{}'::jsonb;
  v_finance jsonb:='{}'::jsonb;
  v_warehouse jsonb:='{}'::jsonb;
  v_hr jsonb:='{}'::jsonb;
  v_growth jsonb:='{}'::jsonb;
  v_branches jsonb:='{}'::jsonb;
  v_scope text;
  v_super boolean;
  v_ops boolean;
  v_fin boolean;
  v_hr_ok boolean;
  v_growth_ok boolean;
  v_branch_ok boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;

  select coalesce(nullif(branch_code,''),'YGN') into v_branch
  from public.be_user_account_registry
  where auth_user_id=auth.uid()
  order by updated_at desc nulls last limit 1;
  v_branch:=coalesce(v_branch,'YGN');

  v_super:=v_role in ('superadmin','super_admin','admin','management','director');
  v_ops:=v_super or v_role in ('operation_manager','operations','operations_admin','supervisor','warehouse','warehouse_staff','sorter','dispatch','wayplan_manager','customer_service','cs','support','data_entry','encoder','branch_office','branch_manager','branch_staff','branch_admin');
  v_fin:=v_super or v_role in ('finance','finance_user','accountant');
  v_hr_ok:=v_super or v_role='hr_admin';
  v_growth_ok:=v_super or v_role in ('marketing','business_development','biz_dev');
  v_branch_ok:=v_super or v_role in ('branch_office','branch_manager','branch_staff','branch_admin');
  v_scope:=case when v_super or v_role in ('operation_manager','operations_admin') then 'ENTERPRISE' else 'ROLE' end;

  if v_ops then
    select jsonb_build_object(
      'pickups_today',count(*) filter(where (created_at at time zone 'Asia/Yangon')::date=v_today),
      'pickup_requests_today',count(*) filter(where (created_at at time zone 'Asia/Yangon')::date=v_today),
      'pending_pickups',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('WAITING_ASSIGNMENT','SUBMITTED','PENDING_ASSIGNMENT','PENDING')),
      'pickups_in_progress',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('ASSIGNED','RIDER_ASSIGNED','FIELD_TEAM_AT_PICKUP','PICKUP_VERIFICATION_IN_PROGRESS','PICKUP_IN_PROGRESS','PICKUP_STARTED','PICKUP_COLLECTING','RIDER_ACCEPTED')),
      'pickups_completed',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('PICKUP_COLLECTED','COLLECTED','PICKED_UP','DELIVERED_TO_WAREHOUSE','RECEIVED_AT_WAREHOUSE','PICKUP_COMPLETED','COMPLETED')),
      'active_shipments',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY')),
      'delivered_today',count(*) filter(where upper(coalesce(status,pickup_status,''))='DELIVERED' and (updated_at at time zone 'Asia/Yangon')::date=v_today),
      'failed_today',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('FAILED_ATTEMPT','DELIVERY_FAILED','FAILED_DELIVERY') and (updated_at at time zone 'Asia/Yangon')::date=v_today),
      'exceptions_open',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('EXCEPTION','ON_HOLD','WAREHOUSE_HOLD')),
      'branch',case when v_scope='ENTERPRISE' then 'ALL' else v_branch end
    ) into v_operations
    from public.be_portal_pickup_requests p
    where v_scope='ENTERPRISE' or coalesce(p.branch_code,'YGN')=v_branch;

    -- Parcel registrations are a separate metric from pickup request headers.
    -- Use Yangon business date and keep branch-scoped dashboard access.
    select v_operations || jsonb_build_object(
      'parcels_registered_today',count(*),
      'pickup_batches_registered_today',count(distinct d.pickup_id)
    ) into v_operations
    from public.be_data_entry_parcel_details d
    where (d.created_at at time zone 'Asia/Yangon')::date=v_today
      and (
        v_scope='ENTERPRISE'
        or exists (
          select 1 from public.be_portal_pickup_requests p
          where p.pickup_id=d.pickup_id and coalesce(p.branch_code,'YGN')=v_branch
        )
      );

    -- Delivery lifecycle KPIs must use authoritative dispatch stops, not pickup request headers.
    with latest_stops as (
      select distinct on (upper(s.delivery_way_id))
        upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) lifecycle,
        s.delivered_at, s.updated_at
      from public.be_wayplan_dispatch_stops s
      where nullif(btrim(s.delivery_way_id),'') is not null
        and (v_scope='ENTERPRISE' or coalesce(s.branch_code,'YGN')=v_branch)
      order by upper(s.delivery_way_id), s.updated_at desc nulls last
    )
    select v_operations || jsonb_build_object(
      'active_shipments',count(*) filter (where lifecycle in (
        'READY_FOR_DISPATCH','DISPATCHED','RIDER_ACCEPTED','DELIVERY_ACCEPTED',
        'ACCEPTED_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_STARTED','ARRIVED_AT_CUSTOMER'
      )),
      'delivered_today',count(*) filter (where lifecycle in (
        'DELIVERED','DELIVERY_COMPLETED','POD_VERIFIED','COMPLETED'
      ) and (coalesce(delivered_at,updated_at) at time zone 'Asia/Yangon')::date=v_today),
      'failed_today',count(*) filter (where lifecycle in (
        'DELIVERY_FAILED','FAILED_DELIVERY','FAILED_ATTEMPT'
      ) and (updated_at at time zone 'Asia/Yangon')::date=v_today)
    ) into v_operations from latest_stops;

    select jsonb_build_object(
      'rows',coalesce(jsonb_array_length(coalesce(w->'rows','[]'::jsonb)),0),
      'inbound',coalesce((w->'stats'->>'received')::int,0),
      'dispatch',coalesce((w->'stats'->>'dispatch_scanned')::int,0),
      'returns',coalesce((w->'stats'->>'returns')::int,0),
      'awaiting_return_scan',coalesce((w->'stats'->>'awaiting_return_scan')::int,0),
      'ready_for_wayplan',coalesce((w->'stats'->>'ready_for_wayplan')::int,0),
      'warehouse_source','be_warehouse_scan_lifecycle_snapshot_v164.stats',
      'build',w->>'build'
    ) into v_warehouse from (select public.be_warehouse_scan_lifecycle_snapshot_v164() w)x;
  end if;

  if v_fin then
    select jsonb_build_object(
      'settlement_rows',count(*),
      'pending_rows',count(*) filter(where upper(coalesce(settlement_state,''))<>'SETTLED'),
      'settled_rows',count(*) filter(where upper(coalesce(settlement_state,''))='SETTLED'),
      'cod_expected',coalesce(sum(customer_total_collection),0),
      'merchant_payable',coalesce(sum(greatest(coalesce(merchant_final_settlement_amount,0),0)),0),
      'merchant_receivable',coalesce(sum(coalesce(merchant_receivable,0)),0),
      'delivery_revenue',coalesce(sum(coalesce(net_system_delivery_charge,0)),0)
    ) into v_finance from public.be_v_finance_merchant_settlement_queue_v2;
  end if;

  if v_hr_ok then
    select jsonb_build_object(
      'total_employees',coalesce((h->'summary'->>'total_employees')::int,0),
      'active_employees',coalesce((h->'summary'->>'active_employees')::int,0),
      'departments',coalesce((h->'summary'->>'departments')::int,0),
      'branches',coalesce((h->'summary'->>'branches')::int,0),
      'riders',coalesce((h->'summary'->>'riders')::int,0),
      'drivers',coalesce((h->'summary'->>'drivers')::int,0),
      'helpers',coalesce((h->'summary'->>'helpers')::int,0)
    ) into v_hr from (select public.be_hr_dashboard() h)x;
    -- HR headcount is separate from Rider App credentialed workforce.
    -- Label these as app accounts in the client, not employees.
    select v_hr || jsonb_build_object(
      'riders',count(*) filter(where lower(coalesce(role,''))='rider'),
      'drivers',count(*) filter(where lower(coalesce(role,''))='driver'),
      'helpers',count(*) filter(where lower(coalesce(role,''))='helper'),
      'workforce_source','be_mobile_workforce_accounts.active'
    ) into v_hr
    from public.be_mobile_workforce_accounts
    where is_active=true;
  end if;

  if v_growth_ok then
    select jsonb_build_object(
      'merchants',(select count(*) from public.be_master_merchants where upper(coalesce(status,'ACTIVE'))='ACTIVE'),
      'leads',(select count(*) from public.be_marketing_leads),
      'active_prospects',(select count(*) from public.be_bd_accounts where lower(coalesce(status,'active'))='active' and lower(coalesce(stage,'prospect')) not in ('closed_won','closed_lost')),
      'pipeline_value',(select coalesce(sum(expected_monthly_revenue),0) from public.be_bd_accounts where lower(coalesce(status,'active'))='active'),
      'closed_won',(select count(*) from public.be_bd_accounts where lower(coalesce(stage,''))='closed_won')
    ) into v_growth;
  end if;

  if v_branch_ok then
    select jsonb_build_object(
      'total_branches',count(*),
      'active_branches',count(*) filter(where lower(coalesce(status,'active'))='active'),
      'pending_amendments',(select count(*) from public.be_branch_amendment_requests where upper(coalesce(approval_status,'PENDING'))='PENDING'),
      'staff',(select count(*) from public.be_branch_staff)
    ) into v_branches from public.be_branch_offices;
  end if;

  return jsonb_build_object(
    'ok',true,'role',v_role,'scope',v_scope,'branch_code',v_branch,'work_date',v_today,'as_of',now(),
    'operations',v_operations,'finance',v_finance,'warehouse',v_warehouse,'hr',v_hr,'growth',v_growth,'branches',v_branches,
    'permissions',jsonb_build_object('operations',v_ops,'finance',v_fin,'hr',v_hr_ok,'growth',v_growth_ok,'branches',v_branch_ok,'bird_eye',v_super)
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.be_role_dashboard_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_role_dashboard_v1() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v164()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_base jsonb := public.be_warehouse_scan_lifecycle_snapshot_v158();
  v_rows jsonb := '[]'::jsonb;
begin
  with src as (
    select e,ord,
      upper(coalesce(
        nullif(e->>'delivery_way_id',''),
        nullif(e->>'canonical_delivery_way_id',''),
        nullif(e->>'waybill_no','')
      )) as way_id
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      with ordinality t(e,ord)
  ),
  scan_state as (
    select s.*,
      coalesce((
        select count(*)::int
        from public.be_warehouse_return_scans_v39 r
        where upper(r.delivery_way_id)=s.way_id
      ),0) as physical_return_count,
      (
        select max(r.scanned_at)
        from public.be_warehouse_return_scans_v39 r
        where upper(r.delivery_way_id)=s.way_id
      ) as last_return_scan_at,
      (
        select max(d.scanned_at)
        from public.be_dispatch_scans_v39 d
        where upper(d.delivery_way_id)=s.way_id
          and d.scan_status='SCANNED'
      ) as last_dispatch_scan_at,
      (
        upper(coalesce(s.e->>'delivery_status',''))='DELIVERED'
        or exists(
          select 1 from public.be_delivery_attempt_state_v39 a
          where upper(a.delivery_way_id)=s.way_id
            and upper(coalesce(a.last_status,''))='DELIVERED'
        )
      ) as is_delivered
    from src s
  ),
  labelled as (
    select ss.*,
      case
        when last_dispatch_scan_at is not null
         and (last_return_scan_at is null or last_dispatch_scan_at > last_return_scan_at)
          then physical_return_count + 1
        when physical_return_count > 0 then physical_return_count
        else case when last_dispatch_scan_at is not null then 1 else 0 end
      end as dispatch_attempt_no,
      case
        when last_dispatch_scan_at is not null
         and (last_return_scan_at is null or last_dispatch_scan_at > last_return_scan_at)
          then 'DISPATCH'
        when last_return_scan_at is not null then 'RETURN'
        else 'NONE'
      end as latest_scan_kind
    from scan_state ss
  )
  select coalesce(jsonb_agg(
    e || coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'recipient_name',d.recipient_name,
        'recipient_phone',d.contact_no_1,
        'phone_number',d.contact_no_1,
        'delivery_township',d.township,
        'recipient_address',d.recipient_address,
        'cod_amount',d.cod_amount,
        'item_price',d.item_price,
        'delivery_fee',d.delivery_fee,
        'delivery_charges',d.delivery_charges,
        'cod_service_fee_amount',d.cod_service_fee_amount,
        'cod_fee_policy_status',d.cod_fee_policy_status
      ))
      from public.be_data_entry_parcel_details d
      where upper(btrim(d.delivery_way_id))=l.way_id and upper(btrim(d.pickup_id))=upper(btrim(coalesce(l.e->>'pickup_id','')))
      order by d.updated_at desc nulls last,d.saved_at desc nulls last
      limit 1
    ),'{}'::jsonb) || jsonb_build_object(
      'delivery_status',case when is_delivered then 'DELIVERED' else e->>'delivery_status' end,
      'warehouse_scan_status',case when is_delivered then 'DELIVERED' else e->>'warehouse_scan_status' end,
      'dispatch_workflow_stage',case when is_delivered then 'DELIVERED' else e->>'dispatch_workflow_stage' end,
      'current_lifecycle_status',case when is_delivered then 'DELIVERED' else coalesce(e->>'dispatch_workflow_stage',e->>'warehouse_scan_status','PENDING') end,
      'return_attempt_count',physical_return_count,
      'delivery_attempts',physical_return_count,
      'next_attempt_priority',case when is_delivered then false else (physical_return_count between 1 and 2) end,
      'pending_return_attempt_no',case
        when is_delivered then physical_return_count
        when coalesce((e->>'field_exception_pending')::boolean,false)
          then least(physical_return_count + 1,3)
        else physical_return_count
      end,
      'pending_return_is_rto',case when is_delivered then false else (physical_return_count >= 3) end,
      'physical_return_scan_count',physical_return_count,
      'dispatch_scan_attempt_no',dispatch_attempt_no,
      'return_scan_attempt_no',physical_return_count,
      'dispatch_scan_label',case
        when dispatch_attempt_no > 0 then format('Dispatch Scan (%s)',dispatch_attempt_no)
        else null
      end,
      'return_scan_label',case
        when physical_return_count = 0 then null
        when physical_return_count >= 3 then 'Return Scan (3) / RTO'
        else format('Return Scan (%s)',physical_return_count)
      end,
      'historical_failed_reason',case when physical_return_count>0 then coalesce(e->>'last_exception_reason',e->>'pending_return_reason_name') else null end,
      'last_exception_reason',case when is_delivered then null else e->>'last_exception_reason' end,
      'pending_return_reason_name',case when is_delivered then null else e->>'pending_return_reason_name' end,
      'pending_return_reason_code',case when is_delivered then null else e->>'pending_return_reason_code' end,
      'field_exception_pending',case when is_delivered then false else coalesce((e->>'field_exception_pending')::boolean,false) end,
      'latest_scan_kind',case when is_delivered then 'DELIVERED' else latest_scan_kind end,
      'latest_scan_label',case
        when is_delivered then 'DELIVERED'
        when latest_scan_kind='DISPATCH' then format('Dispatch Scan (%s)',dispatch_attempt_no)
        when latest_scan_kind='RETURN' and physical_return_count>=3 then 'Return Scan (3) / RTO'
        when latest_scan_kind='RETURN' then format('Return Scan (%s)',physical_return_count)
        else 'Not Scanned'
      end,
      'last_dispatch_scan_at',last_dispatch_scan_at,
      'last_return_scan_at',last_return_scan_at,
      'return_attempt_source','be_warehouse_return_scans_v39',
      'dispatch_attempt_source','return_scan_count_plus_fresh_dispatch',
      'build','WAREHOUSE_DELIVERED_PRECEDENCE_V176'
    ) order by ord
  ),'[]'::jsonb)
  into v_rows
  from labelled l;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'build','WAREHOUSE_DELIVERED_PRECEDENCE_V176',
    'compat_source','be_warehouse_scan_lifecycle_snapshot_v158'
  );
end
$function$;
REVOKE ALL ON FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v164() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v164() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_base jsonb:=public.be_warehouse_scan_lifecycle_snapshot_v164();
  v_rows jsonb;
  v_stats jsonb;
BEGIN
  WITH src AS MATERIALIZED (
    SELECT r.e,r.ord,
      upper(coalesce(nullif(r.e->>'canonical_delivery_way_id',''),
                     nullif(r.e->>'delivery_way_id',''))) AS way_id
    FROM jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      WITH ORDINALITY r(e,ord)
  ),
  keys AS MATERIALIZED (SELECT DISTINCT way_id FROM src WHERE way_id IS NOT NULL),
  plans_ranked AS (
    SELECT m.delivery_way_id AS way_id,m.wayplan_id,m.membership_status,
       m.updated_at AS membership_updated_at,
       w.wayplan_status,coalesce(rv.review_status,'DRAFT') AS review_status,
       rv.dispatch_ready_at,
       row_number() OVER(PARTITION BY m.delivery_way_id ORDER BY
         CASE m.membership_status
           WHEN 'READY_FOR_DISPATCH' THEN 1
           WHEN 'PLANNED' THEN 2 ELSE 3 END,
         m.updated_at DESC NULLS LAST) AS rn
    FROM public.be_wayplan_membership_v40 m
    JOIN keys k ON k.way_id=m.delivery_way_id
    JOIN public.be_wayplan_dispatches w ON w.wayplan_id=m.wayplan_id
    LEFT JOIN public.be_wayplan_review_v43 rv ON rv.wayplan_id=m.wayplan_id
    WHERE m.membership_status IN ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
       AND upper(coalesce(w.wayplan_status,'')) NOT IN ('COMPLETED','CANCELLED')
  ),
  plans AS MATERIALIZED (SELECT * FROM plans_ranked WHERE rn=1),
  returns AS MATERIALIZED (
    SELECT h.delivery_way_id AS way_id,max(h.scanned_at) AS last_return,
           count(*)::int AS return_count
    FROM public.be_warehouse_return_scans_v39 h
    JOIN keys k ON k.way_id=h.delivery_way_id
    GROUP BY h.delivery_way_id
  ),
  reschedules AS MATERIALIZED (
    SELECT r.delivery_way_id AS way_id,r.requested_delivery_date
    FROM public.be_delivery_reschedules_v71 r
    JOIN keys k ON k.way_id=r.delivery_way_id
    WHERE r.status='ACTIVE'
  ),
  scans AS MATERIALIZED (
    SELECT d.delivery_way_id AS way_id,d.scan_status,d.scanned_at,
           d.wayplan_code
    FROM public.be_dispatch_scans_v39 d
    JOIN keys k ON k.way_id=d.delivery_way_id
  ),
  attempted AS MATERIALIZED (
    SELECT a.delivery_way_id AS way_id,a.last_status,a.consecutive_failures
    FROM public.be_delivery_attempt_state_v39 a
    JOIN keys k ON k.way_id=a.delivery_way_id
  ),
  source_history AS MATERIALIZED (
    SELECT s.delivery_way_id AS way_id,
       jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'wayplan_id',p.wayplan_id,
          'work_date',p.metadata->>'work_date',
          'plan_type',p.metadata->>'plan_type',
          'completion_basis',p.metadata->>'completion_basis',
          'reported_outcome',s.metadata->>'md_attested_outcome',
          'source_way_id',s.metadata->>'source_way_id',
          'source_file',p.metadata->>'source_file_name',
          'driver_name',p.driver_name,'helper_name',p.helper_name,
          'rider_name',p.rider_name,'vehicle_code',p.vehicle_code,
          'reason',s.metadata->'source_attempt_evidence'->>'reason',
          'verification',s.metadata->'source_attempt_evidence'->>'verification'
       )) ORDER BY p.metadata->>'work_date',p.wayplan_id) AS history
    FROM public.be_wayplan_dispatch_stops s
    JOIN keys k ON k.way_id=s.delivery_way_id
    JOIN public.be_wayplan_dispatches p ON p.wayplan_id=s.wayplan_id
    WHERE p.metadata->>'completion_basis'='MD_INSTRUCTED_ASSUMPTION'
      AND p.metadata->>'plan_type' IN ('OUTBOUND','THIRD_PARTY')
    GROUP BY s.delivery_way_id
  ),
  computed AS (
    SELECT s.e,s.ord,s.way_id, p.wayplan_id,p.membership_status,
       p.review_status,p.dispatch_ready_at,
       rs.requested_delivery_date,
       coalesce(rt.return_count,0) AS physical_returns,
       rt.last_return,
       CASE
         WHEN upper(coalesce(at.last_status,''))='RTO'
           OR upper(coalesce(s.e->>'delivery_status',''))='RTO'
           THEN 'RTO'
         WHEN upper(coalesce(at.last_status,''))='DELIVERED'
           OR upper(coalesce(s.e->>'delivery_status',''))='DELIVERED'
           THEN 'DELIVERED'
         WHEN rs.requested_delivery_date IS NOT NULL
           AND (rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
                OR coalesce(rt.return_count,0)=0)
           THEN 'SCHEDULED_HOLD'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           AND coalesce(at.consecutive_failures,0)>coalesce(rt.return_count,0)
           THEN 'AWAITING_RETURN_SCAN'
         WHEN coalesce(rt.return_count,0)>0
           AND (p.wayplan_id IS NULL
                OR coalesce(p.membership_updated_at,'epoch'::timestamptz)<=rt.last_return)
           THEN 'RETURNED_WAITING_REPLAN'
         WHEN ds.scan_status='SCANNED' AND p.wayplan_id IS NOT NULL
           AND ds.wayplan_code=p.wayplan_id
           THEN 'DISPATCH_SCANNED'
         WHEN p.wayplan_id IS NOT NULL
           AND p.membership_status='READY_FOR_DISPATCH'
           AND upper(p.review_status)='DISPATCH_READY'
           THEN 'DISPATCH_SCAN_REQUIRED'
         WHEN p.wayplan_id IS NOT NULL AND upper(p.review_status)='APPROVED'
           THEN 'SUPERVISOR_APPROVED_AWAITING_RELEASE'
         WHEN p.wayplan_id IS NOT NULL THEN 'IN_WAYPLAN_AWAITING_SUPERVISOR'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           THEN 'AWAITING_RETURN_SCAN'
         ELSE coalesce(nullif(s.e->>'dispatch_workflow_stage',''),'NOT_RECEIVED')
       END AS reconciled_stage,
       coalesce(h.history,'[]'::jsonb) AS history
    FROM src s
    LEFT JOIN plans p ON p.way_id=s.way_id
    LEFT JOIN returns rt ON rt.way_id=s.way_id
    LEFT JOIN reschedules rs ON rs.way_id=s.way_id
    LEFT JOIN scans ds ON ds.way_id=s.way_id
    LEFT JOIN attempted at ON at.way_id=s.way_id
    LEFT JOIN source_history h ON h.way_id=s.way_id
  ),
  final_rows AS MATERIALIZED (
    SELECT e || jsonb_build_object(
      'reported_source_history',history,
      'dispatch_workflow_stage',reconciled_stage,
      'current_lifecycle_status',reconciled_stage,
      'active_wayplan_id',wayplan_id,
      'membership_status',membership_status,
      'supervisor_review_status',review_status,
      'supervisor_dispatch_ready_at',dispatch_ready_at,
      'rescheduled_delivery_date',requested_delivery_date,
      'return_attempt_count',physical_returns,
      'physical_return_scan_count',physical_returns,
      'last_return_scan_at',last_return,
      'dispatch_scan_required',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_scan_allowed',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_status_source','WAREHOUSE_SET_BASED_RECONCILIATION_V212'
    ) AS e,ord,reconciled_stage AS stage
    FROM computed
  )
  SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb),
    jsonb_build_object(
      'rows',count(*),
      'ready_for_wayplan',count(*) FILTER(WHERE stage='READY_FOR_WAYPLAN'),
      'waiting_supervisor',count(*) FILTER(WHERE stage IN
        ('IN_WAYPLAN_AWAITING_SUPERVISOR','SUPERVISOR_APPROVED_AWAITING_RELEASE')),
      'dispatch_scan_required',count(*) FILTER(WHERE stage='DISPATCH_SCAN_REQUIRED'),
      'dispatch_scanned',count(*) FILTER(WHERE stage='DISPATCH_SCANNED'),
      'awaiting_return_scan',count(*) FILTER(WHERE stage='AWAITING_RETURN_SCAN'),
      'scheduled_hold',count(*) FILTER(WHERE stage='SCHEDULED_HOLD'),
      'returned_waiting_replan',count(*) FILTER(WHERE stage='RETURNED_WAITING_REPLAN'),
      'delivered',count(*) FILTER(WHERE stage='DELIVERED'),
      'rto',count(*) FILTER(WHERE stage='RTO')
    )
  INTO v_rows,v_stats
  FROM final_rows;
  RETURN v_base || jsonb_build_object(
    'rows',v_rows,
    'stats',coalesce(v_base->'stats','{}'::jsonb)||v_stats,
    'build','WAREHOUSE_SET_BASED_RECONCILIATION_V212',
    'dispatch_scan_reconciliation','SET_BASED_NO_PER_ROW_RPC_V212'
  );
END
$function$;
REVOKE ALL ON FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
-- Verify full screen workflows, not merely function presence.
