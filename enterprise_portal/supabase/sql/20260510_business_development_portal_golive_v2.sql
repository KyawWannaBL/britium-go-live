-- Business Development Manager Portal Go-Live Backend v2
-- Backend-wired for Enterprise Portal.
-- Active test upload code: FULL-PICKUP-LIST-20260508
-- Run in Supabase SQL Editor.

create table if not exists public.be_bd_accounts (
  id uuid primary key default gen_random_uuid(),
  account_no text unique,
  entity_name text not null,
  account_type text not null default 'Merchant',
  contact_name text,
  phone text,
  stage text not null default 'prospect',
  expected_monthly_revenue numeric not null default 0,
  actual_revenue numeric not null default 0,
  status text not null default 'Review',
  volume_trend text not null default '0%',
  source text default 'bd_portal',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_bd_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  spend numeric not null default 0,
  leads integer not null default 0,
  converted integer not null default 0,
  status text not null default 'requested',
  requested_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_bd_cs_activities (
  id uuid primary key default gen_random_uuid(),
  ticket_no text unique,
  type text not null default 'Query',
  merchant text,
  issue text,
  status text not null default 'pending',
  activity_time timestamptz not null default now(),
  created_by text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_bd_audit_events (
  id bigserial primary key,
  event_type text not null,
  entity_type text,
  entity_id text,
  actor text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.be_large_shipment_rows
add column if not exists data_entry_status text default 'draft',
add column if not exists picker_status text default 'pending',
add column if not exists evidence_status text default 'pending',
add column if not exists ground_proof_status text default 'pending',
add column if not exists sender_approval_status text default 'pending';

create index if not exists idx_be_bd_accounts_stage on public.be_bd_accounts(stage);
create index if not exists idx_be_bd_campaigns_created on public.be_bd_marketing_campaigns(created_at desc);
create index if not exists idx_be_bd_cs_status on public.be_bd_cs_activities(status, activity_time desc);

insert into public.be_bd_accounts (
  account_no, entity_name, account_type, contact_name, phone, stage,
  expected_monthly_revenue, actual_revenue, status, volume_trend, source
)
values
  ('BD-001', 'Make My Day', 'Merchant', 'Ma Phyo', '09-785743740', 'active', 1200000, 1150000, 'Healthy', '+12%', 'seed'),
  ('BD-002', 'Alnoor Store', 'Merchant', 'Ko Bo Bo', '09-789693593', 'negotiation', 800000, 0, 'Review', '0%', 'seed'),
  ('BD-003', 'နွယ် Fashion', 'Merchant', 'နွယ် Fashion', '', 'active', 1800000, 0, 'Healthy', '+0%', 'go_live_test')
on conflict (account_no) do update set
  entity_name = excluded.entity_name,
  updated_at = now();

insert into public.be_bd_marketing_campaigns (
  campaign, spend, leads, converted, status, requested_by, notes
)
values
  ('Viber Blast May', 450000, 28, 5, 'completed', 'system', 'Imported from pre-go-live dashboard.'),
  ('Merchant Tier Rewards', 1200000, 15, 12, 'active', 'system', 'Imported from pre-go-live dashboard.'),
  ('SME Referral Program', 200000, 42, 8, 'active', 'system', 'Imported from pre-go-live dashboard.')
on conflict do nothing;

insert into public.be_bd_cs_activities (
  ticket_no, type, merchant, issue, status, activity_time, created_by
)
values
  ('TK-4401', 'Complaint', 'Noble White', 'Damaged Parcel', 'investigating', now() - interval '1 hour', 'system'),
  ('TK-4402', 'Request', 'Alnoor Store', 'Custom Rate Request', 'resolved', now() - interval '3 hours', 'system'),
  ('TK-4403', 'Query', 'Baby Genius', 'COD Remittance Clarification', 'pending', now() - interval '5 minutes', 'system')
on conflict (ticket_no) do update set
  status = excluded.status,
  updated_at = now();

create or replace function public.be_bd_business_snapshot(
  p_search text default null,
  p_lang text default 'en'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_code text := 'FULL-PICKUP-LIST-20260508';
  v_summary jsonb;
  v_campaigns jsonb := '[]'::jsonb;
  v_cs jsonb := '[]'::jsonb;
  v_accounts jsonb := '[]'::jsonb;
  v_funnel jsonb;
  v_strategic_note text;
  v_total integer := 0;
  v_picked integer := 0;
  v_registered integer := 0;
  v_wayplanned integer := 0;
  v_dispatched integer := 0;
  v_delivered integer := 0;
  v_expected_revenue numeric := 0;
  v_actual_revenue numeric := 0;
  v_campaign_spend numeric := 0;
  v_converted integer := 0;
  v_leads integer := 0;
  v_roi numeric := 0;
  v_cs_total integer := 0;
  v_cs_resolved integer := 0;
begin
  select
    count(*)::integer,
    count(*) filter (where coalesce(picker_status, '') in ('picked', 'accepted'))::integer,
    count(*) filter (where coalesce(data_entry_status, '') in ('saved', 'uploaded', 'finalized', 'edited'))::integer,
    count(*) filter (where coalesce(ground_proof_status, '') in ('completed', 'picked'))::integer
  into v_total, v_picked, v_registered, v_dispatched
  from public.be_large_shipment_rows
  where upload_code = v_upload_code;

  if to_regclass('public.be_wayplan_items') is not null then
    execute
      'select count(*) from public.be_wayplan_items where upload_code = $1'
    into v_wayplanned
    using v_upload_code;
  else
    v_wayplanned := 0;
  end if;

  if to_regclass('public.shipments') is not null then
    execute
      'select count(*) from public.shipments s
       where exists (
         select 1 from public.be_large_shipment_rows r
         where r.upload_code = $1 and r.tracking_no = s.tracking_no
       )
       and lower(coalesce(s.status, '''')) = ''delivered'''
    into v_delivered
    using v_upload_code;
  else
    v_delivered := 0;
  end if;

  select
    coalesce(sum(expected_monthly_revenue), 0),
    coalesce(sum(actual_revenue), 0)
  into v_expected_revenue, v_actual_revenue
  from public.be_bd_accounts;

  select
    coalesce(sum(spend), 0),
    coalesce(sum(leads), 0),
    coalesce(sum(converted), 0)
  into v_campaign_spend, v_leads, v_converted
  from public.be_bd_marketing_campaigns;

  if v_campaign_spend > 0 then
    v_roi := greatest(1, round(((v_converted::numeric * 500000) / v_campaign_spend), 1));
  else
    v_roi := 0;
  end if;

  select
    count(*)::integer,
    count(*) filter (where lower(status) = 'resolved')::integer
  into v_cs_total, v_cs_resolved
  from public.be_bd_cs_activities
  where activity_time >= now() - interval '30 days';

  v_summary := jsonb_build_object(
    'accounts', (select count(*) from public.be_bd_accounts),
    'prospects', (select count(*) from public.be_bd_accounts where stage in ('prospect', 'negotiation')),
    'marketing_roi', coalesce(v_roi::text || 'x', '0x'),
    'active_contracts', (select count(*) from public.be_bd_accounts where stage = 'active'),
    'expected_revenue', v_expected_revenue,
    'actual_revenue', v_actual_revenue,
    'delivery_success', case when v_total > 0 then round(((greatest(v_delivered, v_dispatched)::numeric / v_total) * 100), 1)::text || '%' else '0%' end,
    'cs_resolution_rate', case when v_cs_total > 0 then round(((v_cs_resolved::numeric / v_cs_total) * 100), 1)::text || '%' else '0%' end,
    'active_upload_code', v_upload_code,
    'active_test_rows', v_total
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_campaigns
  from (
    select
      id::text,
      campaign,
      spend,
      leads,
      converted,
      case when spend > 0 then round(((converted::numeric * 500000) / spend), 1)::text || 'x' else '0x' end as roi,
      status,
      created_at
    from public.be_bd_marketing_campaigns
    where p_search is null
      or campaign ilike '%' || p_search || '%'
      or status ilike '%' || p_search || '%'
    order by created_at desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.activity_time desc), '[]'::jsonb)
  into v_cs
  from (
    select
      id::text,
      ticket_no,
      type,
      merchant,
      issue,
      status,
      case
        when activity_time >= now() - interval '1 hour' then extract(minute from now() - activity_time)::integer::text || ' mins ago'
        when activity_time >= now() - interval '24 hours' then extract(hour from now() - activity_time)::integer::text || ' hrs ago'
        else to_char(activity_time, 'YYYY-MM-DD HH24:MI')
      end as time,
      activity_time
    from public.be_bd_cs_activities
    where p_search is null
      or ticket_no ilike '%' || p_search || '%'
      or merchant ilike '%' || p_search || '%'
      or issue ilike '%' || p_search || '%'
    order by activity_time desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.account_no), '[]'::jsonb)
  into v_accounts
  from (
    select
      id::text,
      account_no,
      entity_name,
      account_type,
      contact_name,
      phone,
      stage,
      expected_monthly_revenue,
      actual_revenue,
      status,
      volume_trend
    from public.be_bd_accounts
    where p_search is null
      or account_no ilike '%' || p_search || '%'
      or entity_name ilike '%' || p_search || '%'
      or phone ilike '%' || p_search || '%'
      or stage ilike '%' || p_search || '%'
    order by account_no
    limit 100
  ) x;

  v_funnel := jsonb_build_array(
    jsonb_build_object('label_en','Pickups','label_my','အကြိုပို့','val',v_total,'color','bg-indigo-500'),
    jsonb_build_object('label_en','Picked','label_my','ကောက်ယူပြီး','val',v_picked,'color','bg-indigo-400'),
    jsonb_build_object('label_en','Registered','label_my','စာရင်းသွင်း','val',greatest(v_registered, v_total),'color','bg-blue-500'),
    jsonb_build_object('label_en','Wayplanned','label_my','လမ်းကြောင်း','val',v_wayplanned,'color','bg-blue-400'),
    jsonb_build_object('label_en','Dispatch Ready','label_my','ပို့ဆောင်ရန်','val',greatest(v_dispatched, v_wayplanned),'color','bg-emerald-500'),
    jsonb_build_object('label_en','Delivered','label_my','ရောက်ရှိ','val',v_delivered,'color','bg-emerald-600')
  );

  v_strategic_note := case
    when p_lang = 'my' then
      'Go-live scope ကို 8.5.2026 pick up list1.xlsx ဖြင့်သာ စစ်ဆေးနေပါသည်။ နွယ် Fashion အပါအဝင် active pickup batches များကို Operations, CS, Marketing နှင့် BD pipeline တွင်ချိတ်ဆက်ထားပြီး old 1,725 rows ကို temporary closed/job done အဖြစ် ဖယ်ထားပါသည်။'
    else
      'Go-live scope is limited to 8.5.2026 pick up list1.xlsx. Active pickup batches, including နွယ် Fashion, are synchronized across Operations, CS, Marketing, and BD pipeline while old 1,725 rows remain temporarily closed/job done.'
  end;

  return jsonb_build_object(
    'ok', true,
    'summary', v_summary,
    'marketing_reports', v_campaigns,
    'cs_activities', v_cs,
    'accounts', v_accounts,
    'funnel', v_funnel,
    'strategic_note', v_strategic_note,
    'generated_at', now()
  );
end;
$$;

create or replace function public.be_bd_register_account(
  p_entity_name text,
  p_contact_name text default null,
  p_phone text default null,
  p_stage text default 'prospect',
  p_expected_monthly_revenue numeric default 0,
  p_notes text default null,
  p_created_by text default 'bd_manager'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_no text;
  v_id uuid;
begin
  if p_entity_name is null or btrim(p_entity_name) = '' then
    raise exception 'Entity / merchant name is required.';
  end if;

  v_account_no := 'BD-' || lpad(nextval(pg_get_serial_sequence('public.be_bd_audit_events','id'))::text, 5, '0');

  insert into public.be_bd_accounts (
    account_no,
    entity_name,
    account_type,
    contact_name,
    phone,
    stage,
    expected_monthly_revenue,
    actual_revenue,
    status,
    volume_trend,
    source,
    notes
  )
  values (
    v_account_no,
    p_entity_name,
    'Merchant',
    p_contact_name,
    p_phone,
    coalesce(nullif(p_stage, ''), 'prospect'),
    coalesce(p_expected_monthly_revenue, 0),
    0,
    'Review',
    '0%',
    'bd_portal',
    p_notes
  )
  returning id into v_id;

  insert into public.be_bd_audit_events(event_type, entity_type, entity_id, actor, payload)
  values (
    'bd_account_registered',
    'bd_account',
    v_id::text,
    p_created_by,
    jsonb_build_object('account_no', v_account_no, 'entity_name', p_entity_name)
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'account_no', v_account_no);
end;
$$;

create or replace function public.be_bd_create_campaign_request(
  p_campaign text,
  p_spend numeric default 0,
  p_notes text default null,
  p_requested_by text default 'bd_manager'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_campaign is null or btrim(p_campaign) = '' then
    raise exception 'Campaign name is required.';
  end if;

  insert into public.be_bd_marketing_campaigns(campaign, spend, leads, converted, status, requested_by, notes)
  values (p_campaign, coalesce(p_spend, 0), 0, 0, 'requested', p_requested_by, p_notes)
  returning id into v_id;

  insert into public.be_bd_audit_events(event_type, entity_type, entity_id, actor, payload)
  values (
    'bd_campaign_requested',
    'marketing_campaign',
    v_id::text,
    p_requested_by,
    jsonb_build_object('campaign', p_campaign, 'spend', p_spend)
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'requested');
end;
$$;

create or replace function public.be_bd_register_cs_activity(
  p_type text,
  p_merchant text,
  p_issue text,
  p_status text default 'pending',
  p_created_by text default 'bd_manager'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ticket_no text;
begin
  v_ticket_no := 'TK-BD-' || to_char(now(), 'MMDD') || '-' || lpad((extract(epoch from clock_timestamp())::bigint % 100000)::text, 5, '0');

  insert into public.be_bd_cs_activities(ticket_no, type, merchant, issue, status, created_by)
  values (
    v_ticket_no,
    coalesce(nullif(p_type, ''), 'Query'),
    p_merchant,
    p_issue,
    coalesce(nullif(p_status, ''), 'pending'),
    p_created_by
  )
  returning id into v_id;

  insert into public.be_bd_audit_events(event_type, entity_type, entity_id, actor, payload)
  values (
    'bd_cs_activity_registered',
    'cs_activity',
    v_id::text,
    p_created_by,
    jsonb_build_object('ticket_no', v_ticket_no, 'merchant', p_merchant, 'issue', p_issue)
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'ticket_no', v_ticket_no);
end;
$$;

create or replace function public.be_bd_monthly_business_report(
  p_month date default date_trunc('month', now())::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  v_snapshot := public.be_bd_business_snapshot(null, 'en');

  return jsonb_build_object(
    'ok', true,
    'report_month', p_month,
    'title', 'Monthly Business Review',
    'snapshot', v_snapshot,
    'generated_at', now()
  );
end;
$$;

grant execute on function public.be_bd_business_snapshot(text, text) to anon, authenticated;
grant execute on function public.be_bd_register_account(text, text, text, text, numeric, text, text) to anon, authenticated;
grant execute on function public.be_bd_create_campaign_request(text, numeric, text, text) to anon, authenticated;
grant execute on function public.be_bd_register_cs_activity(text, text, text, text, text) to anon, authenticated;
grant execute on function public.be_bd_monthly_business_report(date) to anon, authenticated;

notify pgrst, 'reload schema';
