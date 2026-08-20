# Britium Express Wayplan Mapbox V45

## Purpose

V45 arranges every Rider delivery route from the configured Britium Head Office, saves the Mapbox stop order to the Wayplan, requires that route before Supervisor review, and displays the same approved route in the Rider App.

Workflow:

```text
WAREHOUSE_READY
→ Wayplan assignment
→ Mapbox route starts at Britium Head Office
→ Delivery coordinates resolved
→ Stops optimized and saved
→ Supervisor review/approval
→ Mandatory Dispatch scan
→ Rider follows saved route
```

## Fixed route origin

The default route origin is read from `be_dispatch_service_locations` when `HUB_EAST_DAGON` exists. Otherwise V45 seeds:

```text
Britium Ventures Head Office
East Dagon, Yangon
Latitude: 16.889554
Longitude: 96.199675
```

The backend rejects a saved route when its origin or route geometry does not start at the configured Head Office.

## Mapbox behavior

- Uses `mapbox/driving-traffic` for delivery route optimization.
- Uses `source=first`, `destination=last`, and `roundtrip=false` so the first route point is fixed as Head Office.
- Requests GeoJSON route geometry and turn-by-turn step data.
- Mapbox Optimization v1 accepts up to 12 coordinates per request. V45 supports larger Wayplans by continuing through deterministic 11-stop optimization chunks; only the first route origin is Head Office, and later chunks continue from the preceding stop.
- Existing parcel coordinates are reused.
- Missing coordinates are resolved with Mapbox Geocoding v6 using `permanent=true`, then saved to Wayplan membership metadata. Confirm that the Mapbox account is permitted to store permanent geocoding results.
- The saved route contains every active Way ID exactly once. Duplicate or missing parcel stops are rejected by the backend.

## Environment

Add a valid **public** Mapbox token. Never use a secret token in a `VITE_*` variable.

Local `.env` or Vercel Environment Variables:

```text
VITE_MAPBOX_ACCESS_TOKEN=pk.your_public_mapbox_token
```

The existing fallback `VITE_MAPBOX_TOKEN` is also recognized, but `VITE_MAPBOX_ACCESS_TOKEN` is preferred.

## 1. Install SQL

Run the complete file in Supabase SQL Editor:

```text
wayplan_mapbox_head_office_v45.sql
```

Expected final object report:

```text
be_wayplan_head_office_v45(text)
be_wayplan_route_snapshot_v45(text)
be_wayplan_save_mapbox_route_v45(text,jsonb,text)
be_wayplan_route_status_v45(text)
be_wayplan_submit_review_v45(text,text,text)
be_wayplan_supervisor_decide_v45(text,text,text,text)
be_wayplan_route_plans_v45
```

## 2. Install frontend

Extract the V45 ZIP directly beside `package.json` and `src`, then run:

```bash
node install_wayplan_mapbox_v45.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_mapbox_v45.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN MAPBOX V45
```

Then deploy:

```bash
npx vercel --prod
```

## 3. Production test

1. Open `/#/wayplan-command`.
2. Create one route-group Wayplan with Rider or Vehicle Crew assignment.
3. In **Rider Route Arrangement**, confirm the start is Britium Head Office.
4. Select **Resolve Missing Coordinates**.
5. Correct any parcel address that Mapbox cannot resolve.
6. Select **Optimize from Head Office**.
7. Confirm the map begins at the gold Head Office marker and every parcel has a numbered stop.
8. Select **Save Route & Stop Sequence**.
9. Confirm the status becomes `ROUTE SAVED · REVIEW READY`.
10. Submit for Supervisor review.
11. Approve and send to Dispatch.
12. Complete mandatory Dispatch scanning and publish.
13. Sign in as the assigned Rider and confirm the same Head Office origin, route line, and stop order appear in the Rider App.

## Important controls

- Supervisor review is blocked until the complete Mapbox route has been saved.
- Supervisor approval is blocked if the route is absent or does not contain all active Wayplan parcels.
- The route cannot be changed while the Wayplan is pending review, approved, Dispatch-ready, or dispatched. Return it for correction first.
- A Mapbox token must be restricted to approved Britium domains in the Mapbox account.
- Mapbox routing requests are billable API requests; large routes can use multiple optimization requests.

## Validation completed in the package build environment

- TypeScript/TSX syntax transpilation passed for all V45 files.
- Strict type checking passed for the standalone routing helper.
- A mocked 15-stop route test passed and confirmed fixed `source=first`, `destination=last`, `roundtrip=false`, GeoJSON output, and multi-request chunking.
- Installer and verifier source checks passed.
- The complete repository build could not be executed in the package environment because its npm mirror does not contain `zustand@5.0.14`. Run the production build in the repository environment before deployment.
