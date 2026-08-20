# Wayplan V44 — Exclusive Assignment Modes and Full Fleet Visibility

## What V44 fixes

V43.1 loaded Master Data correctly, but its create validation still required both a Rider and a Vehicle. V44 changes Route Assignment to one exclusive mode:

1. **Rider Delivery** — Rider is required. Vehicle, Driver, and Helper are cleared and not required.
2. **Vehicle Crew** — Vehicle, Driver, and Helper are required. Rider is cleared and not required.

Switching the mode automatically removes the other group's values so a Wayplan cannot accidentally carry both assignment models.

## Why only two vehicles appeared before

The current Fleet Master seed contains five active records: two Vans and three Mini Trucks. V42 returned only vehicle types permitted by the current Dispatch policy, so the three Mini Trucks were hidden.

V44 returns every active Fleet Master row. Policy-blocked types remain visible in the dropdown with `POLICY BLOCKED` and cannot be selected. The server still enforces the permitted types: `van`, `delivery_van`, `bike`, and `bicycle`.

## Backend installation

Run the complete file in Supabase SQL Editor:

```text
wayplan_assignment_modes_v44.sql
```

Expected final verification row:

```text
assignment_options_rpc: be_wayplan_assignment_options_v44()
guarded_wayplan_create_rpc: be_generate_wayplan_from_warehouse_v44(jsonb)
supervisor_validation_rpc: be_wayplan_validate_review_v43(text)
```

Optional Master Data count check:

```sql
select public.be_wayplan_assignment_options_v44() -> 'counts';
```

With the current workbook seed, the result should report five fleet records and two dispatch-eligible vehicles.

## Frontend installation

Extract the package directly beside `package.json` and `src`, then run:

```bash
node install_wayplan_v44.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_v44.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN V44 EXCLUSIVE ASSIGNMENT MODES
```

Then deploy:

```bash
npx vercel --prod
```

Hard-refresh `/#/wayplan-command` with `Ctrl + Shift + R`.

## Production checks

### Rider Delivery

- Select `Rider Delivery — Rider only`.
- Choose a Rider from Master Data.
- Confirm Vehicle, Driver, and Helper controls are not shown.
- Create a Wayplan and submit it for Supervisor review.

### Vehicle Crew

- Select `Vehicle Crew — Vehicle + Driver + Helper`.
- Confirm all active Fleet Master rows appear.
- Choose an eligible Vehicle, Driver, and Helper.
- Confirm Rider controls are not shown.
- Create a Wayplan and submit it for Supervisor review.

### Manual fallback

The first row of every active dropdown remains:

```text
— Blank / type manually —
```

Selecting it unlocks manual ID/name fields for the active assignment mode.
