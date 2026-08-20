BRITIUM EXPRESS - WAYPLAN ROUTE OPTIMIZATION AND RIDER TRACKING V62
Build: WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_2026_08_02
Target route: /wayplan-command
Target environment: Production

PURPOSE
1. Optimize the stop sequence from Britium Head Office to the last stop.
2. Calculate road distance and travel time between every consecutive stop.
3. Calculate planned ETA for every stop and the final stop.
4. Allow Dispatch to move a stop earlier/later and recalculate the selected order.
5. Save the route geometry, legs, sequence, cumulative distance, cumulative time and ETA.
6. Reorder the manifest preview and printed manifest to match the saved route.
7. Show one live tracking map for the Rider assigned to the active Wayplan.
8. Start secured GPS watch only while the Rider route is IN_PROGRESS.

SECURITY AND DATA CONTROLS
- No fake or synthetic GPS point is created.
- The new Rider GPS hook calls secured RPCs only.
- The new hook contains no direct Supabase table upsert.
- Existing route/start/arrival RPCs remain authoritative.
- This package includes no database mutation.
- Existing Financial V2 settings and MUTATION_SHADOW are untouched.

BACKEND PREFLIGHT
Run the complete contents of:
  sql/verify_wayplan_route_tracking_backend_v62.sql
in Supabase SQL Editor.
Required top-level result:
  "ok": true
  "read_only": true
The preflight must show all required Wayplan/Rider RPC names and the
public.be_rider_live_locations table. Realtime publication is reported separately;
tracking still polls every 20 seconds when Realtime is unavailable.

INSTALL
From the portal root:
  sha256sum britium_wayplan_route_optimization_tracking_v62_20260802.tgz
  tar -xzf britium_wayplan_route_optimization_tracking_v62_20260802.tgz
  node ./wayplan_route_optimization_tracking_v62_patch/apply_wayplan_route_optimization_tracking_v62.mjs .
  node ./wayplan_route_optimization_tracking_v62_patch/verify_wayplan_route_optimization_tracking_v62.mjs .

BUILD AND DIST VERIFY
  rm -rf dist node_modules/.vite
  npm run build
  node ./wayplan_route_optimization_tracking_v62_patch/verify_dist_wayplan_route_optimization_tracking_v62.mjs .

DEPLOY
  npx vercel --prod
  PROD_URL='PASTE_NEW_PRODUCTION_URL_HERE'
  npx vercel inspect "$PROD_URL" --wait
Required: target production, status Ready, alias https://www.britiumexpress.com

PRODUCTION ACCEPTANCE
Open in an incognito browser and hard refresh:
  https://www.britiumexpress.com/#/wayplan-command

For an active Wayplan:
1. Confirm all delivery stops have valid coordinates.
2. Select Rider/Bicycle or Vehicle/Traffic mode.
3. Set departure date/time and service minutes per stop.
4. Click Resolve Coordinates.
5. Click Optimize Route.
6. Confirm every stop shows distance, travel time and ETA.
7. Move one stop up/down and confirm Save is blocked until Recalculate Current Order.
8. Click Save Sequence + ETA.
9. Confirm Manifest Preview and Print Manifest use the saved optimized sequence.
10. Start the route in the Rider application.
11. Confirm the command page tracking map shows Rider position, GPS freshness,
    next stop, live road distance, live travel time and live ETA.
12. Confirm the Rider route map highlights the current stop and shows the Rider marker.

MAPBOX ENVIRONMENT
Production must contain VITE_MAPBOX_ACCESS_TOKEN.
The patch retains VITE_MAPBOX_TOKEN as a compatibility fallback.

ROLLBACK
Use the exact backup_root printed by the installer:
  node ./wayplan_route_optimization_tracking_v62_patch/rollback_wayplan_route_optimization_tracking_v62.mjs . "PASTE_EXACT_BACKUP_ROOT"
Then rebuild and redeploy. The rollback script does not change the database.

LIMITATIONS
- Mapbox Optimization API V1 is limited to small coordinate sets. V62 handles larger
  Wayplans in controlled chunks and then recalculates the complete saved order through
  Mapbox Directions so every displayed leg and ETA uses road routing.
- ETA is an estimate, not a guaranteed delivery time. Live ETA updates from the latest
  secured Rider GPS point and current Mapbox route conditions.
- A Rider tracking marker requires an authenticated Rider account and a working secured
  GPS RPC. The app deliberately does not fall back to direct table writes.
