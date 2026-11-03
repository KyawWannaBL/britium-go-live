-- Royal Express current live queue support; retain existing auth and finance guards.
-- Unscheduled Royal parcels have schedule_occurrences=0 and last_schedule_date=NULL.
-- Schedule alone remains NOT proof of delivery.
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
 return jsonb_build_object('ok',true,'total',v_total,'rows',v_rows,'source','third_party_schedule_only_not_proof_of_delivery','finance_rule','confirmation creates per-merchant Finance review, not paid settlement');
end $function$
;

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
 if not (
 exists(select 1 from private.be_thirdparty_schedule_way_rows_v1 where delivery_way_id=p_way_id and scheduled_on>=(public.be_golive_live_cutoff_v1()at time zone 'Asia/Yangon')::date)
 or exists(select 1 from public.be_data_entry_parcel_details p
    where p.delivery_way_id=p_way_id and p.delivery_route_mode='ROYAL_EXPRESS'
    and private.be_current_operational_way_v1(p.delivery_way_id))
) then return jsonb_build_object('ok',false,'error','NOT_IN_CURRENT_THIRD_PARTY_SCOPE');end if;
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
end $function$
;
