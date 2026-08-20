# Britium Express Wayplan V40

## Purpose

V40 connects the completed Warehouse V39 receipt workflow to Wayplan creation and the mandatory Dispatch scan workflow.

The operational sequence is:

`WAREHOUSE_READY -> WAYPLAN_PLANNED -> READY_FOR_DISPATCH -> mandatory Dispatch scan -> Publish -> OUT_FOR_DELIVERY`

V40 does **not** publish or release a route from the Wayplan screen. It prepares the Wayplan and transfers the operator to Dispatch Command, where every parcel remains subject to the V39 mandatory scan guard.

## Corrections made

- Reads only `WAREHOUSE_READY` and non-RTO parcel rows from Warehouse V39.
- Prevents the same parcel from joining two active Wayplans.
- Requires one route group per Wayplan.
- Maps recipient townships to operational route groups, including Thaketa, Mayangone and Hlaing Thar Yar.
- Requires an authorized Rider and permitted van/bike vehicle before creation.
- Records V40 membership and audit events without replacing the existing Wayplan tables.
- Calls the existing `be_generate_wayplan(jsonb)` generator only after Warehouse validation.
- Replaces the unsafe direct Dispatch action with a controlled “Dispatch Scan” handoff.
- Fixes the old manifest print function that referenced undefined variables.

## Files installed

- `src/pages/WayplanCommandCenterPage.tsx`
- `src/pages/WayplanCommandCenterPage.V40.tsx`
- `wayplan_warehouse_dispatch_v40.sql`

## Deployment order

### 1. Run SQL in Supabase

Run the complete `wayplan_warehouse_dispatch_v40.sql` file.

Expected verification objects:

- `be_wayplan_warehouse_ready_snapshot_v40(text)`
- `be_generate_wayplan_from_warehouse_v40(jsonb)`
- `be_wayplan_prepare_dispatch_v40(text,text)`
- `be_wayplan_v40_status(text)`
- `be_wayplan_membership_v40`

The SQL requires:

- Warehouse / Dispatch V39 already installed.
- Existing legacy RPC `be_generate_wayplan(jsonb)` already installed.

### 2. Install frontend

Extract this package beside `package.json` and `src`, then run:

```bash
node install_wayplan_v40.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_v40.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN V40
```

### 3. Production test

1. Open `/#/wayplan-command`.
2. Confirm pickup `P0729-HMS-002` shows Warehouse Ready parcels.
3. Filter one route group, such as `GROUP_3_EAST_CENTRAL`, `GROUP_4_WEST` or `GROUP_5_NORTH`.
4. Select the route-group parcels.
5. Assign the Rider and an allowed vehicle type.
6. Create the Wayplan.
7. Print the manifest.
8. Select **Dispatch Scan**.
9. In Dispatch Command, scan every parcel in that Wayplan.
10. Publish only when the Dispatch scan count equals the Wayplan parcel count.

## Important

Do not run every older Wayplan SQL file from `wayplans.zip`. The archive contains multiple historical Wayplan table/function designs. V40 is an additive compatibility layer around the active generator and V39 Warehouse/Dispatch controls.
