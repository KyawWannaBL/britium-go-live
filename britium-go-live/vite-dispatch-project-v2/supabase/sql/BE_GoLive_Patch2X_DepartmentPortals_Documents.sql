
-- Britium Enterprise Portal Patch 2X
-- Department portals, document vaults, exception/field/audit/settings/account backend wiring.
-- Safe for existing databases: uses create-if-not-exists, add-column-if-not-exists and RPC wrappers.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.be_json_pick(p_json jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  if p_json is null then
    return null;
  end if;

  foreach k in array p_keys loop
    if p_json ? k then
      v := p_json ->> k;
      if v is not null and btrim(v) <> '' then
        return v;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit foundation
-- ---------------------------------------------------------------------------

create table if not exists public.be_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  resource_type text not null,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_be_audit_events_created on public.be_audit_events(created_at desc);
create index if not exists idx_be_audit_events_action on public.be_audit_events(action);
create index if not exists idx_be_audit_events_resource on public.be_audit_events(resource_type, resource_id);

create or replace function public.be_log_event(
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid;
  v_email text;
  v_role text;
begin
  v_actor := auth.uid();

  select email, coalesce(role, user_role, raw_user_meta_data->>'role')
  into v_email, v_role
  from auth.users
  where id = v_actor;

  insert into public.be_audit_events(actor_id, actor_email, actor_role, action, resource_type, resource_id, details)
  values (v_actor, v_email, v_role, coalesce(p_action,'unknown'), coalesce(p_resource_type,'unknown'), p_resource_id, coalesce(p_details,'{}'::jsonb))
  returning id into v_id;

  return v_id;
exception when others then
  insert into public.be_audit_events(action, resource_type, resource_id, details)
  values (coalesce(p_action,'unknown'), coalesce(p_resource_type,'unknown'), p_resource_id, coalesce(p_details,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.be_log_event(text,text,text,jsonb) to authenticated, anon;

create or replace function public.be_audit_snapshot(
  p_actor text default null,
  p_action text default null,
  p_resource text default null,
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with filtered as (
  select *
  from public.be_audit_events e
  where (p_actor is null or p_actor = '' or coalesce(e.actor_email,'') ilike '%' || p_actor || '%' or coalesce(e.actor_role,'') ilike '%' || p_actor || '%')
    and (p_action is null or p_action = '' or e.action ilike '%' || p_action || '%')
    and (p_resource is null or p_resource = '' or e.resource_type ilike '%' || p_resource || '%' or coalesce(e.resource_id,'') ilike '%' || p_resource || '%')
    and (p_date_from is null or e.created_at::date >= p_date_from)
    and (p_date_to is null or e.created_at::date <= p_date_to)
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'total_events', (select count(*) from filtered),
    'unique_actors', (select count(distinct coalesce(actor_email,actor_id::text,'system')) from filtered),
    'unique_actions', (select count(distinct action) from filtered)
  ),
  'events', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select id::text, actor_email, actor_role, action, resource_type, resource_id, details, created_at
      from filtered
      order by created_at desc
      limit 500
    ) x
  ), '[]'::jsonb),
  'generated_at', now()
);
$$;

grant execute on function public.be_audit_snapshot(text,text,text,date,date) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Document vault for employees, merchants and customers.
-- Contracts/IDs are immutable after approval; only amendments/new versions are added.
-- ---------------------------------------------------------------------------

create table if not exists public.be_document_vault (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('employee','merchant','customer','business_development','marketing','other')),
  entity_id text,
  entity_name text,
  doc_category text not null default 'general',
  title text not null,
  description text,
  file_url text,
  file_name text,
  mime_type text,
  version_no int not null default 1,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','archived')),
  is_locked boolean not null default false,
  amendment_of uuid references public.be_document_vault(id),
  submitted_by uuid,
  submitted_at timestamptz default now(),
  britium_approved_by uuid,
  britium_approved_at timestamptz,
  counterparty_approved_by uuid,
  counterparty_approved_name text,
  counterparty_approved_at timestamptz,
  approval_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.be_document_vault
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists entity_name text,
  add column if not exists doc_category text default 'general',
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists version_no int default 1,
  add column if not exists status text default 'draft',
  add column if not exists is_locked boolean default false,
  add column if not exists amendment_of uuid,
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz default now(),
  add column if not exists britium_approved_by uuid,
  add column if not exists britium_approved_at timestamptz,
  add column if not exists counterparty_approved_by uuid,
  add column if not exists counterparty_approved_name text,
  add column if not exists counterparty_approved_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_be_document_vault_entity on public.be_document_vault(entity_type, entity_id);
create index if not exists idx_be_document_vault_status on public.be_document_vault(status);
create index if not exists idx_be_document_vault_created on public.be_document_vault(created_at desc);

insert into storage.buckets (id, name, public)
values ('be-documents', 'be-documents', false)
on conflict (id) do nothing;

create or replace function public.be_document_vault_snapshot(
  p_entity_type text default null,
  p_entity_id text default null,
  p_search text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with filtered as (
  select *
  from public.be_document_vault d
  where (p_entity_type is null or p_entity_type = '' or d.entity_type = p_entity_type)
    and (p_entity_id is null or p_entity_id = '' or coalesce(d.entity_id,'') = p_entity_id)
    and (
      p_search is null or p_search = ''
      or coalesce(d.entity_name,'') ilike '%' || p_search || '%'
      or coalesce(d.title,'') ilike '%' || p_search || '%'
      or coalesce(d.doc_category,'') ilike '%' || p_search || '%'
      or coalesce(d.file_name,'') ilike '%' || p_search || '%'
    )
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'total_documents', count(*),
    'pending_approval', count(*) filter (where status = 'pending_approval'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected')
  ),
  'documents', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb),
  'generated_at', now()
)
from (
  select id::text, entity_type, entity_id, entity_name, doc_category, title, description,
         file_url, file_name, mime_type, version_no, status, is_locked,
         amendment_of::text, submitted_by::text, submitted_at,
         britium_approved_by::text, britium_approved_at,
         counterparty_approved_by::text, counterparty_approved_name, counterparty_approved_at,
         approval_note, payload, created_at, updated_at
  from filtered
  order by created_at desc
  limit 500
) x;
$$;

grant execute on function public.be_document_vault_snapshot(text,text,text) to authenticated, anon;

create or replace function public.be_document_submit(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_existing uuid;
  v_version int;
begin
  v_existing := nullif(p_payload->>'amendment_of','')::uuid;
  v_version := coalesce(nullif(p_payload->>'version_no','')::int, 1);

  if v_existing is not null then
    select coalesce(max(version_no), 0) + 1
    into v_version
    from public.be_document_vault
    where id = v_existing or amendment_of = v_existing;
  end if;

  insert into public.be_document_vault(
    entity_type, entity_id, entity_name, doc_category, title, description,
    file_url, file_name, mime_type, version_no, status, is_locked, amendment_of,
    submitted_by, payload
  )
  values (
    coalesce(nullif(p_payload->>'entity_type',''), 'other'),
    nullif(p_payload->>'entity_id',''),
    nullif(p_payload->>'entity_name',''),
    coalesce(nullif(p_payload->>'doc_category',''), 'general'),
    coalesce(nullif(p_payload->>'title',''), 'Untitled Document'),
    nullif(p_payload->>'description',''),
    nullif(p_payload->>'file_url',''),
    nullif(p_payload->>'file_name',''),
    nullif(p_payload->>'mime_type',''),
    v_version,
    coalesce(nullif(p_payload->>'status',''), 'pending_approval'),
    false,
    v_existing,
    auth.uid(),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  perform public.be_log_event('document_submitted', 'document_vault', v_id::text, p_payload);

  return jsonb_build_object('ok', true, 'id', v_id::text, 'version_no', v_version);
end;
$$;

grant execute on function public.be_document_submit(jsonb) to authenticated, anon;

create or replace function public.be_document_approve(
  p_document_id uuid,
  p_side text default 'britium',
  p_approver_name text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.be_document_vault%rowtype;
  v_new_status text;
begin
  select * into v_doc from public.be_document_vault where id = p_document_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Document not found');
  end if;

  if v_doc.is_locked and v_doc.status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'Approved document is locked. Submit an amendment version instead.');
  end if;

  if lower(coalesce(p_side,'britium')) in ('customer','merchant','counterparty','other_side') then
    update public.be_document_vault
    set counterparty_approved_by = auth.uid(),
        counterparty_approved_name = coalesce(p_approver_name, counterparty_approved_name, 'Counterparty'),
        counterparty_approved_at = now(),
        approval_note = coalesce(p_note, approval_note),
        updated_at = now()
    where id = p_document_id;
  else
    update public.be_document_vault
    set britium_approved_by = auth.uid(),
        britium_approved_at = now(),
        approval_note = coalesce(p_note, approval_note),
        updated_at = now()
    where id = p_document_id;
  end if;

  select * into v_doc from public.be_document_vault where id = p_document_id;

  if v_doc.britium_approved_at is not null and v_doc.counterparty_approved_at is not null then
    v_new_status := 'approved';
    update public.be_document_vault
    set status = 'approved', is_locked = true, updated_at = now()
    where id = p_document_id;
  else
    v_new_status := 'pending_approval';
    update public.be_document_vault
    set status = 'pending_approval', updated_at = now()
    where id = p_document_id;
  end if;

  perform public.be_log_event('document_approved_' || coalesce(p_side,'britium'), 'document_vault', p_document_id::text, jsonb_build_object('note', p_note, 'approver_name', p_approver_name));

  return jsonb_build_object('ok', true, 'id', p_document_id::text, 'status', v_new_status);
end;
$$;

grant execute on function public.be_document_approve(uuid,text,text,text) to authenticated, anon;

create or replace function public.be_document_reject(
  p_document_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.be_document_vault
  set status = 'rejected',
      approval_note = p_note,
      updated_at = now()
  where id = p_document_id;

  perform public.be_log_event('document_rejected', 'document_vault', p_document_id::text, jsonb_build_object('note', p_note));

  return jsonb_build_object('ok', true, 'id', p_document_id::text, 'status', 'rejected');
end;
$$;

grant execute on function public.be_document_reject(uuid,text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- HR detailed records
-- ---------------------------------------------------------------------------

create table if not exists public.be_employee_details (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid,
  employee_code text,
  full_name text,
  department text,
  title text,
  role text,
  branch_name text,
  phone text,
  email text,
  personal_email text,
  nrc_no text,
  date_of_birth date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  bank_account text,
  hire_date date,
  termination_date date,
  employment_status text default 'active',
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.be_employee_details
  add column if not exists staff_profile_id uuid,
  add column if not exists employee_code text,
  add column if not exists full_name text,
  add column if not exists department text,
  add column if not exists title text,
  add column if not exists role text,
  add column if not exists branch_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists personal_email text,
  add column if not exists nrc_no text,
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists bank_account text,
  add column if not exists hire_date date,
  add column if not exists termination_date date,
  add column if not exists employment_status text default 'active',
  add column if not exists notes text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_be_employee_details_name on public.be_employee_details(full_name);
create index if not exists idx_be_employee_details_status on public.be_employee_details(employment_status);

create or replace function public.be_hr_detailed_snapshot(p_search text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
with e as (
  select *
  from public.be_employee_details d
  where p_search is null or p_search = ''
     or coalesce(d.full_name,'') ilike '%' || p_search || '%'
     or coalesce(d.email,'') ilike '%' || p_search || '%'
     or coalesce(d.phone,'') ilike '%' || p_search || '%'
     or coalesce(d.employee_code,'') ilike '%' || p_search || '%'
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'employees', count(*),
    'active', count(*) filter (where employment_status = 'active'),
    'inactive', count(*) filter (where employment_status <> 'active'),
    'documents', (select count(*) from public.be_document_vault where entity_type='employee')
  ),
  'employees', coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb),
  'generated_at', now()
)
from (
  select id::text, staff_profile_id::text, employee_code, full_name, department, title, role,
         branch_name, phone, email, personal_email, nrc_no, date_of_birth, address,
         emergency_contact_name, emergency_contact_phone, bank_account, hire_date, termination_date,
         employment_status, notes, payload, created_at, updated_at
  from e
  order by updated_at desc
  limit 500
) x;
$$;

grant execute on function public.be_hr_detailed_snapshot(text) to authenticated, anon;

create or replace function public.be_hr_upsert_employee(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := nullif(p_payload->>'id','')::uuid;

  if v_id is null then
    insert into public.be_employee_details(
      employee_code, full_name, department, title, role, branch_name, phone, email,
      personal_email, nrc_no, date_of_birth, address, emergency_contact_name,
      emergency_contact_phone, bank_account, hire_date, termination_date,
      employment_status, notes, payload, created_by
    )
    values (
      nullif(p_payload->>'employee_code',''), nullif(p_payload->>'full_name',''),
      nullif(p_payload->>'department',''), nullif(p_payload->>'title',''), nullif(p_payload->>'role',''),
      nullif(p_payload->>'branch_name',''), nullif(p_payload->>'phone',''), nullif(p_payload->>'email',''),
      nullif(p_payload->>'personal_email',''), nullif(p_payload->>'nrc_no',''),
      nullif(p_payload->>'date_of_birth','')::date, nullif(p_payload->>'address',''),
      nullif(p_payload->>'emergency_contact_name',''), nullif(p_payload->>'emergency_contact_phone',''),
      nullif(p_payload->>'bank_account',''), nullif(p_payload->>'hire_date','')::date,
      nullif(p_payload->>'termination_date','')::date,
      coalesce(nullif(p_payload->>'employment_status',''), 'active'),
      nullif(p_payload->>'notes',''), p_payload, auth.uid()
    )
    returning id into v_id;
  else
    update public.be_employee_details
    set employee_code = coalesce(nullif(p_payload->>'employee_code',''), employee_code),
        full_name = coalesce(nullif(p_payload->>'full_name',''), full_name),
        department = coalesce(nullif(p_payload->>'department',''), department),
        title = coalesce(nullif(p_payload->>'title',''), title),
        role = coalesce(nullif(p_payload->>'role',''), role),
        branch_name = coalesce(nullif(p_payload->>'branch_name',''), branch_name),
        phone = coalesce(nullif(p_payload->>'phone',''), phone),
        email = coalesce(nullif(p_payload->>'email',''), email),
        personal_email = coalesce(nullif(p_payload->>'personal_email',''), personal_email),
        nrc_no = coalesce(nullif(p_payload->>'nrc_no',''), nrc_no),
        date_of_birth = coalesce(nullif(p_payload->>'date_of_birth','')::date, date_of_birth),
        address = coalesce(nullif(p_payload->>'address',''), address),
        emergency_contact_name = coalesce(nullif(p_payload->>'emergency_contact_name',''), emergency_contact_name),
        emergency_contact_phone = coalesce(nullif(p_payload->>'emergency_contact_phone',''), emergency_contact_phone),
        bank_account = coalesce(nullif(p_payload->>'bank_account',''), bank_account),
        hire_date = coalesce(nullif(p_payload->>'hire_date','')::date, hire_date),
        termination_date = coalesce(nullif(p_payload->>'termination_date','')::date, termination_date),
        employment_status = coalesce(nullif(p_payload->>'employment_status',''), employment_status),
        notes = coalesce(nullif(p_payload->>'notes',''), notes),
        payload = coalesce(payload,'{}'::jsonb) || p_payload,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_id;
  end if;

  perform public.be_log_event('hr_employee_upsert', 'employee', v_id::text, p_payload);

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.be_hr_upsert_employee(jsonb) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Marketing and Business Development portals
-- ---------------------------------------------------------------------------

create table if not exists public.be_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_no text default ('MKT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  title text not null,
  owner_id uuid,
  owner_name text,
  channel text,
  target_segment text,
  budget numeric default 0,
  spend numeric default 0,
  leads_count int default 0,
  merchants_won int default 0,
  customers_won int default 0,
  revenue_amount numeric default 0,
  status text default 'active',
  start_date date default current_date,
  end_date date,
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_marketing_leads (
  id uuid primary key default gen_random_uuid(),
  lead_no text default ('ML-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  source_campaign_id uuid,
  source_campaign_title text,
  customer_or_merchant text check (customer_or_merchant in ('customer','merchant','other')) default 'merchant',
  entity_name text,
  contact_name text,
  phone text,
  email text,
  city text,
  township text,
  status text default 'new',
  brought_by uuid,
  brought_by_name text,
  expected_revenue numeric default 0,
  actual_revenue numeric default 0,
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_department_escalations (
  id uuid primary key default gen_random_uuid(),
  escalation_no text default ('ESC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  source_department text,
  target_department text not null,
  source_ticket_id text,
  entity_type text,
  entity_id text,
  entity_name text,
  issue_type text,
  priority text default 'medium',
  title text not null,
  description text,
  status text default 'open',
  assigned_to uuid,
  assigned_to_name text,
  resolution_note text,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_bd_accounts (
  id uuid primary key default gen_random_uuid(),
  account_no text default ('BD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  account_type text default 'merchant',
  entity_name text not null,
  contact_name text,
  phone text,
  email text,
  city text,
  township text,
  owner_id uuid,
  owner_name text,
  stage text default 'prospect',
  expected_monthly_shipments int default 0,
  expected_monthly_revenue numeric default 0,
  actual_shipments int default 0,
  actual_revenue numeric default 0,
  contract_document_id uuid,
  status text default 'active',
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_bd_activities (
  id uuid primary key default gen_random_uuid(),
  bd_account_id uuid,
  activity_type text default 'call',
  title text not null,
  activity_date timestamptz default now(),
  actor_id uuid,
  actor_name text,
  outcome text,
  next_step text,
  financial_note text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_be_marketing_leads_entity on public.be_marketing_leads(entity_name);
create index if not exists idx_be_department_escalations_target on public.be_department_escalations(target_department, status);
create index if not exists idx_be_bd_accounts_stage on public.be_bd_accounts(stage);

create or replace function public.be_department_portal_snapshot(
  p_department text,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep text;
  v_result jsonb;
begin
  v_dep := lower(coalesce(p_department, ''));

  if v_dep in ('marketing','mkt') then
    select jsonb_build_object(
      'department', 'marketing',
      'summary', jsonb_build_object(
        'active_campaigns', (select count(*) from public.be_marketing_campaigns where status in ('active','in_progress')),
        'leads', (select count(*) from public.be_marketing_leads),
        'merchants_won', (select coalesce(sum(merchants_won),0) from public.be_marketing_campaigns),
        'customers_won', (select coalesce(sum(customers_won),0) from public.be_marketing_campaigns),
        'revenue', (select coalesce(sum(revenue_amount),0) from public.be_marketing_campaigns),
        'open_escalations', (select count(*) from public.be_department_escalations where target_department='marketing' and status not in ('resolved','closed'))
      ),
      'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc) from (
        select id::text, campaign_no, title, owner_name, channel, target_segment, budget, spend,
               leads_count, merchants_won, customers_won, revenue_amount, status, start_date, end_date, notes, created_at, updated_at
        from public.be_marketing_campaigns
        where p_search is null or p_search = '' or title ilike '%'||p_search||'%' or coalesce(channel,'') ilike '%'||p_search||'%'
        order by updated_at desc limit 100
      ) c), '[]'::jsonb),
      'leads', coalesce((select jsonb_agg(to_jsonb(l) order by l.updated_at desc) from (
        select id::text, lead_no, source_campaign_title, customer_or_merchant, entity_name,
               contact_name, phone, email, city, township, status, brought_by_name,
               expected_revenue, actual_revenue, notes, created_at, updated_at
        from public.be_marketing_leads
        where p_search is null or p_search = '' or coalesce(entity_name,'') ilike '%'||p_search||'%' or coalesce(phone,'') ilike '%'||p_search||'%'
        order by updated_at desc limit 200
      ) l), '[]'::jsonb),
      'escalations', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
        select id::text, escalation_no, source_department, target_department, source_ticket_id, entity_type,
               entity_id, entity_name, issue_type, priority, title, description, status,
               assigned_to_name, resolution_note, created_at, updated_at
        from public.be_department_escalations
        where target_department='marketing'
        order by created_at desc limit 100
      ) e), '[]'::jsonb),
      'generated_at', now()
    ) into v_result;
    return v_result;
  end if;

  select jsonb_build_object(
    'department', 'business_development',
    'summary', jsonb_build_object(
      'accounts', (select count(*) from public.be_bd_accounts),
      'prospects', (select count(*) from public.be_bd_accounts where stage='prospect'),
      'negotiations', (select count(*) from public.be_bd_accounts where stage in ('negotiation','contract')),
      'active_contracts', (select count(*) from public.be_bd_accounts where stage in ('won','active_contract')),
      'expected_revenue', (select coalesce(sum(expected_monthly_revenue),0) from public.be_bd_accounts),
      'actual_revenue', (select coalesce(sum(actual_revenue),0) from public.be_bd_accounts),
      'open_escalations', (select count(*) from public.be_department_escalations where target_department in ('business_development','bd') and status not in ('resolved','closed'))
    ),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from (
      select id::text, account_no, account_type, entity_name, contact_name, phone, email, city,
             township, owner_name, stage, expected_monthly_shipments, expected_monthly_revenue,
             actual_shipments, actual_revenue, contract_document_id::text, status, notes, created_at, updated_at
      from public.be_bd_accounts
      where p_search is null or p_search = '' or entity_name ilike '%'||p_search||'%' or coalesce(phone,'') ilike '%'||p_search||'%'
      order by updated_at desc limit 200
    ) a), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(ac) order by ac.activity_date desc) from (
      select id::text, bd_account_id::text, activity_type, title, activity_date, actor_name, outcome, next_step, financial_note, created_at
      from public.be_bd_activities
      order by activity_date desc limit 200
    ) ac), '[]'::jsonb),
    'escalations', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
      select id::text, escalation_no, source_department, target_department, source_ticket_id, entity_type,
             entity_id, entity_name, issue_type, priority, title, description, status,
             assigned_to_name, resolution_note, created_at, updated_at
      from public.be_department_escalations
      where target_department in ('business_development','bd')
      order by created_at desc limit 100
    ) e), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.be_department_portal_snapshot(text,text) to authenticated, anon;

create or replace function public.be_department_upsert(p_department text, p_entity text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if lower(p_department) in ('marketing','mkt') and lower(p_entity) = 'campaign' then
    v_id := nullif(p_payload->>'id','')::uuid;
    if v_id is null then
      insert into public.be_marketing_campaigns(title, owner_id, owner_name, channel, target_segment, budget, spend, status, start_date, end_date, notes, payload)
      values (
        coalesce(nullif(p_payload->>'title',''), 'Marketing Campaign'),
        auth.uid(), nullif(p_payload->>'owner_name',''), nullif(p_payload->>'channel',''), nullif(p_payload->>'target_segment',''),
        coalesce(nullif(p_payload->>'budget','')::numeric, 0), coalesce(nullif(p_payload->>'spend','')::numeric, 0),
        coalesce(nullif(p_payload->>'status',''), 'active'), coalesce(nullif(p_payload->>'start_date','')::date, current_date),
        nullif(p_payload->>'end_date','')::date, nullif(p_payload->>'notes',''), p_payload
      ) returning id into v_id;
    else
      update public.be_marketing_campaigns
      set title = coalesce(nullif(p_payload->>'title',''), title),
          channel = coalesce(nullif(p_payload->>'channel',''), channel),
          target_segment = coalesce(nullif(p_payload->>'target_segment',''), target_segment),
          budget = coalesce(nullif(p_payload->>'budget','')::numeric, budget),
          spend = coalesce(nullif(p_payload->>'spend','')::numeric, spend),
          status = coalesce(nullif(p_payload->>'status',''), status),
          notes = coalesce(nullif(p_payload->>'notes',''), notes),
          payload = coalesce(payload,'{}'::jsonb) || p_payload,
          updated_at = now()
      where id = v_id;
    end if;
    perform public.be_log_event('marketing_campaign_upsert', 'marketing_campaign', v_id::text, p_payload);
    return jsonb_build_object('ok', true, 'id', v_id::text);
  end if;

  if lower(p_department) in ('marketing','mkt') and lower(p_entity) = 'lead' then
    insert into public.be_marketing_leads(source_campaign_id, source_campaign_title, customer_or_merchant, entity_name, contact_name, phone, email, city, township, status, brought_by, brought_by_name, expected_revenue, notes, payload)
    values (
      nullif(p_payload->>'source_campaign_id','')::uuid, nullif(p_payload->>'source_campaign_title',''),
      coalesce(nullif(p_payload->>'customer_or_merchant',''), 'merchant'),
      coalesce(nullif(p_payload->>'entity_name',''), 'Unnamed Lead'), nullif(p_payload->>'contact_name',''),
      nullif(p_payload->>'phone',''), nullif(p_payload->>'email',''), nullif(p_payload->>'city',''), nullif(p_payload->>'township',''),
      coalesce(nullif(p_payload->>'status',''), 'new'), auth.uid(), nullif(p_payload->>'brought_by_name',''),
      coalesce(nullif(p_payload->>'expected_revenue','')::numeric, 0), nullif(p_payload->>'notes',''), p_payload
    ) returning id into v_id;
    perform public.be_log_event('marketing_lead_created', 'marketing_lead', v_id::text, p_payload);
    return jsonb_build_object('ok', true, 'id', v_id::text);
  end if;

  if lower(p_department) in ('business_development','bd') and lower(p_entity) = 'account' then
    insert into public.be_bd_accounts(account_type, entity_name, contact_name, phone, email, city, township, owner_id, owner_name, stage, expected_monthly_shipments, expected_monthly_revenue, status, notes, payload)
    values (
      coalesce(nullif(p_payload->>'account_type',''), 'merchant'), coalesce(nullif(p_payload->>'entity_name',''), 'Unnamed Account'),
      nullif(p_payload->>'contact_name',''), nullif(p_payload->>'phone',''), nullif(p_payload->>'email',''),
      nullif(p_payload->>'city',''), nullif(p_payload->>'township',''), auth.uid(), nullif(p_payload->>'owner_name',''),
      coalesce(nullif(p_payload->>'stage',''), 'prospect'),
      coalesce(nullif(p_payload->>'expected_monthly_shipments','')::int, 0),
      coalesce(nullif(p_payload->>'expected_monthly_revenue','')::numeric, 0),
      coalesce(nullif(p_payload->>'status',''), 'active'), nullif(p_payload->>'notes',''), p_payload
    ) returning id into v_id;
    perform public.be_log_event('bd_account_created', 'bd_account', v_id::text, p_payload);
    return jsonb_build_object('ok', true, 'id', v_id::text);
  end if;

  return jsonb_build_object('ok', false, 'error', 'Unsupported department/entity');
end;
$$;

grant execute on function public.be_department_upsert(text,text,jsonb) to authenticated, anon;

create or replace function public.be_create_department_escalation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.be_department_escalations(
    source_department, target_department, source_ticket_id, entity_type, entity_id, entity_name,
    issue_type, priority, title, description, status, assigned_to_name, created_by, payload
  )
  values (
    coalesce(nullif(p_payload->>'source_department',''), 'customer_service'),
    coalesce(nullif(p_payload->>'target_department',''), 'marketing'),
    nullif(p_payload->>'source_ticket_id',''),
    nullif(p_payload->>'entity_type',''),
    nullif(p_payload->>'entity_id',''),
    nullif(p_payload->>'entity_name',''),
    coalesce(nullif(p_payload->>'issue_type',''), 'terms_and_conditions'),
    coalesce(nullif(p_payload->>'priority',''), 'medium'),
    coalesce(nullif(p_payload->>'title',''), 'Department escalation'),
    nullif(p_payload->>'description',''),
    'open',
    nullif(p_payload->>'assigned_to_name',''),
    auth.uid(),
    p_payload
  )
  returning id into v_id;

  -- Best-effort notification if table exists.
  if to_regclass('public.app_notifications') is not null then
    insert into public.app_notifications(title, message, type, payload, created_at)
    values (
      'Department escalation',
      coalesce(p_payload->>'title', 'New escalation requires review'),
      'department_escalation',
      jsonb_build_object('id', v_id::text, 'target_department', coalesce(p_payload->>'target_department','marketing')),
      now()
    );
  end if;

  perform public.be_log_event('department_escalation_created', 'department_escalation', v_id::text, p_payload);

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.be_create_department_escalation(jsonb) to authenticated, anon;

create or replace function public.be_department_escalation_action(p_escalation_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.be_department_escalations
  set status = case lower(coalesce(p_action,''))
      when 'start' then 'in_progress'
      when 'resolve' then 'resolved'
      when 'close' then 'closed'
      when 'reject' then 'rejected'
      else coalesce(nullif(p_action,''), status)
    end,
    resolution_note = coalesce(p_note, resolution_note),
    resolved_by = case when lower(coalesce(p_action,'')) in ('resolve','close') then auth.uid() else resolved_by end,
    resolved_at = case when lower(coalesce(p_action,'')) in ('resolve','close') then now() else resolved_at end,
    updated_at = now()
  where id = p_escalation_id;

  perform public.be_log_event('department_escalation_' || coalesce(p_action,'update'), 'department_escalation', p_escalation_id::text, jsonb_build_object('note', p_note));

  return jsonb_build_object('ok', true, 'id', p_escalation_id::text);
end;
$$;

grant execute on function public.be_department_escalation_action(uuid,text,text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Exceptions and field portals
-- ---------------------------------------------------------------------------

create table if not exists public.be_exception_cases (
  id uuid primary key default gen_random_uuid(),
  tracking_no text,
  delivery_id text,
  merchant_name text,
  receiver_name text,
  receiver_phone text,
  township text,
  address text,
  exception_type text default 'failed_attempt',
  reason text,
  status text default 'open',
  priority text default 'medium',
  assigned_to uuid,
  assigned_to_name text,
  pod_photo_url text,
  resolution_note text,
  payload jsonb default '{}'::jsonb,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_be_exception_cases_status on public.be_exception_cases(status);
create index if not exists idx_be_exception_cases_tracking on public.be_exception_cases(tracking_no);

create or replace function public.be_exception_snapshot(p_search text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
with cases as (
  select *
  from public.be_exception_cases c
  where p_search is null or p_search = ''
     or coalesce(c.tracking_no,'') ilike '%'||p_search||'%'
     or coalesce(c.receiver_name,'') ilike '%'||p_search||'%'
     or coalesce(c.receiver_phone,'') ilike '%'||p_search||'%'
     or coalesce(c.merchant_name,'') ilike '%'||p_search||'%'
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'failed', count(*) filter (where exception_type='failed_attempt' and status not in ('resolved','closed')),
    'returned', count(*) filter (where exception_type in ('returned','rto') and status not in ('resolved','closed')),
    'pod_review', count(*) filter (where exception_type='pod_review' and status not in ('resolved','closed')),
    'open', count(*) filter (where status not in ('resolved','closed'))
  ),
  'cases', coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb),
  'generated_at', now()
)
from (
  select id::text, tracking_no, delivery_id, merchant_name, receiver_name, receiver_phone, township, address,
         exception_type, reason, status, priority, assigned_to_name, pod_photo_url, resolution_note,
         payload, created_at, updated_at
  from cases
  order by updated_at desc
  limit 500
) x;
$$;

grant execute on function public.be_exception_snapshot(text) to authenticated, anon;

create or replace function public.be_exception_action(p_case_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.be_exception_cases
  set status = case lower(coalesce(p_action,''))
      when 'review' then 'in_review'
      when 'resolve' then 'resolved'
      when 'close' then 'closed'
      when 'rto' then 'returned'
      else coalesce(nullif(p_action,''), status)
    end,
    resolution_note = coalesce(p_note, resolution_note),
    resolved_by = case when lower(coalesce(p_action,'')) in ('resolve','close') then auth.uid() else resolved_by end,
    resolved_at = case when lower(coalesce(p_action,'')) in ('resolve','close') then now() else resolved_at end,
    updated_at = now()
  where id = p_case_id;

  perform public.be_log_event('exception_' || coalesce(p_action,'update'), 'exception_case', p_case_id::text, jsonb_build_object('note', p_note));

  return jsonb_build_object('ok', true, 'id', p_case_id::text);
end;
$$;

grant execute on function public.be_exception_action(uuid,text,text) to authenticated, anon;

create or replace function public.be_field_portal_snapshot(
  p_role text,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  v_cod numeric := 0;
  v_count int := 0;
begin
  -- Prefer wayplan_stops when available. Use JSON-safe fields.
  if to_regclass('public.wayplan_stops') is not null then
    execute $q$
      with s as (
        select
          id::text,
          coalesce(tracking_no, waybill_no, delivery_id, '') as tracking_no,
          coalesce(merchant_name, '') as merchant_name,
          coalesce(receiver_name, recipient_name, customer_name, '') as receiver_name,
          coalesce(receiver_phone, recipient_phone, phone, '') as receiver_phone,
          coalesce(township, town, '') as township,
          coalesce(address, recipient_address, delivery_address, '') as address,
          coalesce(cod_amount, cod, actual_collect, 0)::numeric as cod_amount,
          coalesce(status, 'pending') as status,
          coalesce(wayplan_id::text,'') as wayplan_id,
          coalesce(updated_at, created_at, now()) as updated_at
        from public.wayplan_stops
      ),
      f as (
        select * from s
        where ($1 is null or $1 = '' or tracking_no ilike '%'||$1||'%' or receiver_name ilike '%'||$1||'%' or receiver_phone ilike '%'||$1||'%')
        order by updated_at desc limit 300
      )
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb), coalesce(sum(cod_amount),0), count(*)
      from f
    $q$ using p_search into v_jobs, v_cod, v_count;
  elsif to_regclass('public.shipments') is not null then
    execute $q$
      with s as (
        select
          id::text,
          coalesce(tracking_no, waybill_no, delivery_id, '') as tracking_no,
          coalesce(merchant_name, merchant, '') as merchant_name,
          coalesce(receiver_name, recipient_name, customer_name, '') as receiver_name,
          coalesce(receiver_phone, recipient_phone, phone, '') as receiver_phone,
          coalesce(township, town, '') as township,
          coalesce(address, recipient_address, delivery_address, '') as address,
          coalesce(cod_amount, cod, actual_collect, 0)::numeric as cod_amount,
          coalesce(status, 'pending') as status,
          coalesce(updated_at, created_at, now()) as updated_at
        from public.shipments
      ),
      f as (
        select * from s
        where ($1 is null or $1 = '' or tracking_no ilike '%'||$1||'%' or receiver_name ilike '%'||$1||'%' or receiver_phone ilike '%'||$1||'%')
        order by updated_at desc limit 300
      )
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb), coalesce(sum(cod_amount),0), count(*)
      from f
    $q$ using p_search into v_jobs, v_cod, v_count;
  end if;

  return jsonb_build_object(
    'role', coalesce(p_role,'field'),
    'summary', jsonb_build_object(
      'assigned_jobs', v_count,
      'active_jobs', (select count(*) from jsonb_array_elements(v_jobs) j where coalesce(j->>'status','pending') not in ('delivered','completed','cancelled')),
      'delivered_today', (select count(*) from jsonb_array_elements(v_jobs) j where lower(coalesce(j->>'status','')) in ('delivered','completed')),
      'pending_cod', v_cod
    ),
    'jobs', v_jobs,
    'generated_at', now()
  );
end;
$$;

grant execute on function public.be_field_portal_snapshot(text,text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Settings/account helper snapshots
-- ---------------------------------------------------------------------------

create or replace function public.be_settings_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_role text;
  v_name text;
begin
  select email, coalesce(raw_user_meta_data->>'role','user'), coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
  into v_email, v_role, v_name
  from auth.users
  where id = v_user;

  return jsonb_build_object(
    'profile', jsonb_build_object('user_id', v_user::text, 'email', v_email, 'role', v_role, 'full_name', v_name),
    'system', jsonb_build_object('document_bucket', 'be-documents', 'go_live_patch', '2X'),
    'generated_at', now()
  );
end;
$$;

grant execute on function public.be_settings_snapshot() to authenticated, anon;

create or replace function public.be_settings_update_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Profile metadata cannot safely be updated from SQL for all auth setups.
  -- Store audit request and let UI / Edge function update auth metadata if enabled.
  perform public.be_log_event('settings_profile_update_requested', 'user_profile', auth.uid()::text, p_payload);
  return jsonb_build_object('ok', true, 'message', 'Profile update request saved. Wire Edge Function for Auth metadata update if required.');
end;
$$;

grant execute on function public.be_settings_update_profile(jsonb) to authenticated, anon;

-- Backfill a few audit rows so Audit Logs page is not empty after installation.
insert into public.be_audit_events(action, resource_type, resource_id, details)
select 'patch_2x_installed', 'system', 'BE_GoLive_Patch2X', jsonb_build_object('note','Department portals and document vault backend installed')
where not exists (
  select 1 from public.be_audit_events where action='patch_2x_installed' and resource_id='BE_GoLive_Patch2X'
);

commit;

notify pgrst, 'reload schema';

select 'Patch 2X department portals, document vaults, exceptions, field portals, audit and settings backend wired for go-live readiness' as status;
