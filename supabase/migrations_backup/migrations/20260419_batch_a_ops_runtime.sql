create extension if not exists pgcrypto;

create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff_master(id) on delete cascade,
  category text not null default 'workflow',
  title_en text not null,
  title_mm text not null,
  body_en text not null,
  body_mm text not null,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.data_entry_uploads (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  file_path text not null,
  content_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_staff_id uuid references public.staff_master(id) on delete set null,
  status text not null default 'uploaded' check (status in ('uploaded','processing','processed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_entry_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null unique,
  description text,
  template_schema jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_data_entry_templates_updated_at on public.data_entry_templates;
create trigger trg_data_entry_templates_updated_at
before update on public.data_entry_templates
for each row execute function public.set_updated_at();

alter table public.ops_notifications enable row level security;
alter table public.data_entry_uploads enable row level security;
alter table public.data_entry_templates enable row level security;

drop policy if exists "ops_notifications_select_authenticated" on public.ops_notifications;
create policy "ops_notifications_select_authenticated" on public.ops_notifications
for select to authenticated
using (true);

drop policy if exists "ops_notifications_write_authenticated" on public.ops_notifications;
create policy "ops_notifications_write_authenticated" on public.ops_notifications
for all to authenticated
using (true)
with check (true);

drop policy if exists "data_entry_uploads_select_authenticated" on public.data_entry_uploads;
create policy "data_entry_uploads_select_authenticated" on public.data_entry_uploads
for select to authenticated
using (true);

drop policy if exists "data_entry_uploads_write_authenticated" on public.data_entry_uploads;
create policy "data_entry_uploads_write_authenticated" on public.data_entry_uploads
for all to authenticated
using (true)
with check (true);

drop policy if exists "data_entry_templates_select_authenticated" on public.data_entry_templates;
create policy "data_entry_templates_select_authenticated" on public.data_entry_templates
for select to authenticated
using (true);

drop policy if exists "data_entry_templates_write_authenticated" on public.data_entry_templates;
create policy "data_entry_templates_write_authenticated" on public.data_entry_templates
for all to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values
  ('ops-photos', 'ops-photos', false),
  ('ops-signatures', 'ops-signatures', false),
  ('data-entry-files', 'data-entry-files', false)
on conflict (id) do nothing;

drop policy if exists "ops_photos_select_authenticated" on storage.objects;
create policy "ops_photos_select_authenticated" on storage.objects
for select to authenticated
using (bucket_id = 'ops-photos');

drop policy if exists "ops_photos_insert_authenticated" on storage.objects;
create policy "ops_photos_insert_authenticated" on storage.objects
for insert to authenticated
with check (bucket_id = 'ops-photos');

drop policy if exists "ops_photos_update_authenticated" on storage.objects;
create policy "ops_photos_update_authenticated" on storage.objects
for update to authenticated
using (bucket_id = 'ops-photos')
with check (bucket_id = 'ops-photos');

drop policy if exists "ops_signatures_select_authenticated" on storage.objects;
create policy "ops_signatures_select_authenticated" on storage.objects
for select to authenticated
using (bucket_id = 'ops-signatures');

drop policy if exists "ops_signatures_insert_authenticated" on storage.objects;
create policy "ops_signatures_insert_authenticated" on storage.objects
for insert to authenticated
with check (bucket_id = 'ops-signatures');

drop policy if exists "ops_signatures_update_authenticated" on storage.objects;
create policy "ops_signatures_update_authenticated" on storage.objects
for update to authenticated
using (bucket_id = 'ops-signatures')
with check (bucket_id = 'ops-signatures');

drop policy if exists "data_entry_files_select_authenticated" on storage.objects;
create policy "data_entry_files_select_authenticated" on storage.objects
for select to authenticated
using (bucket_id = 'data-entry-files');

drop policy if exists "data_entry_files_insert_authenticated" on storage.objects;
create policy "data_entry_files_insert_authenticated" on storage.objects
for insert to authenticated
with check (bucket_id = 'data-entry-files');

create index if not exists idx_ops_notifications_staff_id on public.ops_notifications(staff_id, is_read, created_at desc);
create index if not exists idx_data_entry_uploads_status on public.data_entry_uploads(status, created_at desc);
