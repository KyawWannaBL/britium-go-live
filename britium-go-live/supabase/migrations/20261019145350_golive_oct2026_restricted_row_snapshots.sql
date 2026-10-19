create table private.be_golive_oct2026_row_snapshots (
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
