# Britium Express Wayplan V42

## Purpose

V42 replaces free-text Route Assignment with live Master Data dropdowns for:

- Vehicle / fleet
- Rider
- Driver
- Helper

Selecting a Master Data row automatically fills the corresponding ID and name/plate. Every dropdown begins with **Blank / type manually**, which unlocks the ID and name fields for controlled manual entry.

The existing workflow is preserved:

`WAREHOUSE_READY -> Wayplan -> mandatory Dispatch scan -> Publish`

## Backend

Run `wayplan_master_assignment_v42.sql` in Supabase before deploying the frontend.

Expected verification objects:

```text
be_wayplan_assignment_options_v42()
be_generate_wayplan_from_warehouse_v42(jsonb)
be_wayplan_normalize_vehicle_type_v42(text)
```

The options API reads active rows from:

```text
be_master_data_rows / rider_master
be_master_data_rows / driver_master
be_master_data_rows / helper_master
be_master_data_rows / fleet_master
```

Only fleet types already permitted by the Wayplan/Dispatch guard are offered: `delivery_van`, `van`, `bike`, and `bicycle`. Unsupported truck or maintenance rows are excluded.

## Frontend installation

Extract the package beside `package.json` and `src`, then run:

```bash
node install_wayplan_v42.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_v42.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN V42
```

Then run:

```bash
npx vercel --prod
```

## Production test

1. Open `/#/wayplan-command`.
2. Confirm the Master Data connection line shows non-zero counts where records exist.
3. Choose a Vehicle. Vehicle ID, plate, and type must populate automatically.
4. Choose a Rider. Rider ID and name must populate automatically.
5. Choose a Driver and Helper. Their IDs and names must populate automatically.
6. Choose the first blank row in each dropdown and confirm the paired fields become editable.
7. Create a small one-route-group Wayplan.
8. Confirm the created membership stores the selected codes/names and the `assignment_v42` audit snapshot.
9. Continue to Dispatch Scan and verify the V41 mandatory scan flow remains unchanged.
