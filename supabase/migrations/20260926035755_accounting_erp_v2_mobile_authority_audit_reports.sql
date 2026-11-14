
-- Britium Express Accounting ERP V2: mobile payment channels, authority levels,
-- maker-checker controls, tamper-evident audit chain, and periodic reports.

alter table public.finance_daily_logs
  add column if not exists payment_method text,
  add column if not exists payment_mobile_number text,
  add column if not exists payment_reference text;

create table if not exists public.be_finance_payment_channels_v2 (
  id uuid primary key default gen_random_uuid(),
  method_code text not null,
  display_name text not null,
  mobile_number text,
  account_code text not null,
  is_mobile boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(method_code, mobile_number)
);

alter table public.be_finance_payment_channels_v2 enable row level security;

drop policy if exists be_finance_payment_channels_select_v2 on public.be_finance_payment_channels_v2;
create policy be_finance_payment_channels_select_v2
on public.be_finance_payment_channels_v2 for select
to authenticated
using (
  public.be_accounting_can_v1('finance_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

revoke all on public.be_finance_payment_channels_v2 from anon, authenticated;
grant select on public.be_finance_payment_channels_v2 to authenticated;
grant all on public.be_finance_payment_channels_v2 to service_role;

insert into public.be_chart_of_accounts(
  account_code,account_name,account_type,normal_balance,parent_account_id,report_group,is_postable,is_active,metadata
)
select '1110','MMQR Wallet - 09897447722','ASSET','DEBIT',p.id,'CASH_AND_EQUIVALENTS',true,true,
       '{"payment_method":"MMQR","mobile_number":"09897447722"}'::jsonb
from public.be_chart_of_accounts p where p.account_code='1100'
on conflict (account_code) do update
set account_name=excluded.account_name,is_active=true,is_postable=true,metadata=excluded.metadata,updated_at=now();

insert into public.be_chart_of_accounts(
  account_code,account_name,account_type,normal_balance,parent_account_id,report_group,is_postable,is_active,metadata
)
select '1120','KBZ Pay Wallet - 09897447722','ASSET','DEBIT',p.id,'CASH_AND_EQUIVALENTS',true,true,
       '{"payment_method":"KBZ_PAY","mobile_number":"09897447722"}'::jsonb
from public.be_chart_of_accounts p where p.account_code='1100'
on conflict (account_code) do update
set account_name=excluded.account_name,is_active=true,is_postable=true,metadata=excluded.metadata,updated_at=now();

insert into public.be_chart_of_accounts(
  account_code,account_name,account_type,normal_balance,parent_account_id,report_group,is_postable,is_active,metadata
)
select '1121','KBZ Pay Wallet - 09897447733','ASSET','DEBIT',p.id,'CASH_AND_EQUIVALENTS',true,true,
       '{"payment_method":"KBZ_PAY","mobile_number":"09897447733"}'::jsonb
from public.be_chart_of_accounts p where p.account_code='1100'
on conflict (account_code) do update
set account_name=excluded.account_name,is_active=true,is_postable=true,metadata=excluded.metadata,updated_at=now();

insert into public.be_finance_payment_channels_v2(method_code,display_name,mobile_number,account_code,is_mobile,sort_order)
values
 ('CASH','Cash on Hand',null,'1000',false,10),
 ('PETTY_CASH','Petty Cash',null,'1010',false,20),
 ('BANK','Bank Accounts',null,'1100',false,30),
 ('MMQR','MMQR','09897447722','1110',true,40),
 ('KBZ_PAY','KBZ Pay','09897447722','1120',true,50),
 ('KBZ_PAY','KBZ Pay','09897447733','1121',true,60)
on conflict (method_code,mobile_number) do update
set display_name=excluded.display_name,account_code=excluded.account_code,is_mobile=excluded.is_mobile,
    is_active=true,sort_order=excluded.sort_order,updated_at=now();

create table if not exists public.be_accounting_user_authority_v2 (
  auth_user_id uuid primary key,
  authority_level integer not null default 20 check (authority_level between 0 and 100),
  can_entry boolean not null default true,
  can_review boolean not null default false,
  can_post boolean not null default false,
  can_reports boolean not null default true,
  can_audit boolean not null default false,
  can_admin boolean not null default false,
  is_active boolean not null default true,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note text
);

alter table public.be_accounting_user_authority_v2 enable row level security;

drop policy if exists be_accounting_user_authority_own_select_v2 on public.be_accounting_user_authority_v2;
create policy be_accounting_user_authority_own_select_v2
on public.be_accounting_user_authority_v2 for select
to authenticated
using (
  auth_user_id=(select auth.uid())
  or public.be_accounting_current_role_v1() in ('superadmin','super_admin','app_owner','sys','database_admin','service_role')
);

revoke all on public.be_accounting_user_authority_v2 from anon, authenticated;
grant select on public.be_accounting_user_authority_v2 to authenticated;
grant all on public.be_accounting_user_authority_v2 to service_role;

create table if not exists public.be_accounting_audit_chain_v2 (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  authority_level integer,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  session_id text,
  source_ip text,
  user_agent text,
  risk_level text not null default 'NORMAL',
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  previous_hash text,
  record_hash text not null unique
);

alter table public.be_accounting_audit_chain_v2 enable row level security;

revoke all on public.be_accounting_audit_chain_v2 from public,anon,authenticated;
grant select on public.be_accounting_audit_chain_v2 to authenticated;
grant all on public.be_accounting_audit_chain_v2 to service_role;

create or replace function public.be_accounting_current_authority_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.be_accounting_current_role_v1();
  v_row public.be_accounting_user_authority_v2%rowtype;
begin
  if v_role in ('service_role','database_admin','superadmin','super_admin','app_owner','sys') then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',100,
      'can_entry',true,'can_review',true,'can_post',true,
      'can_reports',true,'can_audit',true,'can_admin',true
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok',false,'role',v_role,'authority_level',0,
      'can_entry',false,'can_review',false,'can_post',false,
      'can_reports',false,'can_audit',false,'can_admin',false
    );
  end if;

  select * into v_row
  from public.be_accounting_user_authority_v2
  where auth_user_id=v_uid and is_active
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',v_row.authority_level,
      'can_entry',v_row.can_entry,'can_review',v_row.can_review,'can_post',v_row.can_post,
      'can_reports',v_row.can_reports,'can_audit',v_row.can_audit,'can_admin',v_row.can_admin
    );
  end if;

  if v_role in ('finance','finance_user','accountant','finance_admin','finance_manager','finm','bil','ar') then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',40,
      'can_entry',true,'can_review',true,'can_post',false,
      'can_reports',true,'can_audit',false,'can_admin',false
    );
  end if;

  return jsonb_build_object(
    'ok',false,'role',v_role,'authority_level',0,
    'can_entry',false,'can_review',false,'can_post',false,
    'can_reports',false,'can_audit',false,'can_admin',false
  );
end;
$$;

create or replace function public.be_accounting_can_v1(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_auth jsonb := public.be_accounting_current_authority_v2();
  v_cap text := lower(btrim(coalesce(p_capability,'')));
  v_role text := coalesce(v_auth->>'role','');
begin
  if v_role in ('service_role','database_admin','superadmin','super_admin','app_owner','sys') then
    return true;
  end if;
  return case v_cap
    when 'finance_entry' then coalesce((v_auth->>'can_entry')::boolean,false)
    when 'finance_review' then coalesce((v_auth->>'can_review')::boolean,false)
    when 'journal_post' then coalesce((v_auth->>'can_post')::boolean,false)
    when 'financial_reports' then coalesce((v_auth->>'can_reports')::boolean,false)
    when 'audit_view' then coalesce((v_auth->>'can_audit')::boolean,false)
    when 'period_close' then coalesce((v_auth->>'can_admin')::boolean,false)
    when 'ledger_admin' then coalesce((v_auth->>'can_admin')::boolean,false)
    when 'asset_entry' then v_role in ('admin','hr','admin_hr_user','administrator')
    else false
  end;
end;
$$;

create or replace function public.be_accounting_my_authority_v2()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select public.be_accounting_current_authority_v2();
$$;

create or replace function public.be_accounting_set_user_authority_v2(
  p_auth_user_id uuid,
  p_authority_level integer,
  p_can_entry boolean,
  p_can_review boolean,
  p_can_post boolean,
  p_can_reports boolean,
  p_can_audit boolean,
  p_can_admin boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if p_auth_user_id is null or p_authority_level not between 0 and 100 then
    return jsonb_build_object('ok',false,'code','INVALID_AUTHORITY');
  end if;

  insert into public.be_accounting_user_authority_v2(
    auth_user_id,authority_level,can_entry,can_review,can_post,can_reports,can_audit,can_admin,
    is_active,granted_by,granted_at,updated_at,note
  ) values (
    p_auth_user_id,p_authority_level,coalesce(p_can_entry,false),coalesce(p_can_review,false),
    coalesce(p_can_post,false),coalesce(p_can_reports,false),coalesce(p_can_audit,false),
    coalesce(p_can_admin,false),true,auth.uid(),now(),now(),p_note
  )
  on conflict (auth_user_id) do update
  set authority_level=excluded.authority_level,can_entry=excluded.can_entry,can_review=excluded.can_review,
      can_post=excluded.can_post,can_reports=excluded.can_reports,can_audit=excluded.can_audit,
      can_admin=excluded.can_admin,is_active=true,granted_by=auth.uid(),updated_at=now(),note=excluded.note;

  return jsonb_build_object('ok',true,'code','AUTHORITY_UPDATED','auth_user_id',p_auth_user_id);
end;
$$;

-- Initial Finance authority assignment: standard staff can enter and peer-review but cannot post;
-- clearly identified Finance manager accounts can perform controlled posting and audit.
insert into public.be_accounting_user_authority_v2(
  auth_user_id,authority_level,can_entry,can_review,can_post,can_reports,can_audit,can_admin,is_active,note
)
select r.auth_user_id,
       case
         when lower(r.email) in ('finance_mgr@britiumexpress.com','financemanager@britiumexpress.com') then 80
         when lower(r.email)='cashier_1@britiumexpress.com' then 30
         else 40
       end,
       true,
       case when lower(r.email)='cashier_1@britiumexpress.com' then false else true end,
       case when lower(r.email) in ('finance_mgr@britiumexpress.com','financemanager@britiumexpress.com') then true else false end,
       true,
       case when lower(r.email) in ('finance_mgr@britiumexpress.com','financemanager@britiumexpress.com') then true else false end,
       case when lower(r.email) in ('finance_mgr@britiumexpress.com','financemanager@britiumexpress.com') then true else false end,
       true,
       'Initial Accounting ERP V2 authority assignment'
from public.be_user_account_registry r
where coalesce(r.active,r.is_active,true)
  and lower(replace(coalesce(r.role_code,r.app_role,r.user_role,r.role,''),'-','_'))
      in ('finance','finance_user','accountant','finance_admin','finance_manager','finm','bil','ar')
on conflict (auth_user_id) do nothing;

create or replace function public.be_accounting_append_audit_v2(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_risk_level text default 'NORMAL',
  p_request_id text default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_prev text;
  v_hash text;
  v_role text := public.be_accounting_current_role_v1();
  v_auth jsonb := public.be_accounting_current_authority_v2();
  v_session text := coalesce(auth.jwt()->>'session_id','');
  v_payload text;
begin
  perform pg_advisory_xact_lock(hashtext('be_accounting_audit_chain_v2'));
  select record_hash into v_prev
  from public.be_accounting_audit_chain_v2
  order by seq desc
  limit 1;

  v_payload := concat_ws('|',
    coalesce(v_prev,'GENESIS'),v_id::text,clock_timestamp()::text,coalesce(auth.uid()::text,''),
    coalesce(v_role,''),coalesce(v_auth->>'authority_level','0'),upper(coalesce(p_action,'ACCOUNTING')),
    coalesce(p_entity_type,'ACCOUNTING'),coalesce(p_entity_id,''),coalesce(p_request_id,''),
    coalesce(v_session,''),upper(coalesce(p_risk_level,'NORMAL')),
    coalesce(p_old_data,'null'::jsonb)::text,coalesce(p_new_data,'null'::jsonb)::text,
    coalesce(p_metadata,'{}'::jsonb)::text
  );
  v_hash := encode(digest(v_payload,'sha256'),'hex');

  insert into public.be_accounting_audit_chain_v2(
    id,actor_id,actor_role,authority_level,action,entity_type,entity_id,request_id,session_id,
    user_agent,risk_level,old_data,new_data,metadata,previous_hash,record_hash
  ) values (
    v_id,auth.uid(),v_role,coalesce((v_auth->>'authority_level')::integer,0),
    upper(coalesce(p_action,'ACCOUNTING')),coalesce(nullif(p_entity_type,''),'ACCOUNTING'),
    p_entity_id,p_request_id,v_session,p_user_agent,upper(coalesce(p_risk_level,'NORMAL')),
    p_old_data,p_new_data,coalesce(p_metadata,'{}'::jsonb),v_prev,v_hash
  );
  return v_id;
end;
$$;

create or replace function public.be_accounting_block_audit_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'ACCOUNTING_AUDIT_CHAIN_IS_APPEND_ONLY';
end;
$$;

drop trigger if exists be_accounting_audit_chain_immutable_v2 on public.be_accounting_audit_chain_v2;
create trigger be_accounting_audit_chain_immutable_v2
before update or delete on public.be_accounting_audit_chain_v2
for each row execute function public.be_accounting_block_audit_mutation_v2();

drop policy if exists be_accounting_audit_chain_select_v2 on public.be_accounting_audit_chain_v2;
create policy be_accounting_audit_chain_select_v2
on public.be_accounting_audit_chain_v2 for select
to authenticated
using (
  public.be_accounting_can_v1('audit_view')
  or public.be_accounting_can_v1('ledger_admin')
);

create index if not exists be_accounting_audit_chain_entity_idx
on public.be_accounting_audit_chain_v2(entity_type,entity_id,occurred_at desc);
create index if not exists be_accounting_audit_chain_actor_idx
on public.be_accounting_audit_chain_v2(actor_id,occurred_at desc);
create index if not exists finance_daily_logs_payment_idx
on public.finance_daily_logs(entry_date,payment_method,payment_mobile_number)
where soft_deleted_at is null;

create or replace function public.be_accounting_write_audit_v1(
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text default null,
  p_related_journal_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_meta jsonb := coalesce(p_metadata,'{}'::jsonb);
begin
  insert into public.audit_logs(
    actor_id,action,entity_type,entity_id,status,before_data,after_data,notes,created_at,
    table_name,record_id,old_data,new_data,performed_by,reason,related_journal_id,metadata,"timestamp"
  ) values (
    auth.uid(),upper(coalesce(p_action,'ACCOUNTING')),coalesce(nullif(p_table_name,''),'ACCOUNTING'),
    p_record_id::text,'success',p_old_data,p_new_data,p_reason,now(),
    coalesce(nullif(p_table_name,''),'ACCOUNTING'),p_record_id,p_old_data,p_new_data,auth.uid(),
    p_reason,p_related_journal_id,v_meta,now()
  );

  perform public.be_accounting_append_audit_v2(
    p_action,p_table_name,p_record_id::text,p_old_data,p_new_data,
    coalesce(v_meta->>'risk_level','NORMAL'),v_meta->>'request_id',v_meta->>'user_agent',
    v_meta||jsonb_build_object('related_journal_id',p_related_journal_id,'reason',p_reason)
  );
end;
$$;

create or replace function public.be_accounting_submit_finance_daily_v2(
  p_entry_date date,
  p_department_code text,
  p_delivery_fees_collected numeric,
  p_cod_handling_fees numeric,
  p_surcharges numeric,
  p_rider_commissions_accrued numeric,
  p_fuel_and_tolls_spent numeric,
  p_packaging_supplies_spent numeric,
  p_petty_cash_expenses numeric,
  p_cod_cash_collected_in_hand numeric,
  p_accounts_receivable_invoiced numeric,
  p_accounts_payable_incurred numeric,
  p_funding_account_code text,
  p_payment_method text,
  p_payment_mobile_number text default null,
  p_payment_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_department text := upper(btrim(coalesce(p_department_code,'FINANCE')));
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
  v_funding_code text := btrim(coalesce(p_funding_account_code,''));
  v_method text := upper(btrim(coalesce(p_payment_method,'')));
  v_mobile text := nullif(regexp_replace(coalesce(p_payment_mobile_number,''),'[^0-9]','','g'),'');
  v_reference text := nullif(btrim(coalesce(p_payment_reference,'')),'');
  v_source_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_existing public.finance_daily_logs%rowtype;
  v_upsert jsonb;
  v_fingerprint text;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_seq integer := 10;
  v_version integer;
  v_funding uuid;
  v_cash uuid;
  v_ar uuid;
  v_ap uuid;
  v_cod_pending uuid;
  v_delivery_rev uuid;
  v_cod_rev uuid;
  v_surcharge_rev uuid;
  v_rider_exp uuid;
  v_rider_payable uuid;
  v_fuel_exp uuid;
  v_packaging_exp uuid;
  v_petty_exp uuid;
  v_ar_offset uuid;
  v_ap_offset uuid;
  v_amount numeric(18,2);
begin
  if not public.be_accounting_can_v1('finance_entry') then
    perform public.be_accounting_append_audit_v2('CONTROL_BLOCK','finance_daily_logs',null,null,null,'HIGH',v_metadata->>'request_id',v_metadata->>'user_agent',
      jsonb_build_object('code','UNAUTHORIZED_FINANCE_ENTRY'));
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_entry_date is null then return jsonb_build_object('ok',false,'code','ENTRY_DATE_REQUIRED'); end if;
  if v_department='' then return jsonb_build_object('ok',false,'code','DEPARTMENT_REQUIRED'); end if;

  if least(
    coalesce(p_delivery_fees_collected,0),coalesce(p_cod_handling_fees,0),coalesce(p_surcharges,0),
    coalesce(p_rider_commissions_accrued,0),coalesce(p_fuel_and_tolls_spent,0),
    coalesce(p_packaging_supplies_spent,0),coalesce(p_petty_cash_expenses,0),
    coalesce(p_cod_cash_collected_in_hand,0),coalesce(p_accounts_receivable_invoiced,0),
    coalesce(p_accounts_payable_incurred,0)
  ) < 0 then return jsonb_build_object('ok',false,'code','NEGATIVE_AMOUNT_NOT_ALLOWED'); end if;

  if not exists (
    select 1 from public.be_finance_payment_channels_v2 c
    where c.is_active and c.method_code=v_method
      and c.account_code=v_funding_code
      and coalesce(c.mobile_number,'')=coalesce(v_mobile,'')
  ) then
    return jsonb_build_object('ok',false,'code','PAYMENT_CHANNEL_INVALID');
  end if;

  if v_method in ('MMQR','KBZ_PAY') and v_reference is null then
    return jsonb_build_object('ok',false,'code','MOBILE_PAYMENT_REFERENCE_REQUIRED');
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'entry_date',p_entry_date,'department_code',v_department,
    'delivery_fees_collected',coalesce(p_delivery_fees_collected,0),
    'cod_handling_fees',coalesce(p_cod_handling_fees,0),'surcharges',coalesce(p_surcharges,0),
    'rider_commissions_accrued',coalesce(p_rider_commissions_accrued,0),
    'fuel_and_tolls_spent',coalesce(p_fuel_and_tolls_spent,0),
    'packaging_supplies_spent',coalesce(p_packaging_supplies_spent,0),
    'petty_cash_expenses',coalesce(p_petty_cash_expenses,0),
    'cod_cash_collected_in_hand',coalesce(p_cod_cash_collected_in_hand,0),
    'accounts_receivable_invoiced',coalesce(p_accounts_receivable_invoiced,0),
    'accounts_payable_incurred',coalesce(p_accounts_payable_incurred,0),
    'funding_account_code',v_funding_code,'payment_method',v_method,
    'payment_mobile_number',coalesce(v_mobile,''),'payment_reference',coalesce(v_reference,''),
    'ar_offset_account_code',coalesce(v_metadata->>'ar_offset_account_code',''),
    'ap_offset_account_code',coalesce(v_metadata->>'ap_offset_account_code','')
  )::text);

  select * into v_existing
  from public.finance_daily_logs
  where entry_date=p_entry_date and department_code=v_department and soft_deleted_at is null
    and coalesce(metadata->>'input_fingerprint','')=v_fingerprint
  order by version_no desc limit 1;

  if found then
    perform public.be_accounting_append_audit_v2('DUPLICATE_BLOCKED','finance_daily_logs',v_existing.id::text,null,null,'MEDIUM',
      v_metadata->>'request_id',v_metadata->>'user_agent',
      jsonb_build_object('submission_no',v_existing.submission_no,'fingerprint',v_fingerprint));
    return jsonb_build_object('ok',true,'code','UNCHANGED','source_id',v_existing.id,
      'event_id',v_existing.accounting_event_id,'submission_no',v_existing.submission_no,'locked',v_existing.is_locked);
  end if;

  select coalesce(max(version_no),0)+1 into v_version
  from public.finance_daily_logs
  where entry_date=p_entry_date and department_code=v_department;

  select id into v_funding from public.be_chart_of_accounts where account_code=v_funding_code and is_active and is_postable;
  if v_funding is null then return jsonb_build_object('ok',false,'code','FUNDING_ACCOUNT_INVALID'); end if;

  select id into v_cash from public.be_chart_of_accounts where account_code='1000' and is_active and is_postable;
  select id into v_ar from public.be_chart_of_accounts where account_code='1220' and is_active and is_postable;
  select id into v_ap from public.be_chart_of_accounts where account_code='2000' and is_active and is_postable;
  select id into v_cod_pending from public.be_chart_of_accounts where account_code='2500' and is_active and is_postable;
  select id into v_delivery_rev from public.be_chart_of_accounts where account_code='4000' and is_active and is_postable;
  select id into v_cod_rev from public.be_chart_of_accounts where account_code='4100' and is_active and is_postable;
  select id into v_surcharge_rev from public.be_chart_of_accounts where account_code='4200' and is_active and is_postable;
  select id into v_rider_exp from public.be_chart_of_accounts where account_code='5000' and is_active and is_postable;
  select id into v_rider_payable from public.be_chart_of_accounts where account_code='2200' and is_active and is_postable;
  select id into v_fuel_exp from public.be_chart_of_accounts where account_code='5100' and is_active and is_postable;
  select id into v_packaging_exp from public.be_chart_of_accounts where account_code='5200' and is_active and is_postable;
  select id into v_petty_exp from public.be_chart_of_accounts where account_code='6600' and is_active and is_postable;

  if coalesce(p_accounts_receivable_invoiced,0)>0 then
    if nullif(btrim(coalesce(v_metadata->>'ar_counterparty','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ar_reference','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ar_offset_account_code','')),'') is null then
      return jsonb_build_object('ok',false,'code','AR_DETAILS_REQUIRED');
    end if;
    select id into v_ar_offset from public.be_chart_of_accounts
    where account_code=v_metadata->>'ar_offset_account_code' and is_active and is_postable;
    if v_ar_offset is null then return jsonb_build_object('ok',false,'code','AR_OFFSET_ACCOUNT_INVALID'); end if;
  end if;

  if coalesce(p_accounts_payable_incurred,0)>0 then
    if nullif(btrim(coalesce(v_metadata->>'ap_counterparty','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ap_reference','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ap_offset_account_code','')),'') is null then
      return jsonb_build_object('ok',false,'code','AP_DETAILS_REQUIRED');
    end if;
    select id into v_ap_offset from public.be_chart_of_accounts
    where account_code=v_metadata->>'ap_offset_account_code' and is_active and is_postable;
    if v_ap_offset is null then return jsonb_build_object('ok',false,'code','AP_OFFSET_ACCOUNT_INVALID'); end if;
  end if;

  v_upsert := public.be_accounting_upsert_event_v1(
    'FINANCE_MANUAL','finance_daily_logs',v_source_id::text,'FINANCE_DAILY_MANUAL','FINANCE_DAILY_V2',
    p_entry_date,'Manual Finance daily accounting submission','MMK',0,
    jsonb_build_object('source_reference',v_department||':'||p_entry_date::text||':V'||v_version::text),
    v_fingerprint,'REVIEW_PENDING',now(),
    jsonb_build_object(
      'department_code',v_department,'input_fingerprint',v_fingerprint,'version_no',v_version,
      'payment_method',v_method,'payment_mobile_number',v_mobile,'payment_reference',v_reference
    )
  );
  if not coalesce((v_upsert->>'ok')::boolean,false) then return v_upsert; end if;
  v_event_id := (v_upsert->>'event_id')::uuid;

  delete from public.be_accounting_event_lines where event_id=v_event_id;

  v_amount:=coalesce(p_delivery_fees_collected,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'Delivery fee collection funding'),
           (v_event_id,v_delivery_rev,v_seq+1,0,v_amount,'Delivery Service Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_cod_handling_fees,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'COD handling fee collection funding'),
           (v_event_id,v_cod_rev,v_seq+1,0,v_amount,'COD Handling Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_surcharges,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'Surcharge collection funding'),
           (v_event_id,v_surcharge_rev,v_seq+1,0,v_amount,'Surcharge Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_rider_commissions_accrued,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_rider_exp,v_seq,v_amount,0,'Rider Commission Expense'),
           (v_event_id,v_rider_payable,v_seq+1,0,v_amount,'Rider Commission Payable');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_fuel_and_tolls_spent,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_fuel_exp,v_seq,v_amount,0,'Fuel & Tolls Expense'),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Fuel/tolls funding source');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_packaging_supplies_spent,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_packaging_exp,v_seq,v_amount,0,'Packaging Supplies Expense'),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Packaging funding source');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_petty_cash_expenses,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_petty_exp,v_seq,v_amount,0,coalesce(v_metadata->>'petty_cash_description','Petty Cash Expense'),v_metadata),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Petty cash funding source',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_cod_cash_collected_in_hand,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'COD collection via '||v_method),
           (v_event_id,v_cod_pending,v_seq+1,0,v_amount,'COD Pending Remittance');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_accounts_receivable_invoiced,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_ar,v_seq,v_amount,0,'Accounts Receivable - '||v_metadata->>'ar_counterparty',v_metadata),
           (v_event_id,v_ar_offset,v_seq+1,0,v_amount,'AR offset - '||v_metadata->>'ar_reference',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_accounts_payable_incurred,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_ap_offset,v_seq,v_amount,0,'AP offset - '||v_metadata->>'ap_reference',v_metadata),
           (v_event_id,v_ap,v_seq+1,0,v_amount,'Accounts Payable - '||v_metadata->>'ap_counterparty',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  if v_total_debit=0 or v_total_debit<>v_total_credit then
    return jsonb_build_object('ok',false,'code','JOURNAL_NOT_BALANCED','debit',v_total_debit,'credit',v_total_credit);
  end if;

  update public.be_accounting_events
  set total_amount=v_total_debit,
      source_snapshot=jsonb_build_object(
        'source_reference',v_department||':'||p_entry_date::text||':V'||v_version::text,
        'department_code',v_department,'funding_account_code',v_funding_code,
        'payment_method',v_method,'payment_mobile_number',v_mobile,'payment_reference',v_reference,
        'total_debit',v_total_debit,'total_credit',v_total_credit
      )||v_metadata,
      updated_at=now()
  where id=v_event_id;

  insert into public.finance_daily_logs(
    id,entry_date,department_code,delivery_fees_collected,cod_handling_fees,surcharges,
    rider_commissions_accrued,fuel_and_tolls_spent,packaging_supplies_spent,petty_cash_expenses,
    cod_cash_collected_in_hand,accounts_receivable_invoiced,accounts_payable_incurred,
    source_mode,accounting_event_id,is_locked,submitted_at,created_by,version_no,metadata,
    payment_method,payment_mobile_number,payment_reference
  ) values (
    v_source_id,p_entry_date,v_department,coalesce(p_delivery_fees_collected,0),coalesce(p_cod_handling_fees,0),
    coalesce(p_surcharges,0),coalesce(p_rider_commissions_accrued,0),coalesce(p_fuel_and_tolls_spent,0),
    coalesce(p_packaging_supplies_spent,0),coalesce(p_petty_cash_expenses,0),
    coalesce(p_cod_cash_collected_in_hand,0),coalesce(p_accounts_receivable_invoiced,0),
    coalesce(p_accounts_payable_incurred,0),'MANUAL',v_event_id,true,now(),auth.uid(),v_version,
    v_metadata||jsonb_build_object('input_fingerprint',v_fingerprint,'funding_account_code',v_funding_code),
    v_method,v_mobile,v_reference
  );

  perform public.be_accounting_write_audit_v1(
    'finance_daily_logs',v_source_id,'SUBMIT',null,
    jsonb_build_object(
      'event_id',v_event_id,'entry_date',p_entry_date,'department_code',v_department,'version_no',v_version,
      'payment_method',v_method,'payment_mobile_number',v_mobile,'payment_reference',v_reference,
      'total_debit',v_total_debit,'total_credit',v_total_credit
    ),
    null,null,
    jsonb_build_object('function','be_accounting_submit_finance_daily_v2','request_id',v_metadata->>'request_id',
      'user_agent',v_metadata->>'user_agent','risk_level','NORMAL')
  );

  return jsonb_build_object(
    'ok',true,'code','SUBMITTED','source_id',v_source_id,'event_id',v_event_id,'version_no',v_version,
    'locked',true,'debit',v_total_debit,'credit',v_total_credit,'payment_method',v_method,
    'payment_mobile_number',v_mobile
  );
end;
$$;

create or replace function public.be_accounting_review_event_v1(
  p_event_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_event public.be_accounting_events%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_status text;
  v_role text := public.be_accounting_current_role_v1();
begin
  if not public.be_accounting_can_v1('finance_review') then
    perform public.be_accounting_append_audit_v2('CONTROL_BLOCK','be_accounting_events',p_event_id::text,null,null,'HIGH',null,null,
      jsonb_build_object('code','UNAUTHORIZED_FINANCE_REVIEW'));
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select * into v_event from public.be_accounting_events where id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','EVENT_NOT_FOUND','event_id',p_event_id); end if;

  if v_event.review_status='POSTED' or v_event.posted_journal_id is not null then
    return jsonb_build_object('ok',true,'code','ALREADY_POSTED','event_id',v_event.id,'journal_id',v_event.posted_journal_id);
  end if;

  v_status := case v_decision
    when 'APPROVE' then 'APPROVED' when 'APPROVED' then 'APPROVED'
    when 'HOLD' then 'HELD' when 'HELD' then 'HELD'
    when 'REJECT' then 'REJECTED' when 'REJECTED' then 'REJECTED'
    when 'INVESTIGATE' then 'NEEDS_REVIEW' when 'NEEDS_REVIEW' then 'NEEDS_REVIEW'
    else null end;

  if v_status is null then return jsonb_build_object('ok',false,'code','INVALID_DECISION','decision',v_decision); end if;

  if v_status='APPROVED'
     and v_event.created_by=auth.uid()
     and v_role not in ('service_role','database_admin','superadmin','super_admin','app_owner','sys') then
    perform public.be_accounting_append_audit_v2('SELF_APPROVAL_BLOCKED','be_accounting_events',v_event.id::text,
      jsonb_build_object('review_status',v_event.review_status),null,'HIGH',null,null,
      jsonb_build_object('created_by',v_event.created_by));
    return jsonb_build_object('ok',false,'code','SELF_APPROVAL_BLOCKED',
      'message','The creator of an accounting event cannot approve the same event.');
  end if;

  if v_status in ('HELD','REJECTED','NEEDS_REVIEW')
     and nullif(btrim(coalesce(p_note,'')),'') is null then
    return jsonb_build_object('ok',false,'code','NOTE_REQUIRED','status',v_status);
  end if;

  update public.be_accounting_events
  set review_status=v_status,reviewed_by=auth.uid(),reviewed_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_review_note',coalesce(p_note,''),'last_review_decision',v_status
      ),updated_at=now()
  where id=v_event.id;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_events',v_event.id,'REVIEW',
    jsonb_build_object('review_status',v_event.review_status,'reviewed_by',v_event.reviewed_by,'reviewed_at',v_event.reviewed_at),
    jsonb_build_object('review_status',v_status,'reviewed_by',auth.uid(),'reviewed_at',now()),
    p_note,v_event.posted_journal_id,
    jsonb_build_object('function','be_accounting_review_event_v1','decision',v_status,
      'risk_level',case when v_status in ('REJECTED','NEEDS_REVIEW') then 'MEDIUM' else 'NORMAL' end)
  );

  return jsonb_build_object('ok',true,'code',v_status,'event_id',v_event.id,'review_status',v_status);
end;
$$;

create or replace function public.be_accounting_post_approved_event_v2(
  p_event_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_event public.be_accounting_events%rowtype;
  v_post jsonb;
  v_role text := public.be_accounting_current_role_v1();
begin
  if not public.be_accounting_can_v1('journal_post') then
    perform public.be_accounting_append_audit_v2('CONTROL_BLOCK','be_accounting_events',p_event_id::text,null,null,'HIGH',null,null,
      jsonb_build_object('code','UNAUTHORIZED_JOURNAL_POST'));
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select * into v_event from public.be_accounting_events where id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','EVENT_NOT_FOUND'); end if;
  if v_event.posted_journal_id is not null or v_event.review_status='POSTED' then
    return jsonb_build_object('ok',true,'code','ALREADY_POSTED','journal_id',v_event.posted_journal_id);
  end if;
  if v_event.review_status<>'APPROVED' or v_event.reviewed_by is null then
    return jsonb_build_object('ok',false,'code','REVIEW_APPROVAL_REQUIRED');
  end if;
  if v_event.created_by=auth.uid()
     and v_role not in ('service_role','database_admin','superadmin','super_admin','app_owner','sys') then
    perform public.be_accounting_append_audit_v2('SELF_POST_BLOCKED','be_accounting_events',v_event.id::text,null,null,'HIGH',null,null,
      jsonb_build_object('created_by',v_event.created_by,'reviewed_by',v_event.reviewed_by));
    return jsonb_build_object('ok',false,'code','SELF_POST_BLOCKED',
      'message','The creator of an accounting event cannot post the same event.');
  end if;

  v_post := public.be_accounting_post_event_v1(p_event_id);
  if coalesce((v_post->>'ok')::boolean,false) then
    perform public.be_accounting_write_audit_v1(
      'be_accounting_events',v_event.id,'POST_APPROVED',
      jsonb_build_object('review_status',v_event.review_status,'reviewed_by',v_event.reviewed_by),
      v_post,p_note,(v_post->>'journal_id')::uuid,
      jsonb_build_object('function','be_accounting_post_approved_event_v2','risk_level','NORMAL')
    );
  end if;
  return v_post;
end;
$$;

create or replace function public.be_accounting_approve_and_post_event_v1(
  p_event_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_review jsonb;
  v_post jsonb;
begin
  if not public.be_accounting_can_v1('journal_post') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  v_review := public.be_accounting_review_event_v1(p_event_id,'APPROVE',p_note);
  if not coalesce((v_review->>'ok')::boolean,false) then return v_review; end if;
  v_post := public.be_accounting_post_approved_event_v2(p_event_id,p_note);
  return v_post||jsonb_build_object('review',v_review);
end;
$$;

create or replace function public.be_accounting_raise_fraud_flag_v2(
  p_reference_type text,
  p_reference_id text,
  p_amount numeric,
  p_severity text,
  p_reason text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text := 'FR-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));
begin
  if not (public.be_accounting_can_v1('finance_review') or public.be_accounting_can_v1('audit_view')) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED');
  end if;

  insert into public.finance_fraud_flags(
    id,flag_no,reference_type,reference_id,amount,severity,status,reason,note,created_by,created_at,updated_at
  ) values (
    v_id,v_no,coalesce(nullif(p_reference_type,''),'ACCOUNTING'),p_reference_id,coalesce(p_amount,0),
    lower(coalesce(nullif(p_severity,''),'medium')),'open',p_reason,p_note,auth.uid(),now(),now()
  );

  perform public.be_accounting_append_audit_v2('FRAUD_FLAG_RAISED','finance_fraud_flags',v_id::text,null,
    jsonb_build_object('flag_no',v_no,'reference_type',p_reference_type,'reference_id',p_reference_id,
      'amount',coalesce(p_amount,0),'severity',p_severity,'reason',p_reason),
    'HIGH',null,null,jsonb_build_object('note',p_note));

  return jsonb_build_object('ok',true,'code','FRAUD_FLAG_RAISED','id',v_id,'flag_no',v_no);
end;
$$;

drop policy if exists finance_fraud_flags_accounting_select_v2 on public.finance_fraud_flags;
create policy finance_fraud_flags_accounting_select_v2
on public.finance_fraud_flags for select
to authenticated
using (public.be_accounting_can_v1('finance_review') or public.be_accounting_can_v1('audit_view'));

revoke insert,update,delete,truncate on public.finance_fraud_flags from authenticated;
grant select on public.finance_fraud_flags to authenticated;

create or replace function public.be_accounting_periodic_report_v2(
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_pl jsonb;
  v_bs jsonb;
  v_cash jsonb;
  v_channels jsonb;
  v_settlement jsonb;
  v_arap jsonb;
  v_controls jsonb;
  v_journals jsonb;
begin
  if not public.be_accounting_can_v1('financial_reports') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if p_from is null or p_to is null or p_from>p_to then
    return jsonb_build_object('ok',false,'code','INVALID_PERIOD');
  end if;

  v_pl := public.be_accounting_profit_loss_v1(p_from,p_to);
  v_bs := public.be_accounting_balance_sheet_v1(p_to);

  select jsonb_build_object(
    'inflows',coalesce(sum(l.debit_amount),0),
    'outflows',coalesce(sum(l.credit_amount),0),
    'net_movement',coalesce(sum(l.debit_amount-l.credit_amount),0),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'account_code',a.account_code,'account_name',a.account_name,
      'inflows',x.debits,'outflows',x.credits,'net_movement',x.debits-x.credits
    ) order by a.account_code),'[]'::jsonb)
  )
  into v_cash
  from (
    select l.account_id,sum(l.debit_amount) debits,sum(l.credit_amount) credits
    from public.be_journal_entries j join public.be_journal_lines l on l.journal_id=j.id
    join public.be_chart_of_accounts ca on ca.id=l.account_id
    where j.status='POSTED' and j.accounting_date between p_from and p_to
      and ca.account_code in ('1000','1010','1100','1110','1120','1121')
    group by l.account_id
  ) x
  join public.be_chart_of_accounts a on a.id=x.account_id;

  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(q) order by q.payment_method,q.payment_mobile_number),'[]'::jsonb),
    'total_activity',coalesce(sum(q.total_activity),0)
  ) into v_channels
  from (
    select coalesce(payment_method,'UNSPECIFIED') payment_method,payment_mobile_number,
      count(*) submissions,
      sum(delivery_fees_collected+cod_handling_fees+surcharges+cod_cash_collected_in_hand
          +accounts_receivable_invoiced+accounts_payable_incurred
          +rider_commissions_accrued+fuel_and_tolls_spent+packaging_supplies_spent+petty_cash_expenses) total_activity
    from public.finance_daily_logs
    where entry_date between p_from and p_to and soft_deleted_at is null
    group by coalesce(payment_method,'UNSPECIFIED'),payment_mobile_number
  ) q;

  select jsonb_build_object(
    'ways',count(*),
    'expected_cod',coalesce(sum(expected_cod),0),
    'reported_collected',coalesce(sum(reported_collected),0),
    'rider_remittance',coalesce(sum(rider_remittance),0),
    'settled_amount',coalesce(sum(settled_amount),0),
    'delivery_fee',coalesce(sum(delivery_fee),0),
    'variance_amount',coalesce(sum(variance_amount),0),
    'open_or_held',count(*) filter(where coalesce(settlement_status,'') not in ('SETTLED','COMPLETED','PAID')),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'delivery_way_id',delivery_way_id,'wayplan_id',wayplan_id,'rider_name',rider_name,
      'expected_cod',expected_cod,'reported_collected',reported_collected,'rider_remittance',rider_remittance,
      'settled_amount',settled_amount,'delivery_fee',delivery_fee,'payment_mode',payment_mode,
      'proof_status',proof_status,'settlement_status',settlement_status,'variance_type',variance_type,
      'variance_amount',variance_amount,'settlement_reference',settlement_reference,
      'settled_at',settled_at
    ) order by coalesce(settled_at,remitted_at,delivered_at,created_at) desc),'[]'::jsonb)
  ) into v_settlement
  from public.be_finance_cod_settlements_v48
  where coalesce(settled_at,remitted_at,delivered_at,created_at)::date between p_from and p_to;

  select jsonb_build_object(
    'accounts_receivable_closing',coalesce(sum(case when a.account_code='1220' then l.debit_amount-l.credit_amount else 0 end),0),
    'accounts_payable_closing',coalesce(sum(case when a.account_code='2000' then l.credit_amount-l.debit_amount else 0 end),0),
    'rider_payable_closing',coalesce(sum(case when a.account_code='2200' then l.credit_amount-l.debit_amount else 0 end),0),
    'cod_pending_remittance_closing',coalesce(sum(case when a.account_code='2500' then l.credit_amount-l.debit_amount else 0 end),0)
  ) into v_arap
  from public.be_journal_entries j join public.be_journal_lines l on l.journal_id=j.id
  join public.be_chart_of_accounts a on a.id=l.account_id
  where j.status='POSTED' and j.accounting_date<=p_to
    and a.account_code in ('1220','2000','2200','2500');

  select jsonb_build_object(
    'review_pending',count(*) filter(where review_status='REVIEW_PENDING'),
    'held',count(*) filter(where review_status='HELD'),
    'needs_review',count(*) filter(where review_status='NEEDS_REVIEW'),
    'rejected',count(*) filter(where review_status='REJECTED'),
    'approved_not_posted',count(*) filter(where review_status='APPROVED' and posted_journal_id is null),
    'open_fraud_flags',(select count(*) from public.finance_fraud_flags where status='open'),
    'high_fraud_flags',(select count(*) from public.finance_fraud_flags where status='open' and lower(severity) in ('high','critical'))
  ) into v_controls
  from public.be_accounting_events
  where event_date between p_from and p_to;

  select jsonb_build_object(
    'posted_journals',count(*),
    'reversals',count(*) filter(where reversal_of_journal_id is not null),
    'replacements',count(*) filter(where replacement_for_journal_id is not null),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'journal_number',journal_number,'accounting_date',accounting_date,'description',description,
      'source_event_id',source_event_id,'posted_by',posted_by,'posted_at',posted_at,
      'reversal_of_journal_id',reversal_of_journal_id,'replacement_for_journal_id',replacement_for_journal_id
    ) order by accounting_date desc,journal_number desc),'[]'::jsonb)
  ) into v_journals
  from public.be_journal_entries
  where status='POSTED' and accounting_date between p_from and p_to;

  return jsonb_build_object(
    'ok',true,'from',p_from,'to',p_to,
    'profit_and_loss',v_pl,
    'balance_sheet',v_bs,
    'cash_flow',v_cash,
    'payment_channels',v_channels,
    'cod_settlement',v_settlement,
    'receivables_payables',v_arap,
    'controls',v_controls,
    'journal_register',v_journals,
    'report_catalog',jsonb_build_array(
      'Profit & Loss','Cash Flow / Cash Movement','Balance Sheet','COD Settlement Summary',
      'Payment Channel Reconciliation','Cash & Wallet Position','Receivables & Payables Position',
      'Journal Register','Audit & Fraud Exception Report'
    )
  );
end;
$$;

create or replace function public.be_accounting_audit_report_v2(
  p_from date,
  p_to date,
  p_limit integer default 1000
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.be_accounting_can_v1('audit_view') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  return jsonb_build_object(
    'ok',true,'from',p_from,'to',p_to,
    'audit_chain',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.seq desc)
      from (
        select seq,id,occurred_at,actor_id,actor_role,authority_level,action,entity_type,entity_id,
               request_id,session_id,risk_level,previous_hash,record_hash,metadata
        from public.be_accounting_audit_chain_v2
        where occurred_at::date between p_from and p_to
        order by seq desc
        limit greatest(1,least(coalesce(p_limit,1000),5000))
      ) q
    ),'[]'::jsonb),
    'fraud_flags',coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from (
        select id,flag_no,reference_type,reference_id,amount,severity,status,reason,note,
               created_by,resolved_by,resolved_at,created_at
        from public.finance_fraud_flags
        where created_at::date between p_from and p_to
        order by created_at desc
        limit greatest(1,least(coalesce(p_limit,1000),5000))
      ) f
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.be_accounting_current_authority_v2() from public,anon;
revoke all on function public.be_accounting_my_authority_v2() from public,anon;
revoke all on function public.be_accounting_set_user_authority_v2(uuid,integer,boolean,boolean,boolean,boolean,boolean,boolean,text) from public,anon,authenticated;
revoke all on function public.be_accounting_append_audit_v2(text,text,text,jsonb,jsonb,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.be_accounting_submit_finance_daily_v2(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.be_accounting_post_approved_event_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.be_accounting_raise_fraud_flag_v2(text,text,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.be_accounting_periodic_report_v2(date,date) from public,anon,authenticated;
revoke all on function public.be_accounting_audit_report_v2(date,date,integer) from public,anon,authenticated;

grant execute on function public.be_accounting_current_authority_v2() to authenticated,service_role;
grant execute on function public.be_accounting_my_authority_v2() to authenticated,service_role;
grant execute on function public.be_accounting_set_user_authority_v2(uuid,integer,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated,service_role;
grant execute on function public.be_accounting_submit_finance_daily_v2(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.be_accounting_post_approved_event_v2(uuid,text) to authenticated,service_role;
grant execute on function public.be_accounting_raise_fraud_flag_v2(text,text,numeric,text,text,text) to authenticated,service_role;
grant execute on function public.be_accounting_periodic_report_v2(date,date) to authenticated,service_role;
grant execute on function public.be_accounting_audit_report_v2(date,date,integer) to authenticated,service_role;
grant execute on function public.be_accounting_append_audit_v2(text,text,text,jsonb,jsonb,text,text,text,jsonb) to service_role;

revoke execute on function public.be_accounting_post_event_v1(uuid) from authenticated;
grant execute on function public.be_accounting_post_event_v1(uuid) to service_role;
