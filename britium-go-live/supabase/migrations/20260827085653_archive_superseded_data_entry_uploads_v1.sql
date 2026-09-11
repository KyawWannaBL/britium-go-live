create table if not exists public.be_bulk_upload_isolation_archive (
  archive_id uuid primary key default gen_random_uuid(),
  isolated_at timestamptz not null default now(),
  isolated_by text not null,
  isolation_reason text not null,
  active_replacement_batch_id uuid,
  source_record_type text not null check (source_record_type in ('BATCH','ROW')),
  source_batch_id uuid,
  source_row_id uuid,
  source_payload jsonb not null,
  unique (source_record_type, source_batch_id, source_row_id)
);
create index if not exists be_bulk_upload_isolation_archive_batch_idx
  on public.be_bulk_upload_isolation_archive(source_batch_id, source_record_type);
alter table public.be_bulk_upload_isolation_archive enable row level security;
revoke all on table public.be_bulk_upload_isolation_archive from anon, authenticated;
comment on table public.be_bulk_upload_isolation_archive is
  'Recoverable snapshots of superseded bulk-upload batches and rows isolated from active processing.';;
