-- Bootstrap the existing manifest prerequisites here because their original migration sorts later.
-- October 2026 go-live: archive manifest schema only.
-- Does not select, update, archive, or delete operational records.
-- An executable cutover procedure requires separate approval and testing.
create schema if not exists private;

create table if not exists private.be_golive_oct2026_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  cutoff_at timestamptz not null default '2026-10-19 17:30:00+00',
  status text not null default 'PREPARING'
    check (status in ('PREPARING','REVIEW_REQUIRED','VERIFIED','BLOCKED','ARCHIVED','ROLLED_BACK')),
  scope_digest text,
  protected_digest text,
  total_candidate_rows bigint not null default 0 check(total_candidate_rows >= 0),
  financial_reconciliation jsonb not null default '{}'::jsonb,
  storage_reconciliation jsonb not null default '{}'::jsonb,
  review_notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint oct2026_cutoff_fixed check (cutoff_at = '2026-10-19 17:30:00+00'::timestamptz)
);

create table if not exists private.be_golive_oct2026_manifest_rows (
  manifest_id uuid not null references private.be_golive_oct2026_manifests(manifest_id),
  source_schema text not null,
  source_table text not null,
  source_key text not null,
  source_created_at timestamptz,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  archive_object_path text,
  scope_reason text not null,
  financial_exception boolean not null default false,
  primary key(manifest_id,source_schema,source_table,source_key)
);

create table if not exists private.be_golive_oct2026_storage_evidence (
  manifest_id uuid not null references private.be_golive_oct2026_manifests(manifest_id),
  bucket_id text not null,
  original_object_path text not null,
  archive_object_path text,
  content_sha256 text,
  verified boolean not null default false,
  primary key(manifest_id,bucket_id,original_object_path)
);

revoke all on private.be_golive_oct2026_manifests from public,anon,authenticated;
revoke all on private.be_golive_oct2026_manifest_rows from public,anon,authenticated;
revoke all on private.be_golive_oct2026_storage_evidence from public,anon,authenticated;

comment on table private.be_golive_oct2026_manifests is
  'October cutover review metadata only. No archive, deletion, or activation behavior.';

create table if not exists private.be_golive_oct2026_row_snapshots (
 manifest_id uuid not null,
 source_schema text not null,
 source_table text not null,
 source_key text not null,
 row_data jsonb not null check(jsonb_typeof(row_data)='object'),
 snapshot_sha256 text not null,
 captured_at timestamptz not null default transaction_timestamp(),
 primary key(manifest_id,source_schema,source_table,source_key),
 foreign key(manifest_id,source_schema,source_table,source_key)
 references private.be_golive_oct2026_manifest_rows(manifest_id,source_schema,source_table,source_key),
 check(snapshot_sha256=encode(extensions.digest(row_data::text,'sha256'),'hex'))
);
alter table private.be_golive_oct2026_row_snapshots enable row level security;
revoke all on private.be_golive_oct2026_row_snapshots from public,anon,authenticated;
comment on table private.be_golive_oct2026_row_snapshots is
 'Restricted candidate transaction payload copies. Not an independent backup, storage-object backup, or isolation activation. No client access.';
