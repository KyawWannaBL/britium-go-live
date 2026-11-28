create table if not exists private.be_merchant_pickup_manifests (
  pickup_id text primary key references public.be_portal_pickup_requests(pickup_id) on delete cascade,
  shipments jsonb not null
);
alter table private.be_merchant_pickup_manifests enable row level security;
revoke all on table private.be_merchant_pickup_manifests from public, anon, authenticated;

create or replace view private.be_merchant_shipments_v2 as
select
  coalesce(nullif(d.delivery_way_id,''), w.delivery_way_id) as delivery_way_id, w.waybill_no,
  coalesce(d.pickup_id,w.pickup_id) as pickup_id, upper(coalesce(d.merchant_id,w.merchant_code)) as merchant_code,
  coalesce(d.recipient_name,w.recipient_name) as recipient_name, coalesce(d.contact_no_1,w.recipient_phone) as recipient_phone,
  coalesce(d.recipient_address,w.recipient_address,w.delivery_address) as recipient_address,
  coalesce(d.township,w.township) as township, coalesce(d.actual_collect,d.cod_amount,w.cod_amount) as cod_amount,
  coalesce(d.weight_kg,w.weight_kg) as weight_kg, coalesce(w.status,d.parcel_status,'REGISTERED') as status,
  coalesce(w.dispatch_status,case when d.dispatch_scanned_at is not null then 'DISPATCHED' end) as dispatch_status,
  coalesce(w.warehouse_status,d.warehouse_status) as warehouse_status, w.rider_status,
  w.delivered_at, d.return_scanned_at as last_return_scanned_at,
  x.provider_code as provider,x.outcome as provider_outcome,x.updated_at as provider_updated_at,
  coalesce(nullif(d.financial_quote->>'service_provider_code',''),nullif(d.financial_quote->>'provider_code','')) as planned_provider,
  coalesce(d.is_printed,false) or d.printed_at is not null or upper(coalesce(d.print_status,'')) in ('PRINTED','PUBLISHED','CREATED')
    or w.id is not null as waybill_published,
  coalesce(d.created_at,w.created_at) as created_at, greatest(d.updated_at,w.updated_at) as updated_at
from public.be_data_entry_parcel_details d
full join public.be_waybill_ledger w on w.delivery_way_id=d.delivery_way_id
  and upper(w.merchant_code)=upper(d.merchant_id)
left join public.be_thirdparty_cs_current_v1 x on x.delivery_way_id=coalesce(nullif(d.delivery_way_id,''),w.delivery_way_id)
  and upper(x.merchant_code)=upper(coalesce(d.merchant_id,w.merchant_code))
where nullif(coalesce(nullif(d.delivery_way_id,''),w.delivery_way_id),'') is not null;
revoke all on private.be_merchant_shipments_v2 from public,anon,authenticated;

create or replace function private.be_merchant_portal_identity_v2()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_account public.be_merchant_accounts;
  v_identity jsonb;
  v_code text;
begin
  if v_uid is null or not exists (
    select 1 from public.be_user_account_registry a
    where a.auth_user_id = v_uid and coalesce(a.active,true) and coalesce(a.is_active,true)
      and lower(coalesce(a.status,'active')) in ('active','enabled')
      and lower(replace(a.role,'-','_')) in ('merchant','vip_customer')
  ) then
    raise exception 'An active merchant login is required.' using errcode='42501';
  end if;
  select * into v_account from public.be_merchant_accounts where auth_user_id = v_uid;
  if found then
    if upper(coalesce(v_account.status,'')) <> 'ACTIVE' then
      raise exception 'This merchant account is inactive.' using errcode='42501';
    end if;
    v_identity := jsonb_build_object('merchant_code',v_account.merchant_code,'merchant_name',v_account.merchant_name);
  else
    raise exception 'Ask Britium to link this login to your merchant account.' using errcode='42501';
  end if;
  v_code := upper(btrim(coalesce(v_identity->>'merchant_code','')));
  if v_code !~ '^[A-Z][A-Z0-9]{1,2}$' or v_code in ('BBB','BLK','GEN') then
    raise exception 'Britium must link this login to an individual merchant code.' using errcode='42501';
  end if;
  return jsonb_build_object('merchant_code',v_code,'merchant_name',coalesce(nullif(v_identity->>'merchant_name',''),v_code));
end $$;
revoke all on function private.be_merchant_portal_identity_v2() from public, anon, authenticated;

create or replace function private.be_merchant_portal_workflow_impl(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_identity jsonb := private.be_merchant_portal_identity_v2();
  v_code text := v_identity->>'merchant_code';
  v_arg jsonb := coalesce(p_payload,'{}'::jsonb);
  v_ref text;
  v_way jsonb;
  v_rows jsonb;
  v_finance jsonb;
  v_result jsonb;
  v_manifest jsonb;
  v_parcel jsonb;
  v_count integer;
  v_date date;
  v_total numeric;
  v_tier text;
  v_provider text;
  v_fee numeric;
  v_branch text;
  v_pickup public.be_portal_pickup_requests;
begin
  if p_action = 'snapshot' then
    v_finance := private.be_merchant_payment_history_v200(v_code);
    return v_identity || jsonb_build_object(
      'pickups', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
        select p.pickup_id,p.pickup_date,p.pickup_time,p.parcel_count,p.pickup_address,
          coalesce(nullif(p.pickup_status,''),p.status) as status,p.created_at
        from public.be_portal_pickup_requests p where upper(p.merchant_code) = v_code
        order by p.created_at desc nulls last,p.pickup_id limit 100
      ) s),'[]'::jsonb),
      'shipments', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
        select w.delivery_way_id,w.waybill_no,w.pickup_id,w.recipient_name,w.township,w.cod_amount,w.status,
          w.dispatch_status,w.warehouse_status,w.rider_status,w.delivered_at,w.last_return_scanned_at,
          w.provider,w.provider_outcome,w.waybill_published,w.created_at,w.updated_at
        from private.be_merchant_shipments_v2 w where w.merchant_code = v_code
        order by w.created_at desc nulls last,w.delivery_way_id limit 150
      ) s),'[]'::jsonb),
      'tickets', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
        select ticket_id,subject,description,status,created_at
        from public.be_merchant_support_tickets where upper(merchant_code) = v_code
        order by created_at desc limit 100
      ) s),'[]'::jsonb),
      'wallet',v_finance->'wallet',
      'settlements',coalesce((select jsonb_agg(jsonb_build_object(
        'id',b->'id','batch_number',b->'batch_number','status',b->'status','batch_net_payable',b->'batch_net_payable',
        'paid_amount',b->'paid_amount','outstanding_amount',b->'outstanding_amount') order by ord)
        from jsonb_array_elements(v_finance->'batches') with ordinality b(b,ord)
        where upper(b->>'status') in ('APPROVED','PARTIALLY_PAID','PAID','PAYMENT_PENDING')),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(jsonb_build_object(
        'id',p->'id','confirmed_at',coalesce(p->'confirmed_at',p->'created_at'),
        'payment_reference',coalesce(p->'payment_group_reference',p->'payment_reference'),
        'payment_method',p->'payment_method','amount',p->'amount','evidence_url',p->'evidence_url') order by ord)
        from jsonb_array_elements(v_finance->'payments') with ordinality p(p,ord)
        where upper(p->>'status')='CONFIRMED'),'[]'::jsonb));
  end if;

  if p_action = 'track' then
    v_ref := upper(btrim(coalesce(v_arg->>'reference','')));
    if length(v_ref) not between 3 and 80 then
      raise exception 'Enter a valid Delivery Way ID or waybill number.' using errcode='22023';
    end if;
    select to_jsonb(w) - 'merchant_code'
    into v_way from private.be_merchant_shipments_v2 w where w.merchant_code=v_code
      and (upper(w.delivery_way_id)=v_ref or upper(w.waybill_no)=v_ref)
    order by (upper(w.delivery_way_id)=v_ref) desc nulls last,w.updated_at desc nulls last,w.delivery_way_id limit 1;

    if v_way is null then return jsonb_build_object('shipment',null,'events','[]'::jsonb); end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_rows
    from (select t.status_code,t.status_label,t.created_at
      from public.be_parcel_status_timeline t where t.delivery_way_id=v_way->>'delivery_way_id'
      order by t.created_at desc limit 100) e;
    select jsonb_build_object('provider',m.physically_recorded_provider,'handed_over_at',m.physically_handed_over_at,
      'delivered_at',m.delivered_at,'last_return_scanned_at',m.last_return_scanned_at)
    into v_result from public.be_v_harmonized_parcel_monitor_v1 m
    where m.delivery_way_id=v_way->>'delivery_way_id' limit 1;
    return jsonb_build_object('shipment',v_way||coalesce(jsonb_strip_nulls(v_result),'{}'::jsonb),'events',v_rows);
  end if;

  if p_action = 'pickup' then
    if coalesce(v_arg->>'parcel_count','') !~ '^[1-9][0-9]{0,2}$'
      or coalesce(v_arg->>'pickup_date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or length(btrim(coalesce(v_arg->>'pickup_address',''))) not between 5 and 500
      or length(btrim(coalesce(v_arg->>'township',''))) not between 2 and 100
      or length(btrim(coalesce(v_arg->>'contact_person',''))) not between 2 and 100
      or length(regexp_replace(coalesce(v_arg->>'phone',''),'[^0-9၀-၉]','','g')) not between 7 and 15 then
      raise exception 'Enter a contact, phone, pickup address, township, date and parcel count.' using errcode='22023';
    end if;
    v_date := (v_arg->>'pickup_date')::date;
    v_count := (v_arg->>'parcel_count')::integer;
    v_manifest := coalesce(v_arg->'shipments','[]'::jsonb);
    if v_count > 500 or jsonb_typeof(v_manifest) <> 'array' or
      jsonb_array_length(v_manifest) not in (0,v_count) or
      length(coalesce(v_arg->>'city','')) > 100 or length(coalesce(v_arg->>'special_instructions','')) > 500 or
      coalesce(v_arg->>'pickup_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$' then
      raise exception 'Check the pickup details and parcel count (maximum 500).' using errcode='22023';
    end if;
    v_total := 0;
    for v_parcel in select value from jsonb_array_elements(v_manifest) loop
      if jsonb_typeof(v_parcel) <> 'object' or
        length(btrim(coalesce(v_parcel->>'recipient_name',''))) not between 2 and 150 or
        length(regexp_replace(coalesce(v_parcel->>'recipient_phone',''),'[^0-9၀-၉]','','g')) not between 7 and 15 or
        length(btrim(coalesce(v_parcel->>'delivery_address',''))) not between 5 and 500 or
        length(btrim(coalesce(v_parcel->>'township',''))) not between 2 and 100 or
        coalesce(v_parcel->>'weight_kg','') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' or
        coalesce(v_parcel->>'cod_amount','') !~ '^[0-9]{1,9}$' then
        raise exception 'Check the recipient, address, township, weight and COD on every shipment.' using errcode='22023';
      end if;
      if (v_parcel->>'weight_kg')::numeric <= 0 then
        raise exception 'Shipment weight must be greater than zero.' using errcode='22023';
      end if;
      v_total := v_total+(v_parcel->>'cod_amount')::numeric;
    end loop;
    select coalesce(nullif(upper(btrim(a.branch_code)),''),'YGN') into v_branch
    from public.be_user_account_registry a where a.auth_user_id=auth.uid()
      and coalesce(a.active,true) and coalesce(a.is_active,true)
      and lower(coalesce(a.status,'active')) in ('active','enabled') limit 1;
    v_ref := 'P'||to_char(v_date,'MMDD')||'-'||v_code||'-'||lpad(v_count::text,3,'0');
    perform pg_advisory_xact_lock(hashtextextended('pickup-branch:'||v_ref,0));
    select * into v_pickup from public.be_portal_pickup_requests
      where created_by=auth.uid() and upper(merchant_code)=v_code
        and metadata->>'merchant_portal_request_token'=v_arg->>'request_token'
        and coalesce(v_arg->>'request_token','') <> ''
      limit 1;
    if found then
      return jsonb_build_object('pickup_id',v_pickup.pickup_id);
    end if;
    if v_date < (now() at time zone 'Asia/Yangon')::date or v_date > (now() at time zone 'Asia/Yangon')::date+90
      or coalesce(v_arg->>'request_token','') !~ '^[0-9a-f-]{36}$' then
      raise exception 'Choose a pickup date within the next 90 days.' using errcode='22023';
    end if;
    v_result := public.be_submit_pickup_request(jsonb_build_object(
      'pickup_id',v_ref,'merchant_code',v_code,'merchant_name',v_identity->>'merchant_name',
      'branch_code',v_branch,'pickup_date',v_date,'parcel_count',v_count,'payment_terms','COD',
      'pickup_address',btrim(v_arg->>'pickup_address'),'township',btrim(v_arg->>'township'),
      'city',btrim(v_arg->>'city'),'phone',btrim(v_arg->>'phone'),'contact_person',btrim(v_arg->>'contact_person'),
      'merchant_portal_request_token',v_arg->>'request_token'));
    if not coalesce((v_result->>'ok')::boolean,false) then
      raise exception '%',coalesce(v_result->>'message','Britium could not register the pickup.');
    end if;
    v_ref := v_result->>'pickup_id';
    update public.be_portal_pickup_requests set source_portal='merchant_portal',
      pickup_time=nullif(v_arg->>'pickup_time',''),special_instructions=nullif(btrim(v_arg->>'special_instructions'),''),
      cod_amount=v_total,sender_phone=btrim(v_arg->>'phone'),sender_name=v_identity->>'merchant_name'
    where pickup_id=v_ref and created_by=auth.uid() and upper(merchant_code)=v_code
    returning pickup_id into v_ref;
    if v_ref is null then raise exception 'Britium could not confirm the canonical pickup record.'; end if;
    if jsonb_array_length(v_manifest)>0 then
      insert into private.be_merchant_pickup_manifests (pickup_id,shipments)
      select v_ref,jsonb_agg(jsonb_build_object(
        'recipient_name',btrim(p->>'recipient_name'),'recipient_phone',btrim(p->>'recipient_phone'),
        'delivery_address',btrim(p->>'delivery_address'),'township',btrim(p->>'township'),
        'weight_kg',(p->>'weight_kg')::numeric,'cod_amount',(p->>'cod_amount')::bigint)
        order by ord) from jsonb_array_elements(v_manifest) with ordinality as x(p,ord);
    end if;
    return jsonb_build_object('pickup_id',v_ref);
  end if;

  if p_action = 'quote' then
    if length(btrim(coalesce(v_arg->>'township',''))) not between 2 and 100 or
        coalesce(v_arg->>'weight_kg','') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' then
      raise exception 'Choose a destination and enter a valid parcel weight.' using errcode='22023';
    end if;
    if (v_arg->>'weight_kg')::numeric <= 0 then
      raise exception 'Parcel weight must be greater than zero.' using errcode='22023';
    end if;
    v_ref := btrim(v_arg->>'township');
    v_result := public.be_data_entry_delivery_route_v19(v_ref,null);
    v_provider := v_result->>'provider_code';
    if v_provider is null or coalesce((v_result->>'station_required')::boolean,false) then
      return jsonb_build_object('available',false);
    end if;
    select upper(m.customer_tier) into v_tier
    from public.be_merchant_financial_profiles_v2 m
    where upper(btrim(m.merchant_id))=v_code and m.is_active
      and m.effective_from<=public.be_business_date() and (m.effective_to is null or m.effective_to>=public.be_business_date())
    order by m.effective_from desc limit 1;
    v_tier := coalesce(v_tier,'STANDARD');
    v_way := public.be_calculate_parcel_financial_v2(v_ref,v_tier,'EXACT_COLLECTION_AMOUNT',
      p_merchant_stated_total_amount=>1,p_actual_weight_kg=>(v_arg->>'weight_kg')::numeric);
    if coalesce(v_way->>'validation_status','ERROR') <> 'ERROR' then
      v_fee := (v_way->>'net_system_delivery_charge')::numeric;
    end if;
    if v_fee is null and v_provider in ('ROYAL EXPRESS','MDY BRANCH','NPT BRANCH','DK DELIVERY') then
      select case when v_tier='ROYAL' then coalesce(c.special_rate_mmk,c.standard_rate_mmk)
        else c.standard_rate_mmk end into v_fee
      from public.be_data_entry_tariff_catalog c where c.is_active and c.provider_code=v_provider
        and c.destination_key=v_result->>'destination_key';
    end if;
    return jsonb_build_object('available',v_fee is not null,'fee',v_fee,
      'provider',v_provider,'township',v_ref);
  end if;

  if p_action = 'support' then
    if length(btrim(coalesce(v_arg->>'subject',''))) not between 3 and 150 or
        length(btrim(coalesce(v_arg->>'description',''))) not between 5 and 2000 then
      raise exception 'Enter a subject and describe the request.' using errcode='22023';
    end if;
    insert into public.be_merchant_support_tickets
      (merchant_code,merchant_name,subject,description,priority,status,submitted_by_email,payload)
    values (v_code,v_identity->>'merchant_name',btrim(v_arg->>'subject'),btrim(v_arg->>'description'),
      'Medium','open',(select email from auth.users where id=auth.uid()),'{}'::jsonb);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown merchant action.' using errcode='22023';
end $$;

create or replace function private.be_merchant_manifest_impl(p_pickup_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  perform public.be_data_entry_require_access_v57('view',false);
  perform public.be_data_entry_manager_assert_pickup_v1(p_pickup_id,'read');
  return coalesce((select m.shipments from private.be_merchant_pickup_manifests m
    where m.pickup_id=p_pickup_id),'[]'::jsonb);
end $$;

revoke all on function private.be_merchant_portal_workflow_impl(text,jsonb), private.be_merchant_manifest_impl(text) from public,anon;
grant execute on function private.be_merchant_portal_workflow_impl(text,jsonb), private.be_merchant_manifest_impl(text) to authenticated;

create or replace function public.be_merchant_portal_workflow(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.be_merchant_portal_workflow_impl(p_action,p_payload)
$$;
create or replace function public.be_merchant_portal_manifest(p_pickup_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.be_merchant_manifest_impl(p_pickup_id)
$$;
revoke all on function public.be_merchant_portal_workflow(text,jsonb), public.be_merchant_portal_manifest(text) from public,anon;
grant execute on function public.be_merchant_portal_workflow(text,jsonb), public.be_merchant_portal_manifest(text) to authenticated;

create or replace function private.be_merchant_account_link_impl(p_user_id uuid,p_merchant_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_merchant_code,'')));
  v_name text;
  v_email text;
begin
  if auth.uid() is null or public.be_current_role() not in ('superadmin','super_admin','admin','app_owner','sys') then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if p_user_id is null then
    return coalesce((select jsonb_agg(to_jsonb(r) order by r.email) from (
      select a.auth_user_id,u.email,a.full_name
      from public.be_user_account_registry a join auth.users u on u.id=a.auth_user_id
      where lower(replace(a.role,'-','_')) in ('merchant','vip_customer')
        and coalesce(a.active,true) and coalesce(a.is_active,true)
        and lower(coalesce(a.status,'active')) in ('active','enabled')
        and not exists (select 1 from public.be_merchant_accounts m where m.auth_user_id=a.auth_user_id)
    ) r),'[]'::jsonb);
  end if;
  if v_code !~ '^[A-Z][A-Z0-9]{1,2}$' or v_code in ('BBB','BLK','GEN') then
    raise exception 'Enter an individual merchant master code.' using errcode='22023';
  end if;
  select m.merchant_name into v_name from public.be_master_merchants m
  where upper(m.merchant_code)=v_code and lower(m.status)='active' limit 1;
  if v_name is null then raise exception 'An active merchant with that code was not found.' using errcode='22023'; end if;
  select u.email into v_email
  from public.be_user_account_registry a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_user_id and coalesce(a.active,true) and coalesce(a.is_active,true)
    and lower(coalesce(a.status,'active')) in ('active','enabled')
    and lower(replace(a.role,'-','_')) in ('merchant','vip_customer')
  for update of a;
  if v_email is null then raise exception 'The selected login is no longer eligible.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('merchant-account:'||v_code,0));
  if exists(select 1 from public.be_merchant_accounts where auth_user_id=p_user_id or upper(merchant_code)=v_code) then
    raise exception 'This login or merchant already has a merchant account link.' using errcode='23505';
  end if;
  insert into public.be_merchant_accounts(auth_user_id,merchant_code,merchant_name,email,status)
    values(p_user_id,v_code,v_name,v_email,'ACTIVE');
  return jsonb_build_object('merchant_name',v_name,'merchant_code',v_code);
end $$;
revoke all on function private.be_merchant_account_link_impl(uuid,text) from public,anon;
grant execute on function private.be_merchant_account_link_impl(uuid,text) to authenticated;

create or replace function public.be_merchant_account_link(p_user_id uuid default null,p_merchant_code text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.be_merchant_account_link_impl(p_user_id,p_merchant_code)
$$;
revoke all on function public.be_merchant_account_link(uuid,text) from public,anon;
grant execute on function public.be_merchant_account_link(uuid,text) to authenticated;

create or replace function private.be_guard_merchant_pickup_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_identity jsonb;
begin
  if public.be_current_role() not in ('merchant','vip_customer') then return new; end if;
  v_identity := private.be_merchant_portal_identity_v2();
  if upper(new.merchant_code) is distinct from v_identity->>'merchant_code'
    or new.created_by is distinct from auth.uid() then
    raise exception 'Use your own merchant account to submit pickups.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.be_guard_merchant_pickup_actor() from public,anon,authenticated;
create trigger be_guard_merchant_pickup_actor
before insert on public.be_portal_pickup_requests
for each row execute function private.be_guard_merchant_pickup_actor();

-- The current application uses merchant-scoped RPCs. Keep legacy helpers callable only
-- by their server-side wrappers to prevent caller-selected merchant codes and tracking IDs.
revoke execute on function public.be_merchant_snapshot(text,text,integer),
  public.be_merchant_create_pickup_request(jsonb,text), public.be_merchant_create_support_ticket(jsonb,text),
  public.be_merchant_submit_data_batch(jsonb,text,text), public.be_customer_tracking_snapshot(jsonb),
  public.be_merchant_workspace_snapshot(text,text,integer), public.be_merchant_period_report(date,date,text),
  public.be_merchant_reply_support_ticket(uuid,text)
  from public,anon,authenticated;
