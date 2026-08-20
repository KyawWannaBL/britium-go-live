# Britium Express V51 — Rider / Driver Wayplan Visibility

## Problem confirmed

The UAT Field Command Wall was using the login email as the worker key:

`driver_ygn_0001@britiumventures.com`

Wayplan V44 stores the selected Driver by the canonical Master Data code, for example `DRV001`. Because those values did not match, the Driver could see older pickup jobs but not the newly published Wayplan.

A second gap was that the Field Command Wall loaded the legacy `be_field_team_mobile_snapshot` queue without merging published V40/V47 Wayplan membership.

## V51 correction

- Converts company email logins to canonical workforce codes:
  - `driver_ygn_0001@britiumventures.com` → `DRV001`
  - `rider_ygn_0001@britiumventures.com` → `RID001`
  - `helper_ygn_0001@britiumventures.com` → `HLP001`
- Loads only published Wayplans assigned to that exact Rider, Driver, or Helper code.
- Merges Wayplan assignments with existing pickup jobs.
- Shows a synthetic assignment alert for each active published Wayplan.
- Adds **Open Assigned Route** to the Field Command Wall.
- Opens the V46 Head Office / Mapbox route execution controls.
- Extends the V46 operator resolver so a Driver email or `DRV001` can access the same assigned route.
- Does not expose another workforce member's Wayplan.

## 1. Run SQL

Run the complete file:

`rider_driver_wayplan_visibility_v51.sql`

Expected final result includes:

- `field_team_wayplan_snapshot_rpc = be_field_team_wayplan_snapshot_v51(jsonb)`
- `email_to_code_rpc = be_field_team_code_from_login_v51(text)`
- `v46_operator_rpc = be_rider_route_operator_v46(text,text)`
- `driver_email_example = DRV001`

Then run:

`verify_rider_driver_v51.sql`

For `WP-20260730-053113`, check the returned `driver_code`. The account `driver_ygn_0001@britiumventures.com` receives the Wayplan only when the assigned code is `DRV001`. A different code means the route was assigned to another Driver and must not be shown to this account.

## 2. Install frontend

Extract the package beside `package.json` and `src`, then run:

```bash
node install_rider_driver_v51.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_rider_driver_v51.mjs
```

Deploy only after:

`SAFE TO DEPLOY RIDER / DRIVER WAYPLAN VISIBILITY V51`

Then deploy the UAT Rider application:

```bash
npx vercel --prod
```

## 3. Production test

1. Confirm `WP-20260730-053113` has `driver_code = DRV001`.
2. Sign out of `uat.britiumexpress.app`.
3. Sign in as `driver_ygn_0001@britiumventures.com`.
4. Click **Sync**.
5. Confirm the Source badge includes `be_field_team_wayplan_snapshot_v51`.
6. Confirm the page shows `FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30`.
7. Confirm `WP-20260730-053113` appears under Jobs and Delivery.
8. Click **Open Assigned Route**.
9. Confirm V46 displays **Accept Route**, then **Start at Head Office**.
10. Sign in as another Driver and confirm that Wayplan is not visible.
