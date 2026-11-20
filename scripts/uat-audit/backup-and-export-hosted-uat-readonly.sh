#!/bin/sh
# Britium Express hosted UAT recovery preflight. NO REMOTE WRITES.
# For use on an operator-controlled workstation with PostgreSQL pg_dump/pg_restore.
# Required: UAT_DATABASE_URL (admin read-only backup connection if possible)
# Required: PROD_READONLY_DATABASE_URL (SELECT/schema read privileges).
# SQL schema exports and backups are sensitive. NEVER upload to public GitHub.
set -eu
umask 077

die() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || die 'Install PostgreSQL pg_dump'
command -v pg_restore >/dev/null 2>&1 || die 'Install PostgreSQL pg_restore'
command -v psql >/dev/null 2>&1 || die 'Install PostgreSQL psql'
[ -n "${UAT_DATABASE_URL:-}" ] || die 'Set UAT_DATABASE_URL securely in your shell'
[ -n "${PROD_READONLY_DATABASE_URL:-}" ] || die 'Set PROD_READONLY_DATABASE_URL securely in your shell'
[ "$UAT_DATABASE_URL" != "$PROD_READONLY_DATABASE_URL" ] || die 'Refusing identical production and UAT URLs'

# A real backup is mandatory BEFORE considering any hosted-UAT schema mutation.
root="${1:-local-recovery}"
[ ! -e "$root" ] || die "Output directory already exists; refusing overwrite: $root"
mkdir -p "$root" || die 'Cannot create output directory'
chmod 700 "$root"
abort() { printf '%s\n' 'Recovery export failed; retaining files for inspection only.' >&2; exit 1; }
trap abort 1 2 3 15
printf '%s\n' 'Verifying target identity without printing connection strings ...'
prod_identifier="$(psql "$PROD_READONLY_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations) || ':' || (to_regclass('public.be_waybill_ledger') IS NOT NULL)::text")" || die 'Production preflight query failed'
uat_identifier="$(psql "$UAT_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations) || ':' || (to_regclass('public.be_waybill_ledger') IS NOT NULL)::text")" || die 'Hosted UAT preflight query failed'
# Guard only the specifically known setup; stop on drift.
case "$prod_identifier" in *:true) : ;; *) die 'Source does not appear to be production' ;; esac
case "$uat_identifier" in *:false) : ;; *) die 'Destination does not appear to be missing hosted-UAT schema' ;; esac
echo "Production version marker: $prod_identifier; hosted UAT version marker: $uat_identifier"

# Both dumps are READS. Do not expose database URL values in command output.
echo 'Backing up hosted UAT full database (including auth configuration) ...'
pg_dump "$UAT_DATABASE_URL" --format=custom --no-owner --file="$root/hosted-uat-full-before-recovery.dump" || die 'UAT full backup failed'
[ -s "$root/hosted-uat-full-before-recovery.dump" ] || die 'UAT backup empty'
pg_restore --list "$root/hosted-uat-full-before-recovery.dump" > "$root/hosted-uat-backup-toc.txt" || die 'Backup archive integrity check failed'

echo 'Exporting source production schema without customer/financial rows ...'
pg_dump "$PROD_READONLY_DATABASE_URL" --schema-only --no-owner --no-acl --schema=public --schema=private --file="$root/production-public-private-schema.sql" || die 'Production schema export failed'
echo 'Exporting hosted UAT schema without customer/financial rows ...'
pg_dump "$UAT_DATABASE_URL" --schema-only --no-owner --no-acl --schema=public --schema=private --file="$root/hosted-uat-public-private-schema.sql" || die 'Hosted UAT schema export failed'
echo 'Recording migration history identifiers ONLY (no migration SQL or user rows) ...'
psql "$PROD_READONLY_DATABASE_URL" -X -q -A -F ',' -v ON_ERROR_STOP=1 -c "SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version" > "$root/production-migration-versions.csv" || die 'Production migration inventory failed'
psql "$UAT_DATABASE_URL" -X -q -A -F ',' -v ON_ERROR_STOP=1 -c "SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version" > "$root/hosted-uat-migration-versions.csv" || die 'UAT migration inventory failed'
echo 'Verifying existing hosted UAT auth/account counts ...'
psql "$UAT_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT 'auth_users='||(SELECT count(*) FROM auth.users)||';registered_accounts='||(SELECT count(*) FROM public.be_user_account_registry)" > "$root/hosted-uat-account-counts.txt" || die 'Account count query failed'
# Check contents without exposing them to GitHub. No restore or SQL write follows.
for file in "$root"/*.sql "$root"/*.csv "$root"/*.txt; do [ -s "$file" ] || die "Empty export: $file"; done
printf '%s\n' 'READ-ONLY preflight complete. No remote database was changed.'
printf '%s\n' "Keep the entire $root directory secure. Never commit, attach or upload the full backup, schema SQL, connection URLs, or raw auth data."
printf '%s\n' 'The next phase is offline reconciliation and restore rehearsal, NOT an automatic production/UAT overwrite.'
