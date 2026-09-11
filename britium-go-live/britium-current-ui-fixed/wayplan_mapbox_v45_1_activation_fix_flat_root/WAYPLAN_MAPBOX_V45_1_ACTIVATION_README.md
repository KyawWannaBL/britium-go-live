# Wayplan Mapbox V45.1 Activation Fix

## Why the verifier stopped

The production build completed, and `mapbox-gl` is installed. The failure occurred before bundle verification because the active file:

```text
src/pages/WayplanCommandCenterPage.tsx
```

still did not contain the V45 marker. This means the repository built an older Wayplan page even though the V45 package was available.

V45.1 fixes the activation step. Its installer uses Node's cross-platform `fileURLToPath()` path conversion, overwrites the three active pages, installs both Mapbox components and the routing helper, and verifies every destination immediately after copying.

No database change is included or required. The previously installed V45 SQL remains valid.

## Install

Extract this ZIP directly beside `package.json` and `src`, then run:

```bash
node install_wayplan_mapbox_v45_1.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_mapbox_v45_1.mjs
```

Windows Git Bash can use the same commands. In PowerShell, replace the cleanup command with:

```powershell
Remove-Item -Recurse -Force dist, node_modules/.vite -ErrorAction SilentlyContinue
```

## Required installer result

The installer must print all of these active-source checks:

```text
PASS active source: src/pages/WayplanCommandCenterPage.tsx
PASS active source: src/pages/SupervisorWayplanReviewPage.tsx
PASS active source: src/pages/RiderAppPage.tsx
PASS active source: src/components/wayplan/MapboxWayplanPlannerV45.tsx
PASS active source: src/components/wayplan/RiderMapboxRouteV45.tsx
PASS active source: src/lib/mapboxHeadOfficeRoutingV45.ts
```

## Required verifier result

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN MAPBOX V45.1 ACTIVATION FIX
```

Then run:

```bash
npx vercel --prod
```

## Environment

Keep the public Mapbox token in local and Vercel environment variables:

```text
VITE_MAPBOX_ACCESS_TOKEN=pk.your_public_mapbox_token
```

Do not put a secret token in a `VITE_*` variable.
