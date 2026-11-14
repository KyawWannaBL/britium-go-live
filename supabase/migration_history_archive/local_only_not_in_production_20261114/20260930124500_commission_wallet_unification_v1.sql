begin;

-- Britium Express commission policy effective 2026-09-30.
update public.be_commission_rate_master
set active=false,
    effective_to=least(coalesce(effective_to,date '2026-09-29'),date '2026-09-29'),
    updated_at=now()
where active
  and effective_from < date '2026-09-30'
  and operation_type in ('DELIVERY','PICKUP','HIGHWAY_DROPOFF','MERCHANT_REFERRAL')
  and role_code in ('RIDER','DRIVER','HELPER','MERCHANT_REFERRER');

insert into public.be_commission_rate_master(
  operation_type,role_code,unit_type,rate_mmk,active,effective_from,effective_to,notes,created_at,updated_at
)
select *
from (values
  ('DELIVERY','RIDER','PARCEL',300::numeric,true,date '2026-09-30',null::date,'Delivery/drop-off: rider 300 MMK per successful way',now(),now()),
  ('DELIVERY','DRIVER','PARCEL',150::numeric,true,date '2026-09-30',null::date,'Delivery/drop-off: driver 150 MMK per successful way',now(),now()),
  ('DELIVERY','HELPER','PARCEL',150::numeric,true,date '2026-09-30',null::date,'Delivery/drop-off: helper 150 MMK per successful way',now(),now()),
  ('PICKUP','RIDER','PARCEL',150::numeric,true,date '2026-09-30',null::date,'Pickup: rider 150 MMK per parcel; 7,000 MMK cap per pickup point/merchant/OS',now(),now()),
  ('PICKUP','DRIVER','PARCEL',75::numeric,true,date '2026-09-30',null::date,'Pickup: driver 75 MMK per parcel; 7,000 MMK cap per pickup point/merchant/OS',now(),now()),
  ('PICKUP','HELPER','PARCEL',75::numeric,true,date '2026-09-30',null::date,'Pickup: helper 75 MMK per parcel; 7,000 MMK cap per pickup point/merchant/OS',now(),now()),
  ('MARKETING_SUPPORT','MARKETING_SUPPORT','PARCEL',100::numeric,true,date '2026-09-30',null::date,'Marketing-origin business support: 100 MMK per successfully delivered parcel, monthly accrual while employee and business remain active',now(),now())
) v(operation_type,role_code,unit_type,rate_mmk,active,effective_from,effective_to,notes,created_at,updated_at)
where not exists(
  select 1
  from public.be_commission_rate_master r
  where r.operation_type=v.operation_type
    and r.role_code=v.role_code
    and r.unit_type=v.unit_type
    and r.effective_from=v.effective_from
);

update public.be_workforce_commission_rates
set amount_per_dropoff_mmk=case upper(role_type)
      when 'RIDER' then 300
      when 'DRIVER' then 150
      when 'HELPER' then 150
      else amount_per_dropoff_mmk end,
    notes=case upper(role_type)
      when 'RIDER' then 'Rider commission per successful delivery/drop-off way'
      when 'DRIVER' then 'Driver commission per successful delivery/drop-off way'
      when 'HELPER' then 'Helper commission per successful delivery/drop-off way'
      else notes end,
    updated_at=now()
where upper(role_type) in ('RIDER','DRIVER','HELPER');

update public.be_commission_rules set is_active=false,updated_at=now() where is_active;

create or replace function public.be_commission_calculate_v2(
  p_operation_type text,
  p_role_code text,
  p_unit_count numeric,
  p_work_date date default current_date
)
returns jsonb
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_op text:=upper(btrim(coalesce(p_operation_type,'')));
  v_role text:=upper(btrim(coalesce(p_role_code,'')));
  v_units numeric:=greatest(coalesce(p_unit_count,0),0);
  v_rate numeric;
  v_raw numeric;
  v_amount numeric;
  v_cap numeric:=null;
begin
  v_rate:=public.be_commission_get_rate(v_op,v_role,'PARCEL',coalesce(p_work_date,current_date));
  v_raw:=v_rate*v_units;
  if v_op='PICKUP' and v_role in ('RIDER','DRIVER','HELPER') then
    v_cap:=7000;
    v_amount:=least(v_raw,v_cap);
  else
    v_amount:=v_raw;
  end if;
  return jsonb_build_object(
    'operation_type',v_op,'role_code',v_role,'unit_count',v_units,
    'rate_mmk',v_rate,'raw_amount_mmk',v_raw,'cap_mmk',v_cap,
    'commission_mmk',v_amount,'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

create or replace function public.be_is_employee_employed_on(
  p_employee_email text,
  p_work_date date default current_date
)
returns boolean
language sql
stable
set search_path=public,pg_temp
as $$
  with explicit as (
    select
      exists(
        select 1 from public.be_employee_commission_eligibility e
        where lower(e.employee_email)=lower(trim(coalesce(p_employee_email,'')))
      ) as has_row,
      exists(
        select 1 from public.be_employee_commission_eligibility e
        where lower(e.employee_email)=lower(trim(coalesce(p_employee_email,'')))
          and e.employed_from<=coalesce(p_work_date,current_date)
          and (e.employed_to is null or e.employed_to>=coalesce(p_work_date,current_date))
          and upper(coalesce(e.employment_status,'ACTIVE')) not in ('INELIGIBLE','RESIGNED','TERMINATED','INACTIVE')
      ) as eligible
  )
  select case
    when explicit.has_row then explicit.eligible
    else exists(
      select 1 from public.be_employee_master m
      where lower(coalesce(m.email,''))=lower(trim(coalesce(p_employee_email,'')))
        and coalesce(m.is_active,true)
        and upper(coalesce(m.status,'ACTIVE')) not in ('INACTIVE','RESIGNED','TERMINATED')
    )
  end
  from explicit;
$$;

create unique index if not exists be_commission_events_source_role_uq
on public.be_commission_events(source_type,source_key,role_code,operation_type);

create or replace function public.be_refresh_marketing_support_commission_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_rows integer:=0;
begin
  delete from public.be_commission_events
  where operation_type='MARKETING_SUPPORT'
    and work_date between v_start and v_end
    and event_status in ('PENDING','READY');

  with delivered as (
    select distinct
      d.delivery_way_id,
      coalesce(d.saved_at,d.created_at)::date as work_date,
      d.merchant_id,
      coalesce(p.merchant_name,d.merchant_id) as merchant_name
    from public.be_data_entry_parcel_details d
    left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
    where coalesce(d.saved_at,d.created_at)::date between v_start and v_end
      and exists(
        select 1 from public.be_wayplan_dispatch_stops s
        where upper(s.delivery_way_id)=upper(d.delivery_way_id)
          and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
      )
      and nullif(d.merchant_id,'') is not null
  ), eligible as (
    select x.*,r.assignment_id,r.referrer_employee_id,r.referrer_email,r.referrer_name
    from delivered x
    join lateral public.be_merchant_referrer_for_date(x.merchant_id,x.work_date) r on true
  ), grouped as (
    select
      referrer_employee_id,referrer_email,referrer_name,
      merchant_id,max(merchant_name) merchant_name,
      count(distinct delivery_way_id)::numeric unit_count,
      min(assignment_id::text)::uuid assignment_id
    from eligible
    group by referrer_employee_id,referrer_email,referrer_name,merchant_id
  )
  insert into public.be_commission_events(
    source_type,source_key,work_date,operation_type,unit_type,unit_count,
    role_code,assignee_email,assignee_name,merchant_id,merchant_name,referral_assignment_id,
    rate_mmk,commission_mmk,event_status,metadata
  )
  select
    'AUTO_MONTHLY',
    'MARKETING|'||to_char(v_start,'YYYY-MM')||'|'||merchant_id||'|'||coalesce(referrer_employee_id,referrer_email),
    v_end,'MARKETING_SUPPORT','PARCEL',unit_count,
    'MARKETING_SUPPORT',referrer_email,referrer_name,merchant_id,merchant_name,assignment_id,
    100,unit_count*100,'READY',
    jsonb_build_object(
      'month',to_char(v_start,'YYYY-MM'),
      'policy_version','COMMISSION_2026_09_30',
      'eligibility','EMPLOYED_AND_SUPPORTED_MERCHANT_ACTIVE',
      'monthly_parcels',unit_count
    )
  from grouped
  where public.be_is_employee_employed_on(referrer_email,v_end)
  on conflict(source_type,source_key,role_code,operation_type) do update
  set unit_count=excluded.unit_count,
      rate_mmk=excluded.rate_mmk,
      commission_mmk=excluded.commission_mmk,
      assignee_name=excluded.assignee_name,
      merchant_name=excluded.merchant_name,
      referral_assignment_id=excluded.referral_assignment_id,
      metadata=excluded.metadata,
      updated_at=now();

  get diagnostics v_rows=row_count;
  return jsonb_build_object(
    'ok',true,'month',to_char(v_start,'YYYY-MM'),'rows',v_rows,
    'rate_mmk_per_parcel',100,'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

create table if not exists public.be_party_wallet_accounts(
  id uuid primary key default gen_random_uuid(),
  party_type text not null,
  party_key text not null,
  party_name text,
  currency text not null default 'MMK',
  status text not null default 'ACTIVE',
  britium_owes numeric not null default 0,
  owes_britium numeric not null default 0,
  net_position numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(party_type,party_key)
);

create table if not exists public.be_party_wallet_ledger(
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.be_party_wallet_accounts(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  transaction_date date not null default current_date,
  direction text not null check(direction in ('BRITIUM_OWES_PARTY','PARTY_OWES_BRITIUM')),
  amount numeric not null check(amount>=0),
  status text not null default 'PENDING',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(wallet_id,source_type,source_key,direction)
);

create or replace function public.be_refresh_party_wallets_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select distinct
    case when role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else role_code end,
    lower(assignee_email),
    max(assignee_name) over(partition by role_code,lower(assignee_email)),
    jsonb_build_object('source','be_commission_events'),now()
  from public.be_commission_events
  where nullif(assignee_email,'') is not null
    and role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
  on conflict(party_type,party_key) do update set party_name=excluded.party_name,updated_at=now();

  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select 'MERCHANT',coalesce(nullif(merchant_code,''),id::text),
         coalesce(nullif(merchant_name,''),nullif(name,''),nullif(business_name,''),merchant_code),
         jsonb_build_object('source','merchants'),now()
  from public.merchants
  where coalesce(is_active,true)
  on conflict(party_type,party_key) do update set party_name=excluded.party_name,updated_at=now();

  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select case
      when provider_code='DK DELIVERY' then 'DK'
      when provider_code='ROYAL EXPRESS' then 'ROYAL'
      when provider_code='NPT BRANCH' then 'NPT'
      when provider_type='OUTSOURCE' then 'ALLIED_COMPANY'
      else 'SERVICE_PROVIDER'
    end,
    provider_code,display_name,
    jsonb_build_object('provider_type',provider_type,'source','be_data_entry_service_providers'),now()
  from public.be_data_entry_service_providers
  where is_active
  on conflict(party_type,party_key) do update set party_name=excluded.party_name,metadata=excluded.metadata,updated_at=now();

  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'COMMISSION',e.id::text,e.work_date,'BRITIUM_OWES_PARTY',e.commission_mmk,
    case when upper(coalesce(e.event_status,'')) in ('PAID','SETTLED') then 'SETTLED' else 'PENDING' end,
    e.operation_type||' commission',
    jsonb_build_object(
      'role_code',e.role_code,'operation_type',e.operation_type,'unit_count',e.unit_count,
      'rate_mmk',e.rate_mmk,'tracking_no',e.tracking_no,'pickup_id',e.pickup_id,
      'merchant_id',e.merchant_id,'policy_version','COMMISSION_2026_09_30'
    ),now()
  from public.be_commission_events e
  join public.be_party_wallet_accounts w
    on w.party_type=(case when e.role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else e.role_code end)
   and w.party_key=lower(e.assignee_email)
  where e.role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
    and e.commission_mmk>=0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'MERCHANT_SETTLEMENT',q.parcel_id::text,q.created_at::date,
    case when coalesce(q.merchant_final_settlement_amount,0)>=0 then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
    abs(coalesce(q.merchant_final_settlement_amount,0)),
    case when q.financial_settled_at is not null then 'SETTLED' else upper(coalesce(q.settlement_state,'PENDING')) end,
    'Merchant parcel settlement '||q.delivery_way_id,to_jsonb(q),now()
  from public.be_v_finance_merchant_settlement_queue_v2 q
  join public.be_party_wallet_accounts w on w.party_type='MERCHANT' and w.party_key=q.merchant_id
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'SERVICE_PROVIDER_PAYABLE',d.delivery_way_id,
    coalesce(d.saved_at,d.created_at)::date,'BRITIUM_OWES_PARTY',
    greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    ),
    'PENDING','Provider payable for '||d.delivery_way_id,
    jsonb_build_object(
      'service_provider_code',d.financial_quote->>'service_provider_code',
      'calculation_version',d.financial_quote->>'calculation_version',
      'financial_quote',d.financial_quote
    ),now()
  from public.be_data_entry_parcel_details d
  join public.be_party_wallet_accounts w
    on w.party_key=(d.financial_quote->>'service_provider_code')
   and w.party_type in ('DK','ROYAL','NPT','ALLIED_COMPANY','SERVICE_PROVIDER')
  where nullif(d.financial_quote->>'service_provider_code','') is not null
    and (d.financial_quote->>'service_provider_code')<>'BRITIUM'
    and greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    )>0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  update public.be_party_wallet_accounts a
  set britium_owes=coalesce(x.britium_owes,0),
      owes_britium=coalesce(x.owes_britium,0),
      net_position=coalesce(x.britium_owes,0)-coalesce(x.owes_britium,0),
      updated_at=now()
  from (
    select wallet_id,
      sum(amount) filter(where direction='BRITIUM_OWES_PARTY' and upper(status)<>'SETTLED') britium_owes,
      sum(amount) filter(where direction='PARTY_OWES_BRITIUM' and upper(status)<>'SETTLED') owes_britium
    from public.be_party_wallet_ledger
    group by wallet_id
  ) x
  where x.wallet_id=a.id;

  update public.be_party_wallet_accounts a
  set britium_owes=0,owes_britium=0,net_position=0,updated_at=now()
  where not exists(select 1 from public.be_party_wallet_ledger l where l.wallet_id=a.id);

  return jsonb_build_object(
    'ok',true,
    'accounts_refreshed',(select count(*) from public.be_party_wallet_accounts),
    'ledger_rows',(select count(*) from public.be_party_wallet_ledger),
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

create or replace function public.be_finance_party_wallet_center_v1(
  p_party_type text default null,
  p_search text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.be_accounting_can_v1('financial_reports') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  return jsonb_build_object(
    'ok',true,
    'summary',(
      select jsonb_build_object(
        'wallet_count',count(*),
        'britium_owes',coalesce(sum(britium_owes),0),
        'owes_britium',coalesce(sum(owes_britium),0),
        'net_position',coalesce(sum(net_position),0)
      )
      from public.be_party_wallet_accounts
      where nullif(btrim(coalesce(p_party_type,'')),'') is null or party_type=upper(p_party_type)
    ),
    'rows',coalesce((
      select jsonb_agg(to_jsonb(q) order by abs(q.net_position) desc,q.party_name)
      from (
        select *
        from public.be_party_wallet_accounts
        where (nullif(btrim(coalesce(p_party_type,'')),'') is null or party_type=upper(p_party_type))
          and (
            nullif(btrim(coalesce(p_search,'')),'') is null
            or party_key ilike '%'||p_search||'%'
            or coalesce(party_name,'') ilike '%'||p_search||'%'
          )
        order by abs(net_position) desc,party_name
        limit greatest(1,least(coalesce(p_limit,1000),5000))
      ) q
    ),'[]'::jsonb),
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

create or replace function public.be_marketing_support_assignment_upsert_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_merchant_id text:=nullif(btrim(coalesce(p_payload->>'merchant_id',p_payload->>'merchant_code','')),'');
  v_employee_email text:=lower(nullif(btrim(coalesce(p_payload->>'employee_email','')),''));
  v_effective_from date:=coalesce(nullif(p_payload->>'effective_from','')::date,current_date);
  v_merchant record;
  v_emp record;
  v_id uuid;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('financial_reports')
    or exists(
      select 1 from public.be_user_account_registry u
      where u.auth_user_id=auth.uid()
        and upper(coalesce(u.role,'')) in ('MARKETING','MARKETER','SUPER_ADMIN','MANAGER')
    )
  ) then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;

  select * into v_merchant
  from public.merchants m
  where upper(coalesce(m.merchant_code,''))=upper(v_merchant_id)
  order by m.updated_at desc nulls last limit 1;

  if not found or not coalesce(v_merchant.is_active,true) then
    return jsonb_build_object('ok',false,'code','ACTIVE_MERCHANT_NOT_FOUND');
  end if;

  select * into v_emp
  from public.be_employee_master e
  where lower(coalesce(e.email,''))=v_employee_email
    and coalesce(e.is_active,true)
    and upper(coalesce(e.status,'ACTIVE')) not in ('INACTIVE','RESIGNED','TERMINATED')
  order by e.updated_at desc nulls last limit 1;

  if not found then return jsonb_build_object('ok',false,'code','ACTIVE_EMPLOYEE_NOT_FOUND'); end if;

  update public.be_merchant_referral_assignments
  set effective_to=v_effective_from-1,active=true,updated_at=now()
  where merchant_id=coalesce(nullif(v_merchant.merchant_code,''),v_merchant.id::text)
    and active and effective_from<=v_effective_from
    and (effective_to is null or effective_to>=v_effective_from)
    and lower(coalesce(referrer_email,''))<>v_employee_email;

  insert into public.be_merchant_referral_assignments(
    merchant_id,merchant_code,merchant_name,
    referrer_employee_id,referrer_email,referrer_name,
    effective_from,effective_to,active,created_by,notes,created_at,updated_at
  ) values (
    coalesce(nullif(v_merchant.merchant_code,''),v_merchant.id::text),
    v_merchant.merchant_code,
    coalesce(nullif(v_merchant.merchant_name,''),nullif(v_merchant.name,''),nullif(v_merchant.business_name,''),v_merchant.merchant_code),
    coalesce(nullif(v_emp.employee_id,''),nullif(v_emp.employee_code,''),v_emp.id::text),
    lower(v_emp.email),
    coalesce(nullif(v_emp.employee_name,''),nullif(v_emp.full_name,''),nullif(v_emp.name,''),v_emp.email),
    v_effective_from,null,true,coalesce(auth.jwt()->>'email','system'),
    'Marketing support commission assignment: 100 MMK per successfully delivered parcel per month while both employee and merchant remain active.',
    now(),now()
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,'assignment_id',v_id,
    'merchant_code',v_merchant.merchant_code,
    'employee_email',lower(v_emp.email),
    'rate_mmk_per_delivered_parcel',100,
    'accrual','MONTHLY','policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

create or replace function public.be_marketing_support_assignment_snapshot_v1(
  p_search text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  return jsonb_build_object(
    'ok',true,
    'rows',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.active desc,q.merchant_name,q.referrer_name)
      from (
        select a.*,
          public.be_is_employee_employed_on(a.referrer_email,current_date) employee_eligible,
          exists(
            select 1 from public.merchants m
            where upper(coalesce(m.merchant_code,''))=upper(coalesce(a.merchant_code,a.merchant_id))
              and coalesce(m.is_active,true)
          ) merchant_eligible,
          100::numeric rate_mmk_per_parcel
        from public.be_merchant_referral_assignments a
        where nullif(btrim(coalesce(p_search,'')),'') is null
           or coalesce(a.merchant_code,'') ilike '%'||p_search||'%'
           or coalesce(a.merchant_name,'') ilike '%'||p_search||'%'
           or coalesce(a.referrer_name,'') ilike '%'||p_search||'%'
           or coalesce(a.referrer_email,'') ilike '%'||p_search||'%'
        order by a.active desc,a.merchant_name,a.referrer_name
        limit greatest(1,least(coalesce(p_limit,1000),5000))
      ) q
    ),'[]'::jsonb),
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

revoke all on function public.be_refresh_party_wallets_v1() from public,anon;
grant execute on function public.be_refresh_party_wallets_v1() to authenticated,service_role;
revoke all on function public.be_refresh_marketing_support_commission_month(date) from public,anon;
grant execute on function public.be_refresh_marketing_support_commission_month(date) to authenticated,service_role;
revoke all on function public.be_marketing_support_assignment_upsert_v1(jsonb) from public,anon;
grant execute on function public.be_marketing_support_assignment_upsert_v1(jsonb) to authenticated,service_role;
revoke all on function public.be_marketing_support_assignment_snapshot_v1(text,integer) from public,anon;
grant execute on function public.be_marketing_support_assignment_snapshot_v1(text,integer) to authenticated,service_role;

insert into public.be_system_config(config_key,config_value,description,updated_at)
values(
  'commission_policy_20260930',
  '{"delivery":{"rider_per_way":300,"driver_per_way":150,"helper_per_way":150},"pickup":{"rider_per_parcel":150,"driver_per_parcel":75,"helper_per_parcel":75,"cap_per_point_merchant_os":7000},"marketing_support":{"per_delivered_parcel":100,"accrual":"MONTHLY","eligibility":"EMPLOYEE_ACTIVE_AND_SUPPORTED_BUSINESS_ACTIVE"},"wallet_parties":["RIDER","DRIVER","HELPER","MARKETING_EMPLOYEE","MERCHANT","DK","ROYAL","NPT","ALLIED_COMPANY","SERVICE_PROVIDER"]}',
  'Commission and unified settlement wallet policy effective 2026-09-30',
  now()
)
on conflict(config_key) do update
set config_value=excluded.config_value,description=excluded.description,updated_at=excluded.updated_at;

commit;
