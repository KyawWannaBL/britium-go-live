begin;

create table public.be_accounting_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_scope text not null,
  period_from date null,
  period_to date null,
  status text not null default 'RUNNING'
    check (status in ('RUNNING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED')),
  scanned_count integer not null default 0 check (scanned_count>=0),
  synced_count integer not null default 0 check (synced_count>=0),
  skipped_count integer not null default 0 check (skipped_count>=0),
  failed_count integer not null default 0 check (failed_count>=0),
  started_by uuid null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);
create index be_accounting_sync_runs_scope_started_idx
on public.be_accounting_sync_runs(source_scope,started_at desc);

create table public.be_accounting_sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.be_accounting_sync_runs(id) on delete cascade,
  source_system text not null,
  source_table text not null,
  source_record_id text null,
  event_type text null,
  error_code text null,
  error_message text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index be_accounting_sync_errors_run_idx
on public.be_accounting_sync_errors(sync_run_id,created_at);

create table public.be_accounting_mappings (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  mapping_version text not null,
  debit_account_code text not null,
  credit_account_code text not null,
  provider_code text null,
  branch_code text null,
  effective_from date not null default date '2000-01-01',
  effective_to date null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    event_type,
    mapping_version,
    debit_account_code,
    credit_account_code,
    provider_code,
    branch_code,
    effective_from
  ),
  check (effective_to is null or effective_to>=effective_from)
);
create index be_accounting_mappings_lookup_idx
on public.be_accounting_mappings(event_type,is_active,effective_from,effective_to);

alter table public.be_accounting_sync_runs enable row level security;
alter table public.be_accounting_sync_errors enable row level security;
alter table public.be_accounting_mappings enable row level security;

revoke all on public.be_accounting_sync_runs from public,anon,authenticated;
revoke all on public.be_accounting_sync_errors from public,anon,authenticated;
revoke all on public.be_accounting_mappings from public,anon,authenticated;
grant all on public.be_accounting_sync_runs to service_role;
grant all on public.be_accounting_sync_errors to service_role;
grant all on public.be_accounting_mappings to service_role;

create or replace function public.be_accounting_upsert_event_v1(
  p_source_system text,
  p_source_table text,
  p_source_record_id text,
  p_event_type text,
  p_accounting_version text,
  p_event_date date,
  p_description text,
  p_currency_code text,
  p_total_amount numeric,
  p_source_snapshot jsonb,
  p_input_fingerprint text,
  p_review_status text default 'REVIEW_PENDING',
  p_source_updated_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_source_system text := upper(btrim(coalesce(p_source_system,'')));
  v_source_table text := lower(btrim(coalesce(p_source_table,'')));
  v_source_record_id text := btrim(coalesce(p_source_record_id,''));
  v_event_type text := upper(btrim(coalesce(p_event_type,'')));
  v_version text := upper(btrim(coalesce(p_accounting_version,'')));
  v_currency text := upper(btrim(coalesce(p_currency_code,'MMK')));
  v_status text := upper(btrim(coalesce(p_review_status,'REVIEW_PENDING')));
  v_link public.be_accounting_source_links%rowtype;
  v_event public.be_accounting_events%rowtype;
  v_event_id uuid;
  v_amount numeric(18,2) := coalesce(p_total_amount,0);
begin
  if v_source_system='' or v_source_table='' or v_source_record_id=''
     or v_event_type='' or v_version='' then
    return jsonb_build_object('ok',false,'code','SOURCE_IDENTITY_REQUIRED');
  end if;

  if p_event_date is null then
    return jsonb_build_object('ok',false,'code','EVENT_DATE_REQUIRED');
  end if;

  if nullif(btrim(coalesce(p_input_fingerprint,'')),'') is null then
    return jsonb_build_object('ok',false,'code','FINGERPRINT_REQUIRED');
  end if;

  if v_amount<0 then
    return jsonb_build_object('ok',false,'code','NEGATIVE_TOTAL_NOT_ALLOWED');
  end if;

  if v_status not in ('DRAFT','REVIEW_PENDING','APPROVED','NEEDS_REVIEW','HELD','REJECTED','SYNC_FAILED') then
    return jsonb_build_object('ok',false,'code','INVALID_REVIEW_STATUS','status',v_status);
  end if;

  select *
  into v_link
  from public.be_accounting_source_links
  where source_system=v_source_system
    and source_table=v_source_table
    and source_record_id=v_source_record_id
    and event_type=v_event_type
    and accounting_version=v_version
  for update;

  if found then
    select *
    into v_event
    from public.be_accounting_events
    where id=v_link.event_id
    for update;

    if v_link.input_fingerprint=p_input_fingerprint then
      return jsonb_build_object(
        'ok',true,
        'code','UNCHANGED',
        'created',false,
        'changed',false,
        'event_id',v_link.event_id,
        'journal_id',v_link.journal_id
      );
    end if;

    if v_link.journal_id is not null
       or v_event.review_status in ('POSTED','REVERSED') then
      return jsonb_build_object(
        'ok',true,
        'code','SOURCE_CHANGED_AFTER_POSTING',
        'created',false,
        'changed',true,
        'event_id',v_link.event_id,
        'journal_id',coalesce(v_link.journal_id,v_event.posted_journal_id),
        'old_fingerprint',v_link.input_fingerprint,
        'new_fingerprint',p_input_fingerprint
      );
    end if;

    update public.be_accounting_events
    set event_date=p_event_date,
        description=p_description,
        currency_code=v_currency,
        total_amount=v_amount,
        review_status=v_status,
        source_snapshot=coalesce(p_source_snapshot,'{}'::jsonb),
        input_fingerprint=p_input_fingerprint,
        metadata=coalesce(p_metadata,'{}'::jsonb),
        updated_at=now()
    where id=v_link.event_id;

    update public.be_accounting_source_links
    set input_fingerprint=p_input_fingerprint,
        source_updated_at=p_source_updated_at,
        metadata=coalesce(p_metadata,'{}'::jsonb),
        updated_at=now()
    where id=v_link.id;

    return jsonb_build_object(
      'ok',true,
      'code','UPDATED_PENDING_EVENT',
      'created',false,
      'changed',true,
      'event_id',v_link.event_id
    );
  end if;

  v_event_id := gen_random_uuid();

  insert into public.be_accounting_events(
    id,
    event_date,
    source_system,
    source_table,
    source_record_id,
    source_reference,
    event_type,
    accounting_version,
    description,
    currency_code,
    total_amount,
    review_status,
    source_snapshot,
    input_fingerprint,
    created_by,
    metadata
  ) values (
    v_event_id,
    p_event_date,
    v_source_system,
    v_source_table,
    v_source_record_id,
    nullif(btrim(coalesce(p_source_snapshot->>'source_reference','')),''),
    v_event_type,
    v_version,
    p_description,
    v_currency,
    v_amount,
    v_status,
    coalesce(p_source_snapshot,'{}'::jsonb),
    p_input_fingerprint,
    auth.uid(),
    coalesce(p_metadata,'{}'::jsonb)
  );

  insert into public.be_accounting_source_links(
    source_system,
    source_table,
    source_record_id,
    event_type,
    accounting_version,
    input_fingerprint,
    event_id,
    source_updated_at,
    metadata
  ) values (
    v_source_system,
    v_source_table,
    v_source_record_id,
    v_event_type,
    v_version,
    p_input_fingerprint,
    v_event_id,
    p_source_updated_at,
    coalesce(p_metadata,'{}'::jsonb)
  );

  return jsonb_build_object(
    'ok',true,
    'code','CREATED',
    'created',true,
    'changed',false,
    'event_id',v_event_id
  );
end;
$$;

revoke all on function public.be_accounting_upsert_event_v1(
  text,text,text,text,text,date,text,text,numeric,jsonb,text,text,timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.be_accounting_upsert_event_v1(
  text,text,text,text,text,date,text,text,numeric,jsonb,text,text,timestamptz,jsonb
) to service_role;

comment on function public.be_accounting_upsert_event_v1(
  text,text,text,text,text,date,text,text,numeric,jsonb,text,text,timestamptz,jsonb
) is
  'Idempotent accounting-event ingestion helper. Pending events may refresh; posted history is never overwritten and source drift is surfaced explicitly.';

commit;
