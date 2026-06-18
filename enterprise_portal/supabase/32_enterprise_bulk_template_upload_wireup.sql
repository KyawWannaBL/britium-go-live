create extension if not exists pgcrypto;

create table if not exists public.be_bulk_upload_batches (
  id uuid default gen_random_uuid(),
  template_code text,
  inbound_source text,
  branch_code text,
  warehouse_code text,
  workflow_status text,
  source_filename text,
  uploaded_by_email text,
  row_count integer default 0,
  status text default 'staged',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_bulk_upload_batches
  add column if not exists id uuid,
  add column if not exists template_code text,
  add column if not exists inbound_source text,
  add column if not exists branch_code text,
  add column if not exists warehouse_code text,
  add column if not exists workflow_status text,
  add column if not exists source_filename text,
  add column if not exists uploaded_by_email text,
  add column if not exists row_count integer default 0,
  add column if not exists status text default 'staged',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_bulk_upload_batches
set id = gen_random_uuid()
where id is null;

alter table public.be_bulk_upload_batches
  alter column id set default gen_random_uuid();

create unique index if not exists be_bulk_upload_batches_id_uidx
on public.be_bulk_upload_batches(id);

create table if not exists public.be_bulk_upload_rows (
  id uuid default gen_random_uuid(),
  batch_id uuid,
  template_code text,
  row_index integer,
  row_payload jsonb default '{}'::jsonb,
  row_status text default 'staged',
  validation_errors jsonb default '[]'::jsonb,
  source_filename text,
  created_by_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_bulk_upload_rows
  add column if not exists id uuid,
  add column if not exists batch_id uuid,
  add column if not exists template_code text,
  add column if not exists row_index integer,
  add column if not exists row_payload jsonb default '{}'::jsonb,
  add column if not exists row_status text default 'staged',
  add column if not exists validation_errors jsonb default '[]'::jsonb,
  add column if not exists source_filename text,
  add column if not exists created_by_email text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_bulk_upload_rows
set id = gen_random_uuid()
where id is null;

alter table public.be_bulk_upload_rows
  alter column id set default gen_random_uuid();

create unique index if not exists be_bulk_upload_rows_id_uidx
on public.be_bulk_upload_rows(id);

alter table if exists public.be_bulk_upload_rows
  drop constraint if exists be_bulk_upload_rows_batch_id_fkey;

alter table if exists public.be_bulk_upload_rows
  drop constraint if exists be_bulk_upload_rows_batch_id_fk;

create index if not exists be_bulk_upload_rows_batch_id_idx
on public.be_bulk_upload_rows(batch_id);

create index if not exists be_bulk_upload_rows_template_code_idx
on public.be_bulk_upload_rows(template_code);

create index if not exists be_bulk_upload_batches_template_code_idx
on public.be_bulk_upload_batches(template_code);

create or replace function public.be_bulk_upload_save_rows(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_template_code text := coalesce(p_payload->>'template_code', 'unknown');
  v_inbound_source text := coalesce(p_payload->>'inbound_source', '');
  v_branch_code text := coalesce(p_payload->>'branch_code', '');
  v_warehouse_code text := coalesce(p_payload->>'warehouse_code', '');
  v_workflow_status text := coalesce(p_payload->>'workflow_status', '');
  v_source_filename text := coalesce(p_payload->>'source_filename', '');
  v_uploaded_by_email text := coalesce(p_payload->>'uploaded_by_email', '');
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_row_count integer := 0;
begin
  if jsonb_typeof(v_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  v_row_count := jsonb_array_length(v_rows);

  insert into public.be_bulk_upload_batches (
    id,
    template_code,
    inbound_source,
    branch_code,
    warehouse_code,
    workflow_status,
    source_filename,
    uploaded_by_email,
    row_count,
    status,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_batch_id,
    v_template_code,
    v_inbound_source,
    v_branch_code,
    v_warehouse_code,
    v_workflow_status,
    v_source_filename,
    v_uploaded_by_email,
    v_row_count,
    'staged',
    coalesce(p_payload->'metadata', '{}'::jsonb),
    now(),
    now()
  );

  insert into public.be_bulk_upload_rows (
    id,
    batch_id,
    template_code,
    row_index,
    row_payload,
    row_status,
    validation_errors,
    source_filename,
    created_by_email,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    v_batch_id,
    v_template_code,
    x.rn::integer,
    x.value,
    'staged',
    '[]'::jsonb,
    v_source_filename,
    v_uploaded_by_email,
    now(),
    now()
  from jsonb_array_elements(v_rows) with ordinality as x(value, rn);

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'template_code', v_template_code,
    'row_count', v_row_count,
    'status', 'staged'
  );
end;
$$;

grant execute on function public.be_bulk_upload_save_rows(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
