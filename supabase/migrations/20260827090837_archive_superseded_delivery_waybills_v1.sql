create table if not exists public.be_delivery_waybills_isolation_archive (
  archive_id uuid primary key default gen_random_uuid(),
  original_id uuid not null unique,
  isolated_at timestamptz not null default now(),
  isolated_by text not null,
  isolation_reason text not null,
  replacement_bulk_batch_id uuid,
  row_snapshot jsonb not null
);
alter table public.be_delivery_waybills_isolation_archive enable row level security;
revoke all on table public.be_delivery_waybills_isolation_archive from anon, authenticated;
comment on table public.be_delivery_waybills_isolation_archive is
'Recoverable snapshots removed from the active Waybill List when superseded by an approved Data Entry upload.';;
