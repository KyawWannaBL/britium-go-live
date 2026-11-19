#!/usr/bin/env bash
# Issue #299: private recovery of ordered historical SQL statement arrays.
# Read-only database access. Never commit the recovered JSON to public Git.
set -euo pipefail
umask 077

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo 'SUPABASE_DB_URL must come from an approved secure credential store.' >&2
  exit 2
fi
if [[ $# -ne 1 ]]; then
  echo 'Usage: bash scripts/export-private-migration-snapshots.sh /secure/private/directory' >&2
  exit 2
fi
command -v psql >/dev/null || { echo 'PostgreSQL psql client required.' >&2; exit 2; }
command -v node >/dev/null || { echo 'Node.js client required.' >&2; exit 2; }
command -v stat >/dev/null || { echo 'GNU stat required (Linux only).'; exit 2; }

out_dir="$1"
if [[ -L "$out_dir" ]]; then
  echo 'Refusing to export to a symlink directory.' >&2
  exit 2
fi
mkdir -p -m 700 -- "$out_dir"
if [[ ! -d "$out_dir" || ! -O "$out_dir" ]]; then
  echo 'Export destination must be a directory owned by the current user.' >&2
  exit 2
fi
# Avoid leaking SQL via shared pre-existing directories.
mode="$(stat -c %a -- "$out_dir")"
if (( (8#$mode & 0077) != 0 )); then
  echo 'Destination directory is accessible to group/other; use a private chmod 700 directory.' >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
versions=(20260412000000 20260721093501)
for version in "${versions[@]}"; do
  target="${out_dir%/}/${version}-statements.json"
  if [[ -e "$target" || -L "$target" ]]; then
    echo "Refusing to overwrite an existing private export: $target" >&2
    exit 1
  fi
done

tmp_files=()
cleanup() {
  for tmp in "${tmp_files[@]}"; do
    [[ -n "$tmp" ]] && rm -f -- "$tmp"
  done
}
trap cleanup EXIT HUP INT TERM

# Export/verify BOTH snapshots before publishing any file.
for version in "${versions[@]}"; do
  tmp="$(mktemp "${out_dir%/}/.${version}.XXXXXXXX")"
  tmp_files+=("$tmp")
  # PGDATABASE accepts libpq connection strings. Never pass the URL as an argv
  # parameter, and force read-only transactions as defense in depth.
  if ! PGDATABASE="$SUPABASE_DB_URL" \
       PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on" \
       psql -X -q -w -v ON_ERROR_STOP=1 -t -A -P pager=off \
       -c "SELECT array_to_json(statements) FROM supabase_migrations.schema_migrations WHERE version = '${version}'" \
       > "$tmp"; then
    echo "Private read-only SQL export failed for ${version}" >&2
    exit 1
  fi
  if ! node "$script_dir/verify-private-migration-export.mjs" "$version" "$tmp"; then
    echo "Fingerprint mismatch for ${version}; no export will be published." >&2
    exit 1
  fi
done

# GNU ln -T fails if destination exists, including dangling symlinks.
published=()
rollback_published() {
  for target in "${published[@]}"; do rm -f -- "$target"; done
}
for i in "${!versions[@]}"; do
  target="${out_dir%/}/${versions[$i]}-statements.json"
  if ! ln -T -- "${tmp_files[$i]}" "$target"; then
    rollback_published
    echo 'Could not safely publish both verified private exports.' >&2
    exit 1
  fi
  published+=("$target")
done
for i in "${!versions[@]}"; do
  chmod 600 -- "${published[$i]}"
done
echo 'Both private migration exports verified and saved. Never upload raw SQL to public Git.'
echo 'Security review and complete isolated replay are still required.'
