#!/usr/bin/env bash
# Issue #299: private recovery of ordered historical SQL statements.
# READS Production migration history only. Never commit generated JSON to Git.
set -euo pipefail
umask 077
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo 'Set SUPABASE_DB_URL via your secure local credential manager.' >&2
  exit 2
fi
if [[ $# -ne 1 ]]; then
  echo 'Usage: bash scripts/export-private-migration-snapshots.sh /secure/local/directory' >&2
  exit 2
fi
out_dir="$1"
mkdir -p -- "$out_dir"
if [[ ! -d "$out_dir" || -L "$out_dir" ]]; then
  echo 'Export destination must be a real directory, not a symlink.' >&2
  exit 2
fi
command -v psql >/dev/null || { echo 'PostgreSQL psql client required.' >&2; exit 2; }
command -v node >/dev/null || { echo 'Node.js client required.' >&2; exit 2; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for version in 20260412000000 20260721093501; do
  target="${out_dir%/}/${version}-statements.json"
  if [[ -e "$target" ]]; then
    echo "Refusing to overwrite existing private export: $target" >&2
    exit 1
  fi
  tmp="$(mktemp "${out_dir%/}/.${version}.XXXXXXXX")"
  trap 'rm -f -- "${tmp:-}"' EXIT
  # A single SELECT returns JSON (unlike COPY text mode, which escapes backslashes).
  # Never print SQL contents in logs. URL is passed as environment, not process argument.
  if ! PGDATABASE="$SUPABASE_DB_URL" psql -X -q -w -v ON_ERROR_STOP=1 \
    -t -A -P pager=off -c "SELECT array_to_json(statements) FROM supabase_migrations.schema_migrations WHERE version = '${version}'" \
    > "$tmp"; then
    echo "Private export failed for ${version}" >&2
    exit 1
  fi
  if ! node "$script_dir/verify-private-migration-export.mjs" "$version" "$tmp"; then
    echo "Fingerprint mismatch for ${version}; private temporary file deleted." >&2
    exit 1
  fi
  # Hard-link creation fails if destination already exists; avoids accidental overwrite.
  ln -- "$tmp" "$target"
  rm -f -- "$tmp"
  trap - EXIT
  chmod 600 -- "$target"
  echo "Private export validated: ${version} ($target)"
done
printf '%s\n' 'Private files verified. Review for secrets before replay; never upload raw SQL to public GitHub.'
