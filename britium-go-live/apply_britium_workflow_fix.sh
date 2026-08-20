#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGES="$ROOT/src/pages"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.britium-backup-$STAMP"

if [[ ! -d "$PAGES" ]]; then
  echo "ERROR: src/pages not found under: $ROOT"
  echo "Run from the enterprise portal root or pass it as the first argument."
  exit 1
fi

mkdir -p "$BACKUP/src/pages" "$ROOT/supabase/migrations"

FILES=(
  SupervisorPickupPage.tsx
  SupervisorPickupAssignmentGoLivePage.tsx
  RiderFieldPortalApp.tsx
  DataEntryPhotoCheckPage.tsx
  DataEntryRegistrationStablePage.tsx
  WarehouseLifecyclePage.tsx
)

for file in "${FILES[@]}"; do
  if [[ -f "$PAGES/$file" ]]; then
    cp "$PAGES/$file" "$BACKUP/src/pages/$file"
  fi
  cp "$PACK_DIR/fixed/src/pages/$file" "$PAGES/$file"
  echo "UPDATED: src/pages/$file"
done

cp "$PACK_DIR/supabase/migrations/20260720_team_photo_partial_workflow.sql" "$ROOT/supabase/migrations/20260720_team_photo_partial_workflow.sql"

echo
echo "Backup: $BACKUP"
echo "SQL migration copied to: supabase/migrations/20260720_team_photo_partial_workflow.sql"
echo "Run that SQL in Supabase SQL Editor before testing photo review/re-upload."

echo
if [[ -f "$ROOT/package.json" ]]; then
  echo "Running production build..."
  (cd "$ROOT" && npm run build)
else
  echo "package.json not found; skipped npm run build."
fi
