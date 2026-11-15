#!/bin/sh
# Issue 308: export historical migration SQL from a READ-ONLY connection.
# This does not write to any database. It writes one local, potentially sensitive file.
set -eu
if [ "${1:-}" = "" ]; then
  echo "Usage: PROD_READONLY_DATABASE_URL=... sh scripts/uat-audit/export-historical-snapshot.sh /secure/path/20260721093501_remote_schema.sql" >&2
  exit 2
fi
if [ "${PROD_READONLY_DATABASE_URL:-}" = "" ]; then
  echo "Set PROD_READONLY_DATABASE_URL for a database role with SELECT-only privileges" >&2
  exit 2
fi
out=$1
if [ -e "$out" ]; then
  echo "Refusing to overwrite existing output: $out" >&2
  exit 2
fi
umask 077
# COPY TO STDOUT writes to client output, not any server-side path.
# No INSERT/UPDATE/DELETE or migration history modifications.
if ! psql "$PROD_READONLY_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 \
  -c "COPY (
    SELECT array_to_string(statements, E';\\n\\n') || E';\\n'
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260721093501'
  ) TO STDOUT" > "$out"; then
  rm -f "$out"
  echo "Export failed; no output file retained" >&2
  exit 1
fi
if [ ! -s "$out" ]; then
  rm -f "$out"
  echo "No SQL exported; check permissions/version" >&2
  exit 1
fi
echo "Historical snapshot exported to a private local file. DO NOT COMMIT OR UPLOAD THIS FILE."
