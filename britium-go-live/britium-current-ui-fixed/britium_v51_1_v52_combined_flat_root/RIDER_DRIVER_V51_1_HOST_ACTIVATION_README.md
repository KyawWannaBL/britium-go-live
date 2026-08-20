# Britium Express V51.1 — Rider/Driver Host Activation

## Why the V51 verifier failed

The V51 source and SQL were correct, but `src/pages/RiderFieldPortalApp.tsx` was not imported by the active Vite entrypoint. The portal production build therefore had no RiderFieldPortalApp chunk, so searching `dist` for the V51 build marker correctly failed.

V51.1 makes the application entrypoint hostname-aware:

- `uat.britiumexpress.app`
- `britiumexpress.app`
- `www.britiumexpress.app`
- `rider.britiumexpress.app`

Those hosts now render `RiderFieldPortalApp` directly. The enterprise portal domain continues to render the normal `App` shell.

## Install

Extract beside `package.json` and `src`, then run:

```bash
node install_rider_driver_v51_1.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_rider_driver_v51_1.mjs
```

Deploy only after:

`SAFE TO DEPLOY RIDER / DRIVER V51.1 HOST ACTIVATION`

Then deploy the Vercel project that owns `uat.britiumexpress.app`.

## Production test

1. Open `https://uat.britiumexpress.app/#/jobs`.
2. Sign in as `driver_ygn_0001@britiumventures.com`.
3. Click **Sync**.
4. Confirm `WP-20260730-053113` appears.
5. Confirm the page source badge mentions `be_field_team_wayplan_snapshot_v51`.
6. Click **Open Assigned Route**.
7. Confirm another Driver account cannot see the Wayplan.

No new SQL is required when V51 SQL is already installed.
