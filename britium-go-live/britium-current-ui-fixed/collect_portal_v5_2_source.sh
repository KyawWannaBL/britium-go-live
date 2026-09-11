#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"
ROOT_ABS="$(pwd -P)"
STAMP="$(date +%Y%m%d_%H%M%S)"
WORK="portal_v5_2_source_${STAMP}"
ARCHIVE="${WORK}.tgz"

rm -rf "$WORK"
mkdir -p "$WORK/meta" "$WORK/source"

printf '%s\n' "$ROOT_ABS" > "$WORK/meta/repository_root.txt"
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$WORK/meta/collected_at_utc.txt"
node -v > "$WORK/meta/node_version.txt" 2>&1 || true
npm -v > "$WORK/meta/npm_version.txt" 2>&1 || true

git status --short > "$WORK/meta/git_status.txt" 2>&1 || true
git branch --show-current > "$WORK/meta/git_branch.txt" 2>&1 || true
git rev-parse HEAD > "$WORK/meta/git_head.txt" 2>&1 || true
git diff --no-ext-diff > "$WORK/meta/git_diff.patch" 2>&1 || true

# Never collect secrets or generated dependency/build directories.
find . -type f \
  ! -path './node_modules/*' \
  ! -path './dist/*' \
  ! -path './.git/*' \
  ! -path './.vercel/*' \
  ! -path './production_backups/*' \
  ! -path './backups/*' \
  ! -path './backup/*' \
  ! -path './coverage/*' \
  ! -path './.cache/*' \
  ! -path './.vite/*' \
  ! -name '.env' \
  ! -name '.env.*' \
  ! -name '*.tgz' \
  ! -name '*.zip' \
  \( \
    -path './src/*' -o \
    -path './public/*' -o \
    -path './migrations/*' -o \
    -path './supabase/migrations/*' -o \
    -name 'package.json' -o \
    -name 'package-lock.json' -o \
    -name 'npm-shrinkwrap.json' -o \
    -name 'vite.config.*' -o \
    -name 'tsconfig*.json' -o \
    -name 'vercel.json' -o \
    -name 'index.html' -o \
    -name 'tailwind.config.*' -o \
    -name 'postcss.config.*' \
  \) -print0 | while IFS= read -r -d '' f; do
    mkdir -p "$WORK/source/$(dirname "$f")"
    cp -p "$f" "$WORK/source/$f"
  done

# Focused inventory used to identify the active route, schema contract, RPC calls,
# local calculations, direct writes, UAT labels, and environment handling.
{
  echo '=== DATA ENTRY / FINANCIAL V2 REFERENCES ==='
  grep -RInE \
    'DataEntry|data-entry|financial_v2|be_data_entry_|parcel\\.xlsx|amount_entry_type|merchant_declared_delivery|net_system_delivery|hardcoded|base_tariff|delivery_charges|cod_amount' \
    src 2>/dev/null || true
  echo
  echo '=== UAT / SANDBOX / ENVIRONMENT REFERENCES ==='
  grep -RInE \
    'BRITIUM GO-LIVE UAT|GO-LIVE UAT|Mobile Sandbox|data-entry-uat|warehouse-uat|EnvironmentBadge|VITE_APP_ENVIRONMENT|APP_ENVIRONMENT|IS_PRODUCTION' \
    src public 2>/dev/null || true
  echo
  echo '=== SUPABASE DIRECT WRITE REFERENCES ==='
  grep -RInE \
    '\\.(insert|upsert|update|delete)\\(|from\\([^)]*(parcel|financial|data_entry|pickup)' \
    src 2>/dev/null || true
} > "$WORK/meta/focused_inventory.txt"

find "$WORK/source" -type f -print | sort > "$WORK/meta/collected_files.txt"

# Include hashes so the patch can be tied to the exact submitted source.
(
  cd "$WORK"
  find source -type f -print0 | sort -z | xargs -0 sha256sum
) > "$WORK/meta/source_sha256.txt"

tar -czf "$ARCHIVE" "$WORK"
sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256"

printf '\nCREATED: %s/%s\n' "$ROOT_ABS" "$ARCHIVE"
printf 'SHA256:  %s/%s.sha256\n' "$ROOT_ABS" "$ARCHIVE"
printf 'Upload both files. No .env files, node_modules, dist, .git, or .vercel data were included.\n'
