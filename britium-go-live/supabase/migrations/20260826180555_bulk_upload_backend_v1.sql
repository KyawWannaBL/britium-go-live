-- BRITIUM_BULK_UPLOAD_BACKEND_V1_20260827
-- Authenticated, owner-scoped staging backend for Data Entry and Warehouse uploads.

begin;
create table if not exists public.be_bulk_upload_batches (
  batch_id uuid primary key default gen_random_uuid(),
  module_code text not null check (module_code in ('DATA_ENTRY','WAREHOUSE')),
  source_name text not null,
  source_file_name text,
  uploaded_by uuid not null default auth.uid(),
  uploaded_by_email text,
  row_count integer not null default 0 check (row_count >= 0),
  status text not null default 'STAGED' check (status in ('STAGED','PROCESSING','COMPLETED','REJECTED')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.be_bulk_upload_rows (
  row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.be_bulk_upload_batches(batch_id) on delete cascade,
  module_code text not null check (module_code in ('DATA_ENTRY','WAREHOUSE')),
  source_row_no integer not null check (source_row_no > 0),
  template_key text,
  payload jsonb not null,
  validation_status text not null default 'VALID' check (validation_status in ('VALID','REJECTED')),
  validation_errors jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);
alter table public.be_bulk_upload_batches add column if not exists uploaded_by uuid, add column if not exists created_at timestamptz default now();
create index if not exists be_bulk_upload_batches_owner_created_idx
  on public.be_bulk_upload_batches(uploaded_by, created_at desc);
alter table public.be_bulk_upload_rows add column if not exists batch_id uuid, add column if not exists source_row_no integer default 1;
create index if not exists be_bulk_upload_rows_batch_idx
  on public.be_bulk_upload_rows(batch_id, source_row_no);
-- COMPLETE LEGACY SCHEMA COMPATIBILITY
alter table public.be_bulk_upload_batches add column if not exists module_code text default 'DATA_ENTRY', add column if not exists source_name text default 'LEGACY_UPLOAD', add column if not exists source_file_name text, add column if not exists uploaded_by uuid, add column if not exists uploaded_by_email text, add column if not exists row_count integer default 0, add column if not exists status text default 'STAGED', add column if not exists result jsonb default '{}'::jsonb, add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now();
alter table public.be_bulk_upload_rows add column if not exists row_id uuid default gen_random_uuid(), add column if not exists batch_id uuid, add column if not exists module_code text default 'DATA_ENTRY', add column if not exists source_row_no integer default 1, add column if not exists template_key text, add column if not exists payload jsonb default '{}'::jsonb, add column if not exists validation_status text default 'VALID', add column if not exists validation_errors jsonb default '[]'::jsonb, add column if not exists created_by uuid, add column if not exists created_at timestamptz default now();
alter table public.be_bulk_upload_batches enable row level security;
alter table public.be_bulk_upload_rows enable row level security;
drop policy if exists be_bulk_upload_batches_select_own on public.be_bulk_upload_batches;
create policy be_bulk_upload_batches_select_own
on public.be_bulk_upload_batches for select to authenticated
using ((select auth.uid()) = uploaded_by);
drop policy if exists be_bulk_upload_batches_insert_own on public.be_bulk_upload_batches;
create policy be_bulk_upload_batches_insert_own
on public.be_bulk_upload_batches for insert to authenticated
with check ((select auth.uid()) = uploaded_by);
drop policy if exists be_bulk_upload_rows_select_own on public.be_bulk_upload_rows;
create policy be_bulk_upload_rows_select_own
on public.be_bulk_upload_rows for select to authenticated
using (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.be_bulk_upload_batches b
    where b.batch_id = be_bulk_upload_rows.batch_id
      and b.uploaded_by = (select auth.uid())
  )
);
drop policy if exists be_bulk_upload_rows_insert_own on public.be_bulk_upload_rows;
create policy be_bulk_upload_rows_insert_own
on public.be_bulk_upload_rows for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.be_bulk_upload_batches b
    where b.batch_id = be_bulk_upload_rows.batch_id
      and b.uploaded_by = (select auth.uid())
  )
);
revoke all on public.be_bulk_upload_batches from anon;
revoke all on public.be_bulk_upload_rows from anon;
grant select, insert on public.be_bulk_upload_batches to authenticated;
grant select, insert on public.be_bulk_upload_rows to authenticated;
create or replace function public.be_stage_bulk_upload(
  p_module text,
  p_rows jsonb,
  p_source text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_module text := upper(trim(coalesce(p_module,'')));
  v_source text := left(trim(coalesce(p_source,'ACTIVE_SCREEN_BULK_UPLOAD')), 160);
  v_count integer;
  v_batch uuid;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'Authenticated session is required';
  end if;
  if v_module not in ('DATA_ENTRY','WAREHOUSE') then
    raise exception using errcode = '22023', message = 'Unsupported bulk upload module';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'p_rows must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 then raise exception using errcode = '22023', message = 'At least one row is required'; end if;
  if v_count > 5000 then raise exception using errcode = '54000', message = 'Maximum 5000 rows per batch'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) <> 'object') then
    raise exception using errcode = '22023', message = 'Every upload row must be a JSON object';
  end if;

  insert into public.be_bulk_upload_batches(module_code, source_name, uploaded_by, uploaded_by_email, row_count)
  values (v_module, v_source, v_user, v_email, v_count)
  returning batch_id into v_batch;

  insert into public.be_bulk_upload_rows(batch_id, module_code, source_row_no, template_key, payload, created_by)
  select
    v_batch,
    v_module,
    coalesce(nullif(e.value ->> 'source_row_no','')::integer, e.ordinality::integer),
    nullif(e.value ->> 'template_key',''),
    coalesce(e.value -> 'payload', e.value),
    v_user
  from jsonb_array_elements(p_rows) with ordinality as e(value, ordinality);

  return jsonb_build_object('ok',true,'batch_id',v_batch,'module',v_module,'row_count',v_count,'status','STAGED');
end;
$$;
create or replace function public.be_go_live_bulk_data_entry_upload(p_rows jsonb, p_source text)
returns jsonb language sql security invoker set search_path = public, pg_temp
as $$ select public.be_stage_bulk_upload('DATA_ENTRY', p_rows, p_source); $$;
create or replace function public.be_go_live_warehouse_inventory_upload(p_rows jsonb, p_source text)
returns jsonb language sql security invoker set search_path = public, pg_temp
as $$ select public.be_stage_bulk_upload('WAREHOUSE', p_rows, p_source); $$;
revoke all on function public.be_stage_bulk_upload(text,jsonb,text) from public, anon;
revoke all on function public.be_go_live_bulk_data_entry_upload(jsonb,text) from public, anon;
revoke all on function public.be_go_live_warehouse_inventory_upload(jsonb,text) from public, anon;
grant execute on function public.be_stage_bulk_upload(text,jsonb,text) to authenticated;
grant execute on function public.be_go_live_bulk_data_entry_upload(jsonb,text) to authenticated;
grant execute on function public.be_go_live_warehouse_inventory_upload(jsonb,text) to authenticated;
commit;
