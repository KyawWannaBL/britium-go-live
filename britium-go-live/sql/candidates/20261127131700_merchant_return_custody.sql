create table if not exists public.be_merchant_return_handover_v1 (
  delivery_way_id text primary key,
  warehouse_code text not null,
  dispatch_reference text not null,
  dispatched_at timestamptz not null default now(),
  dispatched_by uuid not null,
  receipt_reference text,
  received_at timestamptz,
  confirmed_by uuid,
  check ((received_at is null and receipt_reference is null and confirmed_by is null)
    or (received_at is not null and receipt_reference is not null and confirmed_by is not null))
);
alter table public.be_merchant_return_handover_v1 enable row level security;
revoke all on public.be_merchant_return_handover_v1 from public,anon,authenticated;

create or replace function public.be_merchant_return_scope_v1(p_write boolean)
returns text
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_role text := public.be_current_role();
  v_branch text;
begin
  if auth.uid() is null then raise exception 'Sign in to view merchant returns.' using errcode='42501'; end if;
  if v_role in ('superadmin','super_admin','operation_manager','operations_manager','admin') then
    return null;
  end if;
  if v_role not in ('warehouse','warehouse_staff','warehouse_supervisor','warehouse_lead','sorter',
      'supervisor','branch_manager','branch_office_manager') then
    if p_write then raise exception 'Warehouse authorization is required.' using errcode='42501'; end if;
    perform public.be_finance_assert_internal_v3();
  end if;
  select nullif(upper(btrim(r.branch_code)),'') into v_branch from public.be_user_account_registry r
    where r.auth_user_id=auth.uid() and coalesce(r.active,r.is_active,true)
    and lower(coalesce(r.status,'active')) in ('active','enabled')
    order by r.updated_at desc nulls last limit 1;
  if v_branch is null then raise exception 'Assign this account to a warehouse branch first.' using errcode='42501'; end if;
  return v_branch;
end;
$$;

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
      select w.scanned_at,w.warehouse_code from public.be_warehouse_return_scans_v39 w
      where w.delivery_way_id=a.delivery_way_id and w.scanned_at>=coalesce(a.last_failure_at,'-infinity'::timestamptz)
      order by w.scanned_at desc,w.id desc limit 1
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
    select upper(warehouse_code) into v_warehouse from public.be_warehouse_return_scans_v39
      where delivery_way_id=v_way and scanned_at>=coalesce(v_failure_at,'-infinity'::timestamptz)
      order by scanned_at desc,id desc limit 1;
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

revoke all on function public.be_merchant_return_scope_v1(boolean) from public,anon,authenticated;
revoke all on function public.be_merchant_return_queue_v1(text,text),public.be_record_merchant_return_v1(text,text,text) from public,anon;
grant execute on function public.be_merchant_return_queue_v1(text,text),public.be_record_merchant_return_v1(text,text,text) to authenticated;
