BRITIUM EXPRESS - WAYPLAN V62 DIST VERIFIER CORRECTION V62.0.1
Date: 2026-08-03

Purpose
-------
The original V62 compiled-dist verifier required the source-only constant:
RIDER_LIVE_TRACKING_SECURE_RPC_V62_2026_08_02

That exported constant is not used at runtime and can be removed by Vite/Rolldown
tree-shaking. The compiled application still contains the actual secured GPS RPC
and tracking source markers. This verifier-only correction replaces the fragile
constant check with a compound secured-GPS contract:

- be_rider_update_live_location is present
- RIDER_ROUTE_WATCH_V62 is present
- no direct-location-table-write marker is present
- no synthetic-GPS marker is present

No application source, backend SQL, production data, financial setting, or route
behavior is modified. A rebuild is not required when the existing dist folder is
unchanged.

Run from the portal repository root:

node ./wayplan_route_optimization_tracking_v62_0_1_patch/verify_dist_wayplan_route_optimization_tracking_v62_0_1.mjs .

Expected:
- ok: true
- required_markers_present: 11
- required_markers_total: 11
- secured_gps_compound_contract_passed: true
- verifier_only_correction: true
- rebuild_required: false
