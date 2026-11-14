-- Historical source evidence stays restricted and unchanged. Operational consumers require a current canonical root.
create or replace function private.be_current_operational_way_v1(p_way text)returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.be_data_entry_parcel_details p
 where p.delivery_way_id=p_way and p.created_at>=public.be_golive_live_cutoff_v1())
 and not exists(select 1 from private.be_oct2026_retired_keys k
 where k.key_family='delivery'and k.key_value=lower(btrim(p_way))) $$;
revoke all on function private.be_current_operational_way_v1(text)from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.be_customer_service_can_manage_pickup_request(p_branch_code text, p_township text, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_action text := lower(btrim(coalesce(p_action,'read')));
  v_matrix_allowed boolean := false;
  v_registered_branch text;
  v_branch text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT lower(regexp_replace(btrim(coalesce(r.role,'')), '[ _-]+','_','g')),r.branch_code
    INTO v_role,v_registered_branch
    FROM public.be_user_account_registry r
   WHERE r.auth_user_id=v_uid
     AND coalesce(r.is_active,true) AND coalesce(r.active,true)
     AND lower(coalesce(r.status,'active'))in('active','enabled')
   LIMIT 1;

  IF coalesce(v_role,'') NOT IN('customer_service','cs','support')THEN RETURN false;END IF;
  v_branch:=coalesce(nullif(btrim(p_branch_code),''),nullif(btrim(v_registered_branch),''));
  IF v_action NOT IN ('read','create','update','assign','export') THEN RETURN false; END IF;

  SELECT CASE v_action
           WHEN 'read' THEN coalesce((m.rights #>> '{modules,pickup_request,view}')::boolean,false)
           WHEN 'create' THEN coalesce((m.rights #>> '{modules,pickup_request,create}')::boolean,false)
           WHEN 'update' THEN coalesce((m.rights #>> '{modules,pickup_request,update}')::boolean,false)
           WHEN 'assign' THEN coalesce((m.rights #>> '{modules,pickup_request,assign}')::boolean,false)
           WHEN 'export' THEN coalesce((m.rights #>> '{modules,pickup_request,export}')::boolean,false)
           ELSE false
         END
    INTO v_matrix_allowed
    FROM public.be_role_authority_matrix m
   WHERE lower(m.role_id)='customer_service' AND m.is_active
   LIMIT 1;

  IF NOT coalesce(v_matrix_allowed,false) THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.be_employee_territory_assignments a
     WHERE a.user_id=v_uid
       AND a.active
       AND CASE v_action
             WHEN 'create' THEN a.can_create
             WHEN 'update' THEN a.can_update
             WHEN 'assign' THEN a.can_update
             ELSE a.can_read
           END
       AND (
         a.scope_type='GLOBAL'
         OR (a.scope_type='BRANCH'
             AND nullif(btrim(v_branch),'') IS NOT NULL
             AND lower(btrim(a.branch_code))=lower(btrim(v_branch)))
         OR (a.scope_type='TOWNSHIP'
             AND public.be_normalize_territory_key(a.township_key)=public.be_normalize_territory_key(p_township))
       )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.be_submit_pickup_request(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup_id text;
  v_merchant_code text := upper(coalesce(
    nullif(p_payload->>'merchant_code', ''),
    nullif(p_payload->>'merchant', ''),
    'GEN'
  ));
  v_merchant_name text := coalesce(
    nullif(p_payload->>'merchant_name', ''),
    nullif(p_payload->>'merchant_label', ''),
    v_merchant_code
  );
  v_actor_email text := coalesce(
    nullif(p_payload->>'actor_email', ''),
    nullif(p_payload->>'created_by_email', ''),
    nullif(p_payload->>'email', '')
  );
  v_expected_parcels integer := greatest(coalesce(
    nullif(p_payload->>'expected_parcels', '')::integer,
    nullif(p_payload->>'parcel_count', '')::integer,
    1
  ), 1);
  v_pickup_date date := coalesce(
    nullif(p_payload->>'pickup_date', '')::date,
    nullif(p_payload->>'date', '')::date,
    current_date
  );
  v_address text := coalesce(nullif(p_payload->>'pickup_address',''),nullif(p_payload->>'address', ''));
  v_township text := coalesce(nullif(p_payload->>'pickup_township',''),nullif(p_payload->>'township', ''));
  v_city text := coalesce(nullif(p_payload->>'pickup_city',''),nullif(p_payload->>'city', ''));
  v_payment_terms text := coalesce(nullif(p_payload->>'payment_terms',''),'COD');
  v_payment_type text := upper(replace(replace(btrim(coalesce(
    nullif(p_payload->>'payment_type',''),
    nullif(p_payload->>'payment_method',''),
    v_payment_terms
  )),' ','_'),'-','_'));
  v_row jsonb;
  v_branch text;v_registered_branch text;v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select upper(branch_code),lower(replace(role,'-','_'))
   into v_registered_branch,v_actor_role from public.be_user_account_registry
   where auth_user_id=auth.uid()and coalesce(active,true)and coalesce(is_active,true)
    and lower(coalesce(status,'active'))in('active','enabled')limit 1;
  if not found then raise exception 'ACCOUNT_INACTIVE'using errcode='42501';end if;
  v_branch:=coalesce(nullif(upper(btrim(p_payload->>'branch_code')),''),v_registered_branch,'YGN');
  if v_actor_role in('customer_service','cs','support')and not public.be_customer_service_can_manage_pickup_request(v_branch,v_township,'create')then
   raise exception 'CUSTOMER_SERVICE_PICKUP_BRANCH_ACCESS_REQUIRED'using errcode='42501';end if;
  if v_actor_role in('branch_manager','branch_office_manager','branch_office','branch_staff','branch_admin')then
   v_branch:=public.be_branch_scope_v1(v_branch);end if;
  if v_branch<>coalesce(v_registered_branch,v_branch)and v_actor_role not in('superadmin','super_admin','admin','app_owner','sys','operation_manager','operations_admin','supervisor')
   and v_actor_role not in('customer_service','cs','support')then raise exception 'PICKUP_BRANCH_ACCESS_REQUIRED'using errcode='42501';end if;

  if v_payment_type='KBZPAY' then v_payment_type:='KBZ_PAY'; end if;
  if v_payment_type='BANK' then v_payment_type:='BANK_TRANSFER'; end if;

  if v_payment_type not in ('COD','CASH','PREPAID','KBZ_PAY','MMQR','BANK_TRANSFER','OTHER') then
    return jsonb_build_object('ok',false,'code','INVALID_PAYMENT_TYPE','payment_type',v_payment_type);
  end if;

  v_merchant_code := upper(left(regexp_replace(v_merchant_code, '[^A-Za-z0-9]', '', 'g'), 3));

  v_pickup_id := coalesce(
    nullif(p_payload->>'pickup_id', ''),
    'P' || to_char(v_pickup_date, 'MMDD') || '-' || v_merchant_code || '-' || lpad(v_expected_parcels::text, 3, '0')
  );

  perform pg_advisory_xact_lock(hashtextextended('pickup-branch:'||v_pickup_id,0));
  if exists(select 1 from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id and upper(coalesce(p.branch_code,'YGN'))<>v_branch)then
    raise exception 'PICKUP_ID_BRANCH_CONFLICT: existing request belongs to another branch'using errcode='42501';end if;

  insert into public.be_portal_pickup_requests (
    pickup_id,pickup_way_id,merchant_code,merchant_name,contact_person,phone,
    address,township,pickup_address,pickup_township,pickup_city,
    expected_parcels,parcel_count,expected_parcel_count,
    required_vehicle,vehicle_type,payment_terms,payment_method,payment_type,
    pickup_date,pickup_status,status,operation_status,supervisor_status,assignment_status,
    data_entry_status,warehouse_status,dispatch_status,wayplan_status,rider_status,
    finance_status,settlement_status,branch_code,source_portal,source_channel,requester_type,
    workflow_stage,created_by,metadata,created_at,updated_at
  )
  values (
    v_pickup_id,v_pickup_id,v_merchant_code,v_merchant_name,
    nullif(p_payload->>'contact_person', ''),nullif(p_payload->>'phone', ''),
    v_address,v_township,v_address,v_township,v_city,
    v_expected_parcels,v_expected_parcels,v_expected_parcels,
    nullif(p_payload->>'required_vehicle', ''),nullif(p_payload->>'required_vehicle', ''),
    v_payment_terms,v_payment_type,v_payment_type,
    v_pickup_date,'WAITING_ASSIGNMENT','WAITING_ASSIGNMENT','submitted','PENDING_ASSIGNMENT','PENDING',
    'WAITING_PICKUP','WAITING_DATA_ENTRY','WAITING_WAYPLAN','PENDING_WAYPLAN','NOT_ASSIGNED',
    'pending_finance','pending',v_branch,'enterprise','pickup_request_form','merchant','PICKUP_REQUESTED',
    auth.uid(),
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'source','pickup_request_form','actor_email',v_actor_email,'submitted_at',now(),
      'payment_type',v_payment_type,
      'generated_pickup_id_rule','P + MMDD + MERCHANT + EXPECTED_PARCELS'
    ),
    now(),now()
  )
  on conflict (pickup_id) do nothing
  returning to_jsonb(be_portal_pickup_requests.*) into v_row;
  if v_row is null then
    return jsonb_build_object('ok',false,'code','PICKUP_ALREADY_EXISTS',
      'message','A pickup request already exists for this merchant, date and parcel count. Open the existing request to manage it.');
  end if;

  return jsonb_build_object(
    'ok',true,'status','PICKUP_SUBMITTED','pickup_id',v_row->>'pickup_id','pickup_way_id',v_row->>'pickup_way_id',
    'expected_parcels',v_expected_parcels,'payment_type',v_payment_type,'row',v_row
  );
end;
$function$;

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
  select delivery_way_id,max(scheduled_on) last_schedule_date,count(*) schedule_occurrences
  from private.be_thirdparty_schedule_way_rows_v1 where scheduled_on>=(public.be_golive_live_cutoff_v1()at time zone 'Asia/Yangon')::date and private.be_current_operational_way_v1(delivery_way_id) group by delivery_way_id
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
  select delivery_way_id,max(scheduled_on) last_schedule_date,count(*) schedule_occurrences
  from private.be_thirdparty_schedule_way_rows_v1 where scheduled_on>=(public.be_golive_live_cutoff_v1()at time zone 'Asia/Yangon')::date and private.be_current_operational_way_v1(delivery_way_id) group by delivery_way_id
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
 return jsonb_build_object('ok',true,'total',v_total,'rows',v_rows,'source','third_party_schedule_only_not_proof_of_delivery','finance_rule','confirmation creates per-merchant Finance review, not paid settlement');
end $function$;

CREATE OR REPLACE FUNCTION public.be_cs_thirdparty_confirm_v1(p_way_id text, p_provider text, p_outcome text, p_reason text, p_note text, p_evidence text DEFAULT NULL::text, p_expected_revision integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_actor uuid;v_merchant text;v_outcome text;v_next int;v_state text;v_cod numeric;v_old int;
begin
 v_actor:=auth.uid();
 if v_actor is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 v_role:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 if v_role not in ('customer_service','cs','support','superadmin','super_admin','admin') then
 return jsonb_build_object('ok',false,'error','CS_ROLE_REQUIRED');end if;
 v_outcome:=upper(btrim(coalesce(p_outcome,'')));
 if v_outcome not in('DELIVERED','RTO','FAILED','POSTPONED','NO_ATTEMPT','UNREACHABLE','REFUSED','ADDRESS_ISSUE','LOST','DAMAGED','HANDED_TO_PARTNER','OTHER') then
 return jsonb_build_object('ok',false,'error','INVALID_OUTCOME');end if;
 if length(btrim(coalesce(p_note,'')))<8 or length(p_note)>2000 then return jsonb_build_object('ok',false,'error','NOTE_MIN_8_MAX_2000');end if;
 if length(btrim(coalesce(p_provider,'')))<2 or length(p_provider)>100 then return jsonb_build_object('ok',false,'error','PROVIDER_REQUIRED');end if;
 if v_outcome<>'DELIVERED' and length(btrim(coalesce(p_reason,'')))<2 then return jsonb_build_object('ok',false,'error','FAILURE_REASON_REQUIRED');end if;
 if p_evidence is not null and length(p_evidence)>500 then return jsonb_build_object('ok',false,'error','EVIDENCE_REFERENCE_TOO_LONG');end if;
 if not private.be_current_operational_way_v1(p_way_id)then return jsonb_build_object('ok',false,'error','ARCHIVED_OR_NONCURRENT_WAY');end if;
 if not exists(select 1 from private.be_thirdparty_schedule_way_rows_v1 where delivery_way_id=p_way_id and scheduled_on>=(public.be_golive_live_cutoff_v1()at time zone 'Asia/Yangon')::date) then return jsonb_build_object('ok',false,'error','NOT_IN_THIRD_PARTY_MANIFEST');end if;
 select merchant_id,cod_amount into v_merchant,v_cod from public.be_data_entry_parcel_details where delivery_way_id=p_way_id;
 if v_merchant is null then
  v_merchant:=nullif(split_part(p_way_id,'-',2),'');
  if not exists(select 1 from public.be_merchant_master where merchant_code=v_merchant) then v_merchant:=null;end if;
 end if;
 select revision into v_old from public.be_thirdparty_cs_current_v1 where delivery_way_id=p_way_id for update;
 if coalesce(v_old,0)<>coalesce(p_expected_revision,0) then return jsonb_build_object('ok',false,'error','STALE_REVISION_REFRESH_REQUIRED','current_revision',coalesce(v_old,0));end if;
 v_next:=coalesce(v_old,0)+1;
 insert into public.be_thirdparty_cs_current_v1(delivery_way_id,merchant_code,provider_code,outcome,reason_code,notes,evidence_ref,confirmed_by,revision,updated_at)
 values (p_way_id,v_merchant,btrim(p_provider),v_outcome,nullif(btrim(coalesce(p_reason,'')),''),btrim(p_note),nullif(btrim(coalesce(p_evidence,'')),''),v_actor,v_next,now())
 on conflict(delivery_way_id) do update set merchant_code=excluded.merchant_code,provider_code=excluded.provider_code,outcome=excluded.outcome,reason_code=excluded.reason_code,notes=excluded.notes,evidence_ref=excluded.evidence_ref,confirmed_by=excluded.confirmed_by,revision=excluded.revision,updated_at=now();
 insert into public.be_thirdparty_cs_event_history_v1(delivery_way_id,merchant_code,provider_code,outcome,reason_code,notes,evidence_ref,confirmed_by,revision)
 values(p_way_id,v_merchant,btrim(p_provider),v_outcome,nullif(btrim(coalesce(p_reason,'')),''),btrim(p_note),nullif(btrim(coalesce(p_evidence,'')),''),v_actor,v_next);
 v_state:=case when v_merchant is null then 'ACCOUNT_RESOLUTION_REQUIRED'
 when v_outcome='DELIVERED' then 'DELIVERED_RECEIPT_AND_CHARGES_REVIEW'
 when v_outcome='RTO' then 'RTO_FEES_AND_RETURN_REVIEW'
 when v_outcome='HANDED_TO_PARTNER' then 'PARTNER_HANDOVER_REVIEW'
 else 'DELIVERY_EXCEPTION_FOLLOWUP' end;
 insert into public.be_thirdparty_finance_review_v1(delivery_way_id,merchant_code,provider_code,cs_outcome,cs_revision,finance_review_status,expected_cod_mmk,cs_confirmed_at)
 values(p_way_id,v_merchant,btrim(p_provider),v_outcome,v_next,v_state,v_cod,now())
 on conflict(delivery_way_id) do update set merchant_code=excluded.merchant_code,provider_code=excluded.provider_code,cs_outcome=excluded.cs_outcome,cs_revision=excluded.cs_revision,finance_review_status=excluded.finance_review_status,expected_cod_mmk=excluded.expected_cod_mmk,cs_confirmed_at=excluded.cs_confirmed_at,updated_at=now();
 return jsonb_build_object('ok',true,'delivery_way_id',p_way_id,'outcome',v_outcome,'revision',v_next,'merchant_code',v_merchant,'finance_review_status',v_state,'actual_settlement_posted',false);
end $function$;

CREATE OR REPLACE FUNCTION public.be_finance_ground_ledger_review_v1(p_status text DEFAULT 'ALL'::text, p_limit integer DEFAULT 320)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_filter text:=upper(coalesce(nullif(btrim(p_status),''),'ALL'));
  v_max int:=least(greatest(coalesce(p_limit,320),1),500);
  v_summary jsonb;
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  select upper(access_role) into v_role
    from public.be_finance_actor_access_v3() limit 1;
  if coalesce(v_role,'') not in ('FINANCE','FINANCE_MANAGER','SUPERADMIN','SUPER_ADMIN','ACCOUNTANT') then
    return jsonb_build_object('ok',false,'code','FINANCE_ROLE_REQUIRED');
  end if;
  if v_filter <> 'ALL' and v_filter not in (
    'MISSING_PRODUCTION_PARCEL','RETURN_HISTORY_CONFLICT',
    'PAYMENT_SPLIT_EXCEPTION','COD_AMOUNT_MISMATCH',
    'DELIVERY_RECONCILIATION_REQUIRED','FINANCE_RECEIPT_REVIEW'
  ) then
    return jsonb_build_object('ok',false,'code','INVALID_FILTER');
  end if;
  select coalesce(jsonb_object_agg(review_state,total),'{}'::jsonb)
    into v_summary from (
      select review_state,count(*) total
      from private.be_oct2026_external_settlement_review_v1
      group by review_state
    ) q;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sheet_date,r.source_row,r.delivery_way_id),'[]'::jsonb)
    into v_rows from (
      select delivery_way_id,sheet_date,source_sheet,source_row,
        final_cod_mmk,cash_mmk,kpay_mmk,source_check,
        parcel_status,way_management_status,financial_validation_status,
        system_cod_amount,system_actual_collect,
        review_state,delivery_stop_count,return_stop_count,delivered_stop_count,
        system_amount_delta_mmk,payment_split_delta_mmk,
        finance_record_count,settled_finance_record_count
      from private.be_oct2026_external_settlement_review_v1
      where v_filter='ALL' or review_state=v_filter
      order by sheet_date,source_row,delivery_way_id limit v_max
    ) r;
  return jsonb_build_object('ok',true,'count',jsonb_array_length(v_rows),
    'summary',v_summary,'rows',v_rows,
    'note','Ground-spreadsheet evidence only; does not post cash, clear COD or replace verified settlement references');
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_finance_ground_reconciliation_queue_v1(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_rows jsonb;v_role text;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('finance','finance_manager','accountant','superadmin','super_admin') then
   return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sheet_date,x.delivery_way_id),'[]'::jsonb)
 into v_rows from (
   select m.sheet_date,m.delivery_way_id,m.final_cod_mmk as reported_final_cod,
     m.cash_mmk as reported_cash,m.kpay_mmk as reported_kpay,
     m.source_sheet,m.source_row,
     case when m.final_cod_mmk is null then 'MISSING_COD'
       when coalesce(m.cash_mmk,0)+coalesce(m.kpay_mmk,0)<>m.final_cod_mmk then 'SPLIT_MISMATCH'
       when w.delivery_way_id is null then 'WAY_ID_NOT_MATCHED'
       when w.metadata->>'reconciliation_review_state'='REVIEW_HOLD' then 'REVIEW_HOLD'
       else 'PENDING_FINANCE_VERIFICATION' end as review_state,
     w.cod_collected as ledger_recorded_cod,w.settlement_status as ledger_settlement_status
   from private.be_oct2026_external_settlement_manifest m
   left join lateral (
      select delivery_way_id,cod_collected,settlement_status,metadata
      from public.be_wayplan_cod_settlements s
      where s.delivery_way_id=m.delivery_way_id order by s.created_at desc limit 1
   ) w on true
   where private.be_current_operational_way_v1(m.delivery_way_id)
   order by m.sheet_date,m.delivery_way_id
   limit least(greatest(coalesce(p_limit,500),1),1000)
 ) x;
 return jsonb_build_object('ok',true,'mode','UNVERIFIED_STAGING','rows',v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.be_finance_ground_reported_totals_v1(p_from date DEFAULT '2026-10-20'::date, p_to date DEFAULT '2026-10-22'::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_days jsonb;v_3p jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('finance','finance_manager','accountant','superadmin','super_admin') then
 return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');end if;
 if p_from is null or p_to is null or p_from>p_to or p_from<'2026-10-20'::date or p_to>'2026-10-22'::date then
 return jsonb_build_object('ok',false,'error','DATE_OUT_OF_SCOPE');end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.service_date),'[]'::jsonb) into v_days from(
 select sheet_date service_date,count(*) ways,
 coalesce(sum(final_cod_mmk),0) reported_final_cod,
 coalesce(sum(cash_mmk),0) reported_cash,
 coalesce(sum(kpay_mmk),0) reported_kpay,
 count(*) filter(where final_cod_mmk is null) missing_final_cod,
 count(*) filter(where final_cod_mmk is not null and coalesce(cash_mmk,0)+coalesce(kpay_mmk,0)<>final_cod_mmk) payment_split_mismatches,
 coalesce(sum(coalesce(cash_mmk,0)+coalesce(kpay_mmk,0)-coalesce(final_cod_mmk,0)),0) net_difference
 from private.be_oct2026_external_settlement_manifest
 where sheet_date between p_from and p_to and private.be_current_operational_way_v1(delivery_way_id)
 group by sheet_date
 ) r;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sheet_date),'[]'::jsonb) into v_3p from(
 select sheet_date,schedule_way_rows,scheduled_final_cod_mmk,completion_verified,cash_receipt_verified
 from private.be_oct20_21_thirdparty_schedules_source_v1 where sheet_date between p_from and p_to and sheet_date>=(public.be_golive_live_cutoff_v1()at time zone 'Asia/Yangon')::date
 ) x;
 return jsonb_build_object('ok',true,'mode','GROUND_REPORTED_ONLY','days',v_days,'third_party_schedules',v_3p,
 'notice','Not actual Finance receipts; never use these figures for settlement posting');
end $function$;

CREATE OR REPLACE FUNCTION public.be_finance_ground_settlement_confirmations_v1(p_limit integer DEFAULT 320)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_rows jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
 select upper(access_role) into v_role from public.be_finance_actor_access_v3() limit 1;
 if coalesce(v_role,'') not in ('FINANCE','FINANCE_MANAGER','SUPERADMIN','SUPER_ADMIN','ACCOUNTANT') then
 return jsonb_build_object('ok',false,'code','FINANCE_ROLE_REQUIRED'); end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.ground_business_date,t.source_row),'[]'::jsonb) into v_rows from (
 select confirmation_no,delivery_way_id,source_sheet,source_row,ground_business_date,
 ground_final_cod_mmk,ground_cash_mmk,ground_kpay_mmk,ground_status,finance_status,review_state
 from private.be_ground_settlement_confirmation_review_v1
 order by ground_business_date,source_row
 limit least(greatest(coalesce(p_limit,320),1),500)
 ) t;
 return jsonb_build_object('ok',true,'count',jsonb_array_length(v_rows),'rows',v_rows);
end $function$;

-- Bound historical reconciliation/worklists at their existing OIDs as well.
create or replace view private.be_oct2026_external_settlement_review_v1 with(security_barrier=true) as select current_source.* from (SELECT m.source_sha256,
    m.delivery_way_id,
    m.sheet_date,
    m.source_sheet,
    m.source_row,
    m.final_cod_mmk,
    m.cash_mmk,
    m.kpay_mmk,
    m.source_check,
    p.parcel_status,
    p.way_management_status,
    p.financial_validation_status,
    p.cod_amount AS system_cod_amount,
    p.actual_collect AS system_actual_collect,
        CASE
            WHEN (p.delivery_way_id IS NULL) THEN 'MISSING_PRODUCTION_PARCEL'::text
            WHEN ((COALESCE(st.return_stop_count, (0)::bigint) > 0) OR (upper(COALESCE(p.parcel_status, ''::text)) = 'RETURN_SCANNED'::text)) THEN 'RETURN_HISTORY_CONFLICT'::text
            WHEN (m.source_check <> 'MATCHED'::text) THEN 'PAYMENT_SPLIT_EXCEPTION'::text
            WHEN (abs((COALESCE(m.final_cod_mmk, (0)::numeric) - COALESCE(p.cod_amount, (0)::numeric))) > 0.01) THEN 'COD_AMOUNT_MISMATCH'::text
            WHEN (upper(COALESCE(p.parcel_status, ''::text)) <> 'DELIVERED'::text) THEN 'DELIVERY_RECONCILIATION_REQUIRED'::text
            ELSE 'FINANCE_RECEIPT_REVIEW'::text
        END AS review_state,
    (COALESCE(st.total_stops, (0)::bigint))::integer AS delivery_stop_count,
    (COALESCE(st.return_stop_count, (0)::bigint))::integer AS return_stop_count,
    (COALESCE(st.delivered_stop_count, (0)::bigint))::integer AS delivered_stop_count,
    (COALESCE(m.final_cod_mmk, (0)::numeric) - COALESCE(p.cod_amount, (0)::numeric)) AS system_amount_delta_mmk,
    ((COALESCE(m.cash_mmk, (0)::numeric) + COALESCE(m.kpay_mmk, (0)::numeric)) - COALESCE(m.final_cod_mmk, (0)::numeric)) AS payment_split_delta_mmk,
    (COALESCE(fin.finance_record_count, (0)::bigint))::integer AS finance_record_count,
    (COALESCE(fin.settled_record_count, (0)::bigint))::integer AS settled_finance_record_count
   FROM (((private.be_oct2026_external_settlement_manifest m
     LEFT JOIN be_data_entry_parcel_details p ON ((p.delivery_way_id = m.delivery_way_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS total_stops,
            count(*) FILTER (WHERE (upper(COALESCE(s.stop_status, ''::text)) = ANY (ARRAY['RETURN_TO_WAREHOUSE'::text, 'RTO'::text, 'FAILED_DELIVERY'::text, 'CANCELLED'::text]))) AS return_stop_count,
            count(*) FILTER (WHERE (upper(COALESCE(s.stop_status, ''::text)) = 'DELIVERED'::text)) AS delivered_stop_count
           FROM be_wayplan_dispatch_stops s
          WHERE (s.delivery_way_id = m.delivery_way_id)) st ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS finance_record_count,
            count(*) FILTER (WHERE (upper(COALESCE(f.settlement_status, ''::text)) = 'SETTLED'::text)) AS settled_record_count
           FROM be_finance_cod_settlements_v48 f
          WHERE (f.delivery_way_id = m.delivery_way_id)) fin ON (true)))current_source where private.be_current_operational_way_v1(current_source.delivery_way_id);
create or replace view private.be_ground_settlement_confirmation_review_v1 with(security_barrier=true) as select current_source.* from (SELECT c.confirmation_no,
    c.delivery_way_id,
    c.source_sheet,
    c.source_row,
    c.ground_business_date,
    c.ground_final_cod_mmk,
    c.ground_cash_mmk,
    c.ground_kpay_mmk,
    c.ground_status,
    c.finance_status,
    c.ground_recorded_at,
    c.finance_verified_at,
    c.finance_payment_reference,
    r.review_state,
    r.system_cod_amount,
    r.parcel_status,
    r.payment_split_delta_mmk,
    r.system_amount_delta_mmk
   FROM (private.be_ground_settlement_confirmations_v1 c
     LEFT JOIN private.be_oct2026_external_settlement_review_v1 r ON (((r.source_sha256 = c.source_sha256) AND (r.delivery_way_id = c.delivery_way_id)))))current_source where private.be_current_operational_way_v1(current_source.delivery_way_id);
create or replace view private.be_oct23_ground_outbound_reconciliation_v1 with(security_barrier=true) as select current_source.* from (SELECT o.delivery_way_id,
    o.work_date,
    o.source_row,
    o.merchant_name,
    o.assigned_operator,
    o.assigned_helper,
    o.vehicle_plate,
    o.source_final_cod,
        CASE
            WHEN (f.delivery_way_id IS NULL) THEN 'NOT_REPORTED_FAILED'::text
            ELSE 'REPORTED_FAILED'::text
        END AS ground_outcome,
    f.original_reason,
    f.reported_worker,
    f.category,
    f.redelivery_date,
    f.reconciliation_status,
    p.parcel_status AS system_parcel_status,
    s.stop_status AS system_stop_status,
        CASE
            WHEN ((f.delivery_way_id IS NOT NULL) AND (f.reconciliation_status = 'STATUS_CONFLICT'::text)) THEN 'DELIVERED_STATUS_CONFLICT'::text
            WHEN (p.delivery_way_id IS NULL) THEN 'MISSING_PARCEL'::text
            WHEN (f.delivery_way_id IS NOT NULL) THEN 'RECONCILE_FAILED_ATTEMPT'::text
            ELSE 'VERIFY_DELIVERY_OUTCOME'::text
        END AS action_required
   FROM (((private.be_oct23_outbound_manifest_v1 o
     LEFT JOIN private.be_oct23_ground_failures_v1 f ON ((f.delivery_way_id = o.delivery_way_id)))
     LEFT JOIN be_data_entry_parcel_details p ON ((p.delivery_way_id = o.delivery_way_id)))
     LEFT JOIN LATERAL ( SELECT z.stop_status
           FROM be_wayplan_dispatch_stops z
          WHERE (z.delivery_way_id = o.delivery_way_id)
          ORDER BY z.updated_at DESC
         LIMIT 1) s ON (true)))current_source where private.be_current_operational_way_v1(current_source.delivery_way_id);
create or replace view private.be_oct23_recovery_readiness_v1 with(security_barrier=true) as select current_source.* from (SELECT s.delivery_way_id,
    s.source_seq,
    s.merchant_name,
    f.category,
    f.redelivery_date,
    f.original_reason,
    s.final_cod_raw,
        CASE
            WHEN ((s.recipient_address IS NULL) OR (s.recipient_phone IS NULL)) THEN 'SOURCE_DATA_INCOMPLETE'::text
            WHEN (p.delivery_way_id IS NOT NULL) THEN 'ALREADY_IN_PARCEL_MASTER'::text
            WHEN ((NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric IS DISTINCT FROM ((NULLIF(regexp_replace(COALESCE(s.item_price_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric + COALESCE((NULLIF(regexp_replace(COALESCE(s.delivery_fee_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric, (0)::numeric))) THEN 'FEE_OR_SURCHARGE_REVIEW'::text
            ELSE 'PICKUP_LINEAGE_REQUIRED'::text
        END AS recovery_blocker
   FROM ((private.be_oct23_missing_parcel_recovery_source_v1 s
     JOIN private.be_oct23_ground_failures_v1 f ON ((f.delivery_way_id = s.delivery_way_id)))
     LEFT JOIN be_data_entry_parcel_details p ON ((p.delivery_way_id = s.delivery_way_id))))current_source where private.be_current_operational_way_v1(current_source.delivery_way_id);
create or replace view private.be_oct23_recovery_identity_review_v2 with(security_barrier=true) as select current_source.* from (WITH x AS (
         SELECT s.delivery_way_id AS old_way,
            s.source_seq,
            s.merchant_name,
            s.recipient_name,
            s.recipient_township,
            s.recipient_address,
            f.category,
            f.original_reason,
            f.redelivery_date,
            (NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric AS source_cod,
                CASE
                    WHEN (s.delivery_way_id ~~ 'D1022-KSC-%'::text) THEN ('D1023-KSC-'::text || lpad((((split_part(s.delivery_way_id, '-'::text, 3))::integer - 141))::text, 3, '0'::text))
                    ELSE NULL::text
                END AS offset_way
           FROM (private.be_oct23_missing_parcel_recovery_source_v1 s
             JOIN private.be_oct23_ground_failures_v1 f ON ((f.delivery_way_id = s.delivery_way_id)))
        ), candidate AS (
         SELECT x.old_way,
            x.source_seq,
            x.merchant_name,
            x.recipient_name,
            x.recipient_township,
            x.recipient_address,
            x.category,
            x.original_reason,
            x.redelivery_date,
            x.source_cod,
            x.offset_way,
            COALESCE(ko.delivery_way_id, nc.delivery_way_id) AS candidate_way,
            COALESCE(ko.pickup_id, nc.pickup_id) AS candidate_pickup_id,
            COALESCE(ko.cod_amount, nc.cod_amount) AS candidate_cod,
            COALESCE(ko.parcel_status, nc.parcel_status) AS candidate_status,
            COALESCE(ko.recipient_name, nc.recipient_name) AS candidate_name,
            COALESCE(ko.township, nc.township) AS candidate_township,
            COALESCE(ko.recipient_address, nc.recipient_address) AS candidate_address,
            nc.match_count AS name_cod_township_candidates
           FROM ((x
             LEFT JOIN be_data_entry_parcel_details ko ON ((ko.delivery_way_id = x.offset_way)))
             LEFT JOIN LATERAL ( SELECT z.delivery_way_id,
                    z.pickup_id,
                    z.cod_amount,
                    z.parcel_status,
                    z.recipient_name,
                    z.township,
                    z.recipient_address,
                    count(*) OVER () AS match_count
                   FROM be_data_entry_parcel_details z
                  WHERE ((x.offset_way IS NULL) AND (lower(btrim(COALESCE(z.recipient_name, ''::text))) = lower(btrim(COALESCE(x.recipient_name, ''::text)))) AND (lower(btrim(COALESCE(z.township, ''::text))) = lower(btrim(COALESCE(x.recipient_township, ''::text)))) AND (z.cod_amount = x.source_cod) AND (split_part(z.delivery_way_id, '-'::text, 2) = split_part(x.old_way, '-'::text, 2)))
                 LIMIT 1) nc ON (true))
        )
 SELECT old_way,
    source_seq,
    merchant_name,
    category,
    original_reason,
    redelivery_date,
    source_cod,
    candidate_way,
    candidate_pickup_id,
    candidate_cod,
    candidate_status,
    (candidate_name = recipient_name) AS name_equal,
    (candidate_township = recipient_township) AS township_equal,
    (candidate_address = recipient_address) AS address_equal,
        CASE
            WHEN (candidate_way IS NULL) THEN 'NO_IDENTITY_CANDIDATE'::text
            WHEN ((offset_way IS NOT NULL) AND ((candidate_name IS DISTINCT FROM recipient_name) OR (candidate_township IS DISTINCT FROM recipient_township))) THEN 'IDENTITY_CONFLICT_REVIEW'::text
            WHEN (offset_way IS NOT NULL) THEN 'HIGH_CONFIDENCE_RENUMBERING'::text
            WHEN (name_cod_township_candidates = 1) THEN 'HIGH_CONFIDENCE_DATA_MATCH'::text
            ELSE 'AMBIGUOUS_MATCH_REVIEW'::text
        END AS recovery_class
   FROM candidate)current_source where private.be_current_operational_way_v1(current_source.old_way);
create or replace view private.be_oct23_identity_conflict_worklist_v1 with(security_barrier=true) as select current_source.* from (SELECT u.source_way_id,
    u.candidate_way_id,
    f.category AS ground_outcome,
    f.original_reason AS ground_reason,
    f.redelivery_date AS ground_redelivery_date,
    p.parcel_status AS candidate_status,
    p.finance_status AS candidate_finance_status,
    (s.source_row ->> 'source'::text) AS source_document,
    p.pickup_id AS candidate_pickup_id,
    (split_part(u.source_way_id, '-'::text, 2) = split_part(u.candidate_way_id, '-'::text, 2)) AS merchant_code_matches,
    (lower(btrim(COALESCE(s.recipient_name, ''::text))) = lower(btrim(COALESCE(p.recipient_name, ''::text)))) AS recipient_name_matches,
    (lower(btrim(COALESCE(s.recipient_township, ''::text))) = lower(btrim(COALESCE(p.township, ''::text)))) AS township_matches,
    (lower(btrim(COALESCE(s.recipient_address, ''::text))) = lower(btrim(COALESCE(p.recipient_address, ''::text)))) AS address_matches,
    (p.cod_amount = (NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric) AS cod_matches,
    p.cod_amount AS candidate_cod,
    (NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric AS ground_reported_cod,
    (p.cod_amount - (NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric) AS candidate_minus_ground_cod,
        CASE
            WHEN ((p.parcel_status = 'DELIVERED'::text) AND (f.category = ANY (ARRAY['POSTPONED'::text, 'UNREACHABLE'::text, 'NO_ATTEMPT'::text, 'CANCELLED'::text, 'CUSTOMER_SERVICE_REVIEW'::text]))) THEN 'CONFLICT_WITH_DELIVERED_RECORD'::text
            WHEN (split_part(u.source_way_id, '-'::text, 2) <> split_part(u.candidate_way_id, '-'::text, 2)) THEN 'MERCHANT_IDENTITY_CONFLICT'::text
            WHEN (lower(btrim(COALESCE(s.recipient_name, ''::text))) <> lower(btrim(COALESCE(p.recipient_name, ''::text)))) THEN 'RECIPIENT_IDENTITY_CONFLICT'::text
            WHEN (lower(btrim(COALESCE(s.recipient_township, ''::text))) <> lower(btrim(COALESCE(p.township, ''::text)))) THEN 'DESTINATION_IDENTITY_CONFLICT'::text
            WHEN (p.cod_amount IS DISTINCT FROM (NULLIF(regexp_replace(COALESCE(s.final_cod_raw, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::numeric) THEN 'COD_DISCREPANCY'::text
            ELSE 'DOCUMENTARY_CONFIRMATION_REQUIRED'::text
        END AS primary_blocker,
    u.review_state,
    ( SELECT count(*) AS count
           FROM be_finance_cod_settlements_v48 v
          WHERE ((v.delivery_way_id = u.candidate_way_id) AND (v.settlement_status = 'SETTLED'::text))) AS verified_settlements
   FROM (((private.be_oct23_unresolved_identity_review_v1 u
     JOIN private.be_oct23_missing_parcel_recovery_source_v1 s ON ((s.delivery_way_id = u.source_way_id)))
     JOIN private.be_oct23_ground_failures_v1 f ON ((f.delivery_way_id = u.source_way_id)))
     LEFT JOIN be_data_entry_parcel_details p ON ((p.delivery_way_id = u.candidate_way_id))))current_source where private.be_current_operational_way_v1(current_source.source_way_id);
create or replace view private.be_oct20_22_dispatch_evidence_worklist_v1 with(security_barrier=true) as select current_source.* from (SELECT m.sheet_date,
    m.source_sheet,
    m.source_row,
    m.delivery_way_id,
    s.scan_status,
    s.scanned_at,
    s.scanned_by,
        CASE
            WHEN (s.delivery_way_id IS NULL) THEN 'MISSING_SCAN_EVIDENCE'::text
            WHEN (s.scanned_by = 'postgres'::text) THEN 'SYSTEM_ATTRIBUTED_SCAN_REVIEW'::text
            ELSE 'RECORDED_STAFF_SCAN'::text
        END AS scan_review,
    p.parcel_status,
    x.review_state AS financial_review_state,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('status', t.stop_status, 'reason', t.failed_reason, 'wayplan_id', t.wayplan_id)) AS jsonb_agg
           FROM be_wayplan_dispatch_stops t
          WHERE (t.delivery_way_id = m.delivery_way_id)), '[]'::jsonb) AS stop_evidence,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM be_wayplan_dispatch_stops t
              WHERE ((t.delivery_way_id = m.delivery_way_id) AND (t.stop_status = 'RETURN_TO_WAREHOUSE'::text)))) THEN 'RETURN_HISTORY_REVIEW'::text
            WHEN (EXISTS ( SELECT 1
               FROM be_wayplan_dispatch_stops t
              WHERE ((t.delivery_way_id = m.delivery_way_id) AND (t.stop_status = 'DELIVERED'::text)))) THEN 'DELIVERED_STOP_REVIEW'::text
            ELSE 'NO_TERMINAL_STOP_EVIDENCE'::text
        END AS delivery_review
   FROM (((private.be_oct2026_external_settlement_manifest m
     LEFT JOIN be_dispatch_scans_v39 s ON ((s.delivery_way_id = m.delivery_way_id)))
     LEFT JOIN be_data_entry_parcel_details p ON ((p.delivery_way_id = m.delivery_way_id)))
     LEFT JOIN private.be_oct2026_external_settlement_review_v1 x ON (((x.delivery_way_id = m.delivery_way_id) AND (x.source_sha256 = m.source_sha256)))))current_source where private.be_current_operational_way_v1(current_source.delivery_way_id);
