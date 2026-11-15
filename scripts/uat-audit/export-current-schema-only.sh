#!/bin/sh
# Issue #308: local secure production-schema export, READ-ONLY on database.
# Requires postgres client pg_dump. No customer/transaction rows are exported.
# NEVER commit/upload resulting SQL to public GitHub.
set -eu
if [ -z "${PROD_READONLY_DATABASE_URL:-}" ] || [ "${1:-}" = "" ]; then
  echo "Usage: PROD_READONLY_DATABASE_URL='postgres://...' sh scripts/uat-audit/export-current-schema-only.sh /secure/private/uat-schema-only.sql" >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed; install matching PostgreSQL client version." >&2
  exit 2
fi
out=$1
if [ -e "$out" ]; then
  echo "Refusing to overwrite output $out" >&2
  exit 2
fi
umask 077
if ! pg_dump "$PROD_READONLY_DATABASE_URL" \
  --schema-only --no-owner --no-privileges \
  --schema=public --schema=private \
  --file="$out"; then
  rm -f "$out"
  echo "Schema-only export failed" >&2
  exit 1
fi
if [ ! -s "$out" ]; then
  rm -f "$out"
  echo "Empty schema export" >&2
  exit 1
fi
echo "Private schema-only export created at $out; no production data rows copied."
echo "Review DDL for security-definer functions, internal policies, and secrets before any sharing."
