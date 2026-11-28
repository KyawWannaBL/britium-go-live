-- Customer Service records the confirmed outcome. Warehouse custody and the merchant handover remain separate events.
create table if not exists private.be_cs_confirmed_rto_v1 (
  delivery_way_id text primary key,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  confirmed_with text not null check (confirmed_with in ('CUSTOMER','MERCHANT')),
  confirmation_note text not null check (length(confirmation_note) between 12 and 1000),
  warehouse_code text not null,
  warehouse_received_at timestamptz not null
);
alter table private.be_cs_confirmed_rto_v1 enable row level security;
revoke all on private.be_cs_confirmed_rto_v1 from public, anon, authenticated;

create or replace function public.be_cs_confirm_rto_v1(
  p_way_id text, p_confirmed_with text, p_confirmation_note text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')), '[ _-]+','_','g'));
  v_way text := upper(btrim(coalesce(p_way_id,'')));
  v_with text := upper(btrim(coalesce(p_confirmed_with,'')));
  v_note text := btrim(coalesce(p_confirmation_note,''));
  v_parcel public.be_data_entry_parcel_details%rowtype;
  v_attempt public.be_delivery_attempt_state_v39%rowtype;
  v_receipt public.be_warehouse_receipts_v36%rowtype;
  v_branch text;
  v_dispatch_at timestamptz;
  v_custody_at timestamptz;
  v_warehouse text;
begin
  if auth.uid() is null or v_role not in ('customer_service','cs','support','super_admin','superadmin',
    'operation_manager','operations_manager','admin','app_owner') then
    raise exception 'Customer Service RTO permission is required.' using errcode='42501';
  end if;
  if v_with not in ('CUSTOMER','MERCHANT') or length(v_note) not between 12 and 1000 then
    raise exception 'Choose Customer or Merchant and record the confirmation (12 to 1,000 characters).';
  end if;

  select * into v_parcel from public.be_data_entry_parcel_details
  where delivery_way_id=v_way and saved_at is not null and coalesce(parcel_status,'')<>'duplicate_archived'
  for update;
  if not found then raise exception 'Open the registered parcel by its canonical Way ID.'; end if;
  v_branch := public.be_cs_resolve_parcel_branch(to_jsonb(v_parcel));
  if v_role not in ('super_admin','superadmin','operation_manager','operations_manager','admin','app_owner')
     and not (coalesce(public.be_employee_can_access_territory(null,v_branch,v_parcel.township,'update'),false)
           or coalesce(public.be_customer_service_can_manage_pickup_request(v_branch,v_parcel.township,'update'),false)) then
    raise exception 'Your account cannot confirm an RTO for this parcel territory.' using errcode='42501';
  end if;
  if exists (select 1 from private.be_cs_confirmed_rto_v1 where delivery_way_id=v_way) then
    return jsonb_build_object('ok',true,'already_confirmed',true);
  end if;

  select * into v_attempt from public.be_delivery_attempt_state_v39 where delivery_way_id=v_way for update;
  if upper(coalesce(v_attempt.last_status,'')) in ('DELIVERED','RTO','RETURN_TO_SENDER')
     or upper(coalesce(v_parcel.parcel_status,'')) in
        ('DELIVERED','COMPLETED','RTO','RETURNED','RETURN_TO_SENDER','RETURNED_TO_SENDER','CLOSED','CANCELLED','CANCELED','SETTLED')
     or exists (select 1 from public.be_wayplan_dispatch_stops s where s.delivery_way_id=v_way and
        (s.delivered_at is not null or upper(s.stop_status) in ('DELIVERED','RTO','RETURN_TO_SENDER')
         or upper(s.rider_status) in ('DELIVERED','RTO','RETURN_TO_SENDER') or coalesce(s.cod_collected,0)>0))
     or exists (select 1 from public.be_waybill_ledger l where l.delivery_way_id=v_way and
        (l.delivered_at is not null or l.cod_settled_at is not null or coalesce(l.cod_collected,0)>0
         or upper(l.dispatch_status) in ('DELIVERED','COMPLETED','RTO','CANCELLED','RETURNED_TO_SENDER')))
     or exists (select 1 from public.be_finance_cod_settlements_v48 f where f.delivery_way_id=v_way and
        (f.settled_at is not null or f.remitted_at is not null or coalesce(f.reported_collected,0)>0
         or coalesce(f.rider_remittance,0)>0 or coalesce(f.settled_amount,0)>0)) then
    raise exception 'This parcel is closed or has recorded COD activity. Review its current status with Operations or Finance.';
  end if;

  if exists (select 1 from public.be_branch_parcel_transfer_items_v1 where delivery_way_id=v_way and received_at is null)
     or exists (select 1 from public.be_merchant_return_handover_v1 where delivery_way_id=v_way) then
    raise exception 'Review the open parcel transfer or merchant handover with Warehouse before confirming RTO.';
  end if;

  select * into v_receipt from public.be_warehouse_receipts_v36
    where pickup_id=v_parcel.pickup_id and parcel_sequence=v_parcel.parcel_sequence
      and delivery_way_id=v_way for update;
  select max(stamp) into v_dispatch_at from (
    select scanned_at as stamp from public.be_dispatch_scans_v39
      where delivery_way_id=v_way and scan_status='SCANNED'
    union all
    select physically_handed_over_at from public.be_provider_transfer_custody_v1 where delivery_way_id=v_way
    union all
    select greatest(s.loaded_to_vehicle_at,s.handed_over_to_rider_at)
      from public.be_wayplan_dispatch_stops s where s.delivery_way_id=v_way
  ) x;

  select h.scanned_at,h.warehouse_code into v_custody_at,v_warehouse from (
    select s.scanned_at,s.warehouse_code from public.be_warehouse_return_scans_v39 s where s.delivery_way_id=v_way
    union all
    select e.created_at,e.warehouse_code from public.be_warehouse_receipt_events_v36 e
      where e.delivery_way_id=v_way and e.action='RESCHEDULE_RETURN_SCAN'
  ) h where nullif(btrim(h.warehouse_code),'') is not null
    and h.scanned_at>coalesce(v_dispatch_at,'-infinity'::timestamptz)
    and h.scanned_at>=coalesce(v_attempt.last_failure_at,'-infinity'::timestamptz)
  order by h.scanned_at desc limit 1;

  if v_custody_at is null and v_dispatch_at is null
     and upper(coalesce(v_parcel.parcel_status,'')) not in ('OUT_FOR_DELIVERY','DISPATCHED','ATTEMPTED_FAILED','FAILED_DELIVERY')
     and not exists (select 1 from public.be_wayplan_membership_v40 where delivery_way_id=v_way and membership_status='DISPATCHED')
     and v_receipt.warehouse_status in ('RECEIVED','WAREHOUSE_READY')
     and not coalesce(v_receipt.receiving_scan_skipped,false) then
    v_custody_at := v_receipt.scanned_at;
    v_warehouse := v_receipt.warehouse_code;
  end if;
  if v_custody_at is null or nullif(btrim(v_warehouse),'') is null then
    raise exception 'Warehouse must record physical custody first. For a dispatched parcel, complete its Warehouse Return Scan.';
  end if;

  insert into private.be_cs_confirmed_rto_v1(delivery_way_id,confirmed_by,confirmed_with,confirmation_note,warehouse_code,warehouse_received_at)
    values(v_way,auth.uid(),v_with,v_note,upper(btrim(v_warehouse)),v_custody_at);
  insert into public.be_delivery_attempt_state_v39(delivery_way_id,pickup_id,consecutive_failures,last_status,rto_at,updated_at)
    values(v_way,v_parcel.pickup_id,0,'RTO',now(),now())
    on conflict(delivery_way_id) do update set last_status='RTO',rto_at=now(),updated_at=now();
  update public.be_data_entry_parcel_details set parcel_status='RTO',updated_at=now()
    where id=v_parcel.id;
  update public.be_delivery_reschedules_v71 set status='CANCELLED',updated_at=now()
    where delivery_way_id=v_way and status='ACTIVE';
  update public.be_wayplan_membership_v40 set membership_status='RTO',updated_at=now()
    where delivery_way_id=v_way and membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED');
  update public.be_waybill_ledger set dispatch_status='RTO',rider_status='RTO',updated_at=now()
    where delivery_way_id=v_way;
  insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
    values('UPDATE','be_data_entry_parcel_details',v_way,
      jsonb_build_object('parcel_status',v_parcel.parcel_status),
      jsonb_build_object('parcel_status','RTO','confirmed_with',v_with,'confirmation',v_note,
                         'warehouse_code',v_warehouse,'warehouse_received_at',v_custody_at),
      auth.uid(),now());
  return jsonb_build_object('ok',true,'status','RTO');
end;
$function$;
revoke all on function public.be_cs_confirm_rto_v1(text,text,text) from public,anon;
grant execute on function public.be_cs_confirm_rto_v1(text,text,text) to authenticated;

-- Keep the same custody checks for merchant handovers and recognize the evidence recorded at CS confirmation.
create or replace view private.be_merchant_rto_custody_v2 as
select delivery_way_id, scanned_at, warehouse_code from public.be_warehouse_return_scans_v39
union all
select delivery_way_id, warehouse_received_at, warehouse_code from private.be_cs_confirmed_rto_v1;
revoke all on private.be_merchant_rto_custody_v2 from public,anon,authenticated;

create or replace function public.be_merchant_return_queue_v1(p_search text default null, p_merchant text default null)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_branch text := public.be_merchant_return_scope_v1(false);
  v_search text := lower(btrim(coalesce(p_search,'')));
  v_rows jsonb;
begin
  with queue as (
    select a.delivery_way_id, coalesce(nullif(d.financial_quote->>'source_waybill_no',''),a.delivery_way_id) waybill_no,
      d.merchant_id, s.scanned_at warehouse_return_at, coalesce(h.warehouse_code,upper(s.warehouse_code)) warehouse_code,
      h.dispatched_at, h.dispatch_reference, h.received_at, h.receipt_reference
    from public.be_delivery_attempt_state_v39 a
    join public.be_data_entry_parcel_details d on d.delivery_way_id=a.delivery_way_id
    left join public.be_merchant_return_handover_v1 h on h.delivery_way_id=a.delivery_way_id
    left join lateral (
      select w.scanned_at,w.warehouse_code from private.be_merchant_rto_custody_v2 w
      where w.delivery_way_id=a.delivery_way_id and w.scanned_at>=coalesce(a.last_failure_at,'-infinity'::timestamptz)
      order by w.scanned_at desc,upper(w.warehouse_code) limit 1
    ) s on true
    where (h.delivery_way_id is not null or (upper(a.last_status)='RTO' and s.scanned_at is not null))
      and (v_branch is null or v_branch=regexp_replace(coalesce(h.warehouse_code,upper(s.warehouse_code)),'-MAIN$',''))
      and (p_merchant is null or d.merchant_id=p_merchant)
      and (v_search='' or strpos(lower(a.delivery_way_id),v_search)>0
        or strpos(lower(d.financial_quote->>'source_waybill_no'),v_search)>0
        or strpos(lower(d.merchant_id),v_search)>0)
    order by (h.received_at is not null), coalesce(h.received_at,h.dispatched_at,s.scanned_at) desc,a.delivery_way_id
    limit 250
  )
  select coalesce(jsonb_agg(to_jsonb(queue)),'[]'::jsonb) into v_rows from queue;
  return v_rows;
end;
$$;

create or replace function public.be_record_merchant_return_v1(p_way_id text, p_action text, p_reference text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_branch text := public.be_merchant_return_scope_v1(true);
  v_way text := upper(btrim(coalesce(p_way_id,'')));
  v_ref text := btrim(coalesce(p_reference,''));
  v_return public.be_merchant_return_handover_v1%rowtype;
  v_warehouse text;
  v_status text;
  v_failure_at timestamptz;
begin
  if p_action is null or p_action not in ('DISPATCH','RECEIPT') then raise exception 'Choose a merchant return action.'; end if;
  if length(v_ref) not between 1 and 250 then raise exception 'Enter the handover reference (up to 250 characters).'; end if;

  perform 1 from public.be_data_entry_parcel_details
    where delivery_way_id=v_way and coalesce(parcel_status,'')<>'duplicate_archived' for update;
  if not found then raise exception 'Open the parcel by its canonical Way ID.'; end if;
  select * into v_return from public.be_merchant_return_handover_v1 where delivery_way_id=v_way for update;
  if v_return.delivery_way_id is not null then
    v_warehouse := v_return.warehouse_code;
  else
    select last_status,last_failure_at into v_status,v_failure_at
      from public.be_delivery_attempt_state_v39 where delivery_way_id=v_way for update;
    if upper(coalesce(v_status,'')) <> 'RTO' then raise exception 'Warehouse must confirm the RTO first.'; end if;
    select upper(warehouse_code) into v_warehouse from private.be_merchant_rto_custody_v2
      where delivery_way_id=v_way and scanned_at>=coalesce(v_failure_at,'-infinity'::timestamptz)
      order by scanned_at desc,upper(warehouse_code) limit 1;
    if v_warehouse is null then raise exception 'Record the physical Warehouse Return Scan first.'; end if;
  end if;
  if v_branch is not null and v_branch<>regexp_replace(v_warehouse,'-MAIN$','') then
    raise exception 'Only the warehouse holding this RTO parcel can record handover.' using errcode='42501';
  end if;

  if p_action='DISPATCH' then
    if v_return.delivery_way_id is not null then
      if v_return.dispatch_reference=v_ref then return to_jsonb(v_return); end if;
      raise exception 'The merchant return has already been dispatched.';
    end if;
    if exists (select 1 from public.be_branch_parcel_transfer_items_v1 where delivery_way_id=v_way and received_at is null) then
      raise exception 'Complete the open branch transfer before a merchant handover.';
    end if;
    insert into public.be_merchant_return_handover_v1(delivery_way_id,warehouse_code,dispatch_reference,dispatched_by)
      values (v_way,v_warehouse,v_ref,auth.uid()) returning * into v_return;
  else
    if v_return.delivery_way_id is null then raise exception 'Record dispatch to merchant before confirming their receipt.'; end if;
    if v_return.received_at is not null then
      if v_return.receipt_reference=v_ref then return to_jsonb(v_return); end if;
      raise exception 'Merchant receipt is already confirmed.';
    end if;
    update public.be_merchant_return_handover_v1
      set received_at=now(),receipt_reference=v_ref,confirmed_by=auth.uid()
      where delivery_way_id=v_way returning * into v_return;
  end if;
  return to_jsonb(v_return);
end;
$$;
