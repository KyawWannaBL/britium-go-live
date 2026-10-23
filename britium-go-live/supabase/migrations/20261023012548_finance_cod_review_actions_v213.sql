-- Finance users perform these actions explicitly; migration does not review rows.
create or replace function public.be_finance_cod_review_action_v213(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path to public,auth,pg_temp
as $function$
declare
 v_role text:=public.be_current_role();
 v_actor text:=coalesce(nullif(lower(auth.jwt()->>'email'),''),auth.uid()::text);
 v_id uuid;v_operation uuid;v_action text:=upper(coalesce(p_payload->>'action',''));
 v_reason text:=nullif(btrim(p_payload->>'reason'),'');
 v_ref text:=nullif(btrim(p_payload->>'reference'),'');
 v_method text:=upper(coalesce(p_payload->>'payment_method',''));
 v_amount numeric;v_original numeric;v_adjustment numeric;v_version timestamptz;
 v_row public.be_wayplan_cod_settlements%rowtype;v_before jsonb;v_audit record;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 if coalesce(v_role,'') not in('finance','accountant','superadmin','super_admin') then return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');end if;
 if v_action not in('CONFIRM','REJECT','ADJUST') then return jsonb_build_object('ok',false,'error','INVALID_ACTION');end if;
 begin
  v_id:=(p_payload->>'row_id')::uuid;v_operation:=(p_payload->>'operation_id')::uuid;
  v_version:=(p_payload->>'expected_updated_at')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('ok',false,'error','INVALID_REQUEST');
 end;
 if v_id is null or v_operation is null or v_version is null then return jsonb_build_object('ok',false,'error','INVALID_REQUEST');end if;
 select * into v_row from public.be_wayplan_cod_settlements where id=v_id for update;
 if not found then return jsonb_build_object('ok',false,'error','ROW_NOT_FOUND');end if;
 select metadata into v_audit from public.audit_logs
 where action='FINANCE_COD_REVIEW_'||v_action and entity_id=v_id::text
 and metadata->>'operation_id'=v_operation::text order by id desc limit 1;
 if found then
  if v_audit.metadata->'request_payload' is distinct from p_payload then return jsonb_build_object('ok',false,'error','OPERATION_REUSED');end if;
  return jsonb_build_object('ok',true,'idempotent',true,'row',to_jsonb(v_row));
 end if;
 if exists(select 1 from public.audit_logs where entity_id=v_id::text and action like 'FINANCE_COD_REVIEW_%' and metadata->>'operation_id'=v_operation::text) then return jsonb_build_object('ok',false,'error','OPERATION_REUSED');end if;
 if upper(coalesce(v_row.settlement_status,''))='SETTLED' or v_row.settled_at is not null then return jsonb_build_object('ok',false,'error','SETTLEMENT_LOCKED');end if;
 perform 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id for update;
 if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='SETTLED') then return jsonb_build_object('ok',false,'error','DOWNSTREAM_SETTLEMENT_LOCKED');end if;
 if v_row.updated_at is distinct from v_version then return jsonb_build_object('ok',false,'error','STALE_REVIEW','message','This row changed. Refresh and review its latest values.');end if;
 if v_action in('REJECT','ADJUST') and v_reason is null then return jsonb_build_object('ok',false,'error','REASON_REQUIRED');end if;
 v_before:=to_jsonb(v_row);
 if v_action='ADJUST' then
  if coalesce(p_payload->>'adjustment_mmk','') !~ '^-?[0-9]+([.][0-9]{1,2})?$' then return jsonb_build_object('ok',false,'error','INVALID_AMOUNT');end if;
  v_amount:=(p_payload->>'adjustment_mmk')::numeric;
  if v_amount=0 then return jsonb_build_object('ok',false,'error','ZERO_ADJUSTMENT');end if;
  if coalesce(v_row.cod_expected,0)+v_amount<0 then return jsonb_build_object('ok',false,'error','NEGATIVE_EXPECTED_AMOUNT');end if;
  v_original:=coalesce((v_row.metadata->>'original_expected_collection')::numeric,v_row.cod_expected,0);
  v_adjustment:=coalesce((v_row.metadata->>'collection_adjustment_mmk')::numeric,0)+v_amount;
  update public.be_wayplan_cod_settlements set cod_expected=coalesce(cod_expected,0)+v_amount,settlement_status='PENDING_SETTLEMENT',
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_status','ADJUSTED','original_expected_collection',v_original,'collection_adjustment_mmk',v_adjustment,'adjustment_reason',v_reason,'adjusted_by',v_actor,'adjusted_at',clock_timestamp(),'review_reopened_after_correction',v_row.settlement_status='REJECTED'),updated_at=clock_timestamp()
  where id=v_id returning * into v_row;
 elsif v_action='REJECT' then
  update public.be_wayplan_cod_settlements set settlement_status='REJECTED',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_status','REJECTED','rejection_reason',v_reason,'rejected_by',v_actor,'rejected_at',clock_timestamp()),updated_at=clock_timestamp() where id=v_id returning * into v_row;
 else
  if v_row.settlement_status='REJECTED' then return jsonb_build_object('ok',false,'error','REVIEW_REJECTED','message','Correct and adjust the rejected row before confirmation.');end if;
  if coalesce(p_payload->>'actual_collected','')='' then return jsonb_build_object('ok',false,'error','COLLECTION_REQUIRED');end if;
  if p_payload->>'actual_collected' !~ '^[0-9]+([.][0-9]{1,2})?$' then return jsonb_build_object('ok',false,'error','INVALID_AMOUNT');end if;
  v_amount:=(p_payload->>'actual_collected')::numeric;
  if v_ref is null then return jsonb_build_object('ok',false,'error','REFERENCE_REQUIRED');end if;
  if v_method not in('CASH','BANK_TRANSFER','MOBILE_WALLET','QR') then return jsonb_build_object('ok',false,'error','PAYMENT_METHOD_REQUIRED');end if;
  if v_amount is distinct from v_row.cod_expected then return jsonb_build_object('ok',false,'error','AMOUNT_MISMATCH','message','Received amount differs from expected collection. Record an explained adjustment before confirming.');end if;
  if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='HOLD_EXCEPTION') then return jsonb_build_object('ok',false,'error','FIELD_EXCEPTION_HOLD');end if;
  if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='SETTLED') then return jsonb_build_object('ok',false,'error','DOWNSTREAM_SETTLEMENT_LOCKED');end if;
  update public.be_wayplan_cod_settlements set cod_collected=v_amount,settlement_status='SETTLED',settlement_reference=v_ref,settled_at=clock_timestamp(),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_status','CONFIRMED','collection_evidence_status','FINANCE_RECORDED','payment_method',v_method,'payment_mode',v_method,'collection_reference',v_ref,'settled_by',v_actor,'finance_confirmed_by_uid',auth.uid(),'finance_confirmed_at',clock_timestamp()),updated_at=clock_timestamp()
  where id=v_id returning * into v_row;
  update public.be_finance_cod_settlements_v48 set expected_cod=v_row.cod_expected,reported_collected=v_amount,rider_remittance=v_amount,settled_amount=v_amount,settlement_status='SETTLED',settlement_reference=v_ref,settled_by=v_actor,settled_at=v_row.settled_at,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_source','COD_REVIEW_V213','payment_method',v_method,'settled_by',v_actor,'adjustment_mmk',v_row.metadata->'collection_adjustment_mmk'),updated_at=clock_timestamp()
  where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id;
 end if;
 insert into public.audit_logs(action,table_name,actor_uid,actor_email,actor_role,entity_type,entity_id,before_data,after_data,metadata)
 values('FINANCE_COD_REVIEW_'||v_action,'be_wayplan_cod_settlements',auth.uid(),v_actor,v_role,'COD_SETTLEMENT',v_id::text,v_before,to_jsonb(v_row),jsonb_build_object('operation_id',v_operation,'request_payload',p_payload,'reason',v_reason,'source_business_date',v_row.metadata->>'source_business_date'));
 return jsonb_build_object('ok',true,'action',v_action,'row',to_jsonb(v_row));
end;
$function$;
revoke all on function public.be_finance_cod_review_action_v213(jsonb) from public;
grant execute on function public.be_finance_cod_review_action_v213(jsonb) to authenticated;

-- Legacy settlement cannot bypass a Finance rejection.
CREATE OR REPLACE FUNCTION public.be_finance_settle_wayplan_cod(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wayplan_id text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery_way_id text:=nullif(upper(btrim(p_payload->>'delivery_way_id')),'');
  v_reference text:=coalesce(
    nullif(btrim(p_payload->>'settlement_reference'),''),
    'SET-'||to_char(now(),'YYYYMMDD-HH24MISS')
  );
  v_actor text:=coalesce(
    nullif(btrim(p_payload->>'actor'),''),
    lower(auth.jwt()->>'email'),
    'finance'
  );
  v_count integer:=0;
  v_v48_count integer:=0;
  v_hold_count integer:=0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');
  end if;
  if coalesce(public.be_current_role(),'') not in ('finance','accountant','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');
  end if;
  v_actor := coalesce(nullif(lower(auth.jwt()->>'email'),''),'finance:'||auth.uid()::text);
  perform 1 from public.be_wayplan_cod_settlements w
  where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
  order by w.id for update;
  if exists(select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
      and upper(coalesce(w.settlement_status,''))='REJECTED') then
    return jsonb_build_object('ok',false,'error','REVIEW_REJECTED');
  end if;
  if exists(select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
      and (w.metadata ? 'finance_review_status' or w.metadata ? 'original_expected_collection')) then
    return jsonb_build_object('ok',false,'error','EXPLICIT_REVIEW_REQUIRED');
  end if;
  -- Historical expected amounts do not establish receipt of customer funds.
  if exists (
    select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
      and upper(coalesce(w.settlement_status,''))<>'SETTLED'
      and w.metadata->>'historical_source_review'='true'
      and w.cod_collected is null
  ) then
    return jsonb_build_object('ok',false,'error','COLLECTION_EVIDENCE_REQUIRED',
      'message','Finance must reconcile and record the actual collection before settlement.');
  end if;
  if v_wayplan_id is null and v_delivery_way_id is null then
    return jsonb_build_object('ok',false,'error','wayplan_id or delivery_way_id is required');
  end if;

  select count(*)::integer
  into v_hold_count
  from public.be_finance_cod_settlements_v48 f
  where upper(coalesce(f.settlement_status,''))='HOLD_EXCEPTION'
    and (v_wayplan_id is null or f.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(f.delivery_way_id)=v_delivery_way_id);

  if v_hold_count>0 then
    return jsonb_build_object(
      'ok',false,
      'error','FIELD_EXCEPTION_HOLD',
      'message','One or more COD rows are on field-exception hold. Resolve the failed-way / RTO exception before settlement.',
      'hold_count',v_hold_count
    );
  end if;

  update public.be_wayplan_cod_settlements w
  set settlement_status='SETTLED',
      settlement_reference=v_reference,
      settled_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'settled_by',v_actor,
        'settled_at',now(),
        'settlement_reference',v_reference,
        'finance_sync','V93'
      ),
      updated_at=now()
  where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
    and upper(coalesce(w.settlement_status,''))<>'SETTLED';

  get diagnostics v_count=row_count;

  update public.be_finance_cod_settlements_v48 f
  set settlement_status='SETTLED',
      settled_amount=coalesce(nullif(f.rider_remittance,0),nullif(f.reported_collected,0),f.expected_cod,0),
      settlement_reference=v_reference,
      settlement_receiver=coalesce(nullif(p_payload->>'settlement_receiver',''),'Finance'),
      settlement_note=coalesce(nullif(p_payload->>'settlement_note',''),'Settled from Finance COD Center'),
      settled_by=v_actor,
      settled_at=now(),
      hold_code=null,
      hold_note=null,
      held_by=null,
      held_at=null,
      metadata=coalesce(f.metadata,'{}'::jsonb)||jsonb_build_object(
        'settled_by',v_actor,
        'settled_at',now(),
        'settlement_reference',v_reference,
        'finance_sync','V93'
      ),
      updated_at=now()
  where (v_wayplan_id is null or f.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(f.delivery_way_id)=v_delivery_way_id)
    and upper(coalesce(f.settlement_status,''))<>'SETTLED'
    and upper(coalesce(f.settlement_status,''))<>'HOLD_EXCEPTION';

  get diagnostics v_v48_count=row_count;

  return jsonb_build_object(
    'ok',true,
    'settled_count',v_count,
    'finance_v48_settled_count',v_v48_count,
    'settlement_reference',v_reference,
    'status','SETTLED',
    'sync_build','V93'
  );
end;
$function$;

-- Enrich all queue rows from their own wayplan, preserving historical crew snapshots.
create or replace function public.be_finance_wayplan_cod_center(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path to public,pg_temp
as $reader$
declare v_rows jsonb;v_summary jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(x) order by x.delivered_at desc nulls last,x.created_at desc),'[]'::jsonb) into v_rows
 from(select w.*,
  coalesce(nullif(w.metadata->>'driver_code',''),p.driver_code) driver_code,
  coalesce(nullif(w.metadata->>'driver_name',''),p.driver_name) driver_name,
  coalesce(nullif(w.metadata->>'helper_code',''),p.helper_code) helper_code,
  coalesce(nullif(w.metadata->>'helper_name',''),p.helper_name) helper_name
 from public.be_wayplan_cod_settlements w left join public.be_wayplan_dispatches p using(wayplan_id)
 order by w.delivered_at desc nulls last,w.created_at desc limit greatest(coalesce(p_limit,200),1)) x;
 select jsonb_build_object('total_expected',coalesce(sum(cod_expected),0),'total_collected',coalesce(sum(cod_collected),0),
 'pending_settlement',coalesce(sum(cod_collected) filter(where settlement_status='PENDING_SETTLEMENT'),0),
 'settled',coalesce(sum(cod_collected) filter(where settlement_status='SETTLED'),0),'delivered_cod_count',count(*)) into v_summary
 from public.be_wayplan_cod_settlements;
 return jsonb_build_object('ok',true,'source','be_finance_wayplan_cod_center','count',jsonb_array_length(v_rows),'summary',v_summary,'rows',v_rows);
end;
$reader$;

-- Operational delivery updates must retain Finance decisions and historical evidence.
create or replace function public.be_sync_wayplan_cod_settlement()
returns trigger language plpgsql security definer set search_path to public,pg_temp
as $sync$
declare v_rider_code text;v_rider_name text;
begin
 if new.stop_status='DELIVERED' and coalesce(new.cod_collected,0)>=0 then
  select rider_code,rider_name into v_rider_code,v_rider_name
   from public.be_wayplan_dispatches where wayplan_id=new.wayplan_id limit 1;
  insert into public.be_wayplan_cod_settlements as existing
   (wayplan_id,delivery_way_id,waybill_no,pickup_id,rider_code,rider_name,recipient_name,recipient_phone,
    cod_expected,cod_collected,delivery_fee,settlement_status,delivered_at,metadata,created_at,updated_at)
  values(new.wayplan_id,new.delivery_way_id,new.waybill_no,new.pickup_id,v_rider_code,v_rider_name,
   coalesce(new.receiver_name,new.recipient_name),coalesce(new.receiver_phone,new.recipient_phone),
   coalesce(new.cod_amount,0),new.cod_collected,coalesce(new.delivery_fee,0),'PENDING_SETTLEMENT',new.delivered_at,
   jsonb_build_object('source','be_wayplan_dispatch_stops','stop_status',new.stop_status,
    'rider_status',new.rider_status,'rider_proof_url',new.rider_proof_url),now(),clock_timestamp())
  on conflict(wayplan_id,delivery_way_id) do update set
   rider_code=excluded.rider_code,rider_name=excluded.rider_name,
   recipient_name=excluded.recipient_name,recipient_phone=excluded.recipient_phone,
   cod_expected=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.cod_expected else excluded.cod_expected end,
   cod_collected=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.cod_collected else excluded.cod_collected end,
   delivery_fee=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.delivery_fee else excluded.delivery_fee end,
   delivered_at=case when existing.metadata->>'historical_source_review'='true' then existing.delivered_at else excluded.delivered_at end,
   metadata=coalesce(existing.metadata,'{}'::jsonb)||excluded.metadata,updated_at=clock_timestamp();
 end if;
 return new;
end;
$sync$;

-- All client writes must use authenticated, audited review/operational RPCs.
alter table public.be_wayplan_cod_settlements enable row level security;
drop policy if exists be_wayplan_cod_settlements_all on public.be_wayplan_cod_settlements;
drop policy if exists be_wayplan_cod_settlements_read on public.be_wayplan_cod_settlements;
create policy be_wayplan_cod_settlements_read on public.be_wayplan_cod_settlements for select to authenticated using(true);
revoke insert, update, delete, truncate, references, trigger on public.be_wayplan_cod_settlements from anon, authenticated;
