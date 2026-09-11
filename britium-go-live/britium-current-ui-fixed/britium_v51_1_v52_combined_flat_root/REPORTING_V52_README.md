# Britium Express V52 — Certified Operational Reporting

## Workflow

`V50 CERTIFIED DATA -> FILTERED REPORT -> INDEPENDENT REVIEW -> CONTROLLED EXPORT`

V52 is Step 14 of the operational workflow. It reports only V50 records that are:

- `check_status = CERTIFIED`
- `certification_stale = false`
- `open_variance_count = 0`

It records the report period, filters, preparer, dataset hash, reviewer, review decision, controlled export location, and every registered export.

## Controls

- Filters: period, branch, team, service, delivery status, finance status.
- Outputs: delivery, route, team, vehicle, weight, fees, COD, finance, closure, and certification evidence.
- Approval revalidates the source dataset hash.
- Non-super-admin preparers cannot approve their own report.
- Zero-row reports cannot be approved.
- Export is blocked until the report is approved and current.
- A later V50 source change marks the report stale and requires regeneration.

## 1. Install backend

Run:

`reporting_certified_v52.sql`

Expected objects:

- `be_reporting_certified_snapshot_v52(date,date,text,text,text,text,text,integer)`
- `be_reporting_generate_v52(text,date,date,text,text,text,text,text,text)`
- `be_reporting_revalidate_v52(uuid)`
- `be_reporting_review_v52(uuid,text,text,text,text)`
- `be_reporting_register_export_v52(uuid,text,text,text,integer,text,text)`
- `be_reporting_run_status_v52(uuid)`
- `be_reporting_recent_runs_v52(integer)`
- `be_reporting_runs_v52`
- `be_reporting_exports_v52`

Then run `verify_reporting_v52.sql`.

## 2. Install frontend

Extract beside `package.json` and `src`, then run:

```bash
node install_reporting_v52.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_reporting_v52.mjs
```

Deploy only after:

`SAFE TO DEPLOY CERTIFIED OPERATIONAL REPORTING V52`

## 3. Production test

1. Complete and certify at least one row in V50.
2. Open `/#/reporting`.
3. Select the **Certified** tab.
4. Set the period and filters.
5. Generate the report.
6. Confirm only certified rows appear.
7. Mark Reviewed, then approve using an authorized independent reviewer.
8. Enter the controlled export location.
9. Register and download CSV.
10. Confirm the run and export are visible in Recent controlled report runs.

An empty result is correct until V50 contains certified rows within the selected period.
