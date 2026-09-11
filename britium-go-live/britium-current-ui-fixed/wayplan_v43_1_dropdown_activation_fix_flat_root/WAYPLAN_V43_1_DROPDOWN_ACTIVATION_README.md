# Wayplan V43.1 — Master Data Dropdown Activation Fix

## Diagnosis

The production screenshot is not rendering the V42/V43 Wayplan page. It shows the older header:

`Warehouse Ready → Wayplan → Dispatch Scan`

and immediately displays plain Vehicle/Rider/Driver/Helper ID inputs. The correct V43.1 page visibly shows:

- `Supervisor Approval` in the header
- `MASTER DATA DROPDOWNS ACTIVE`
- `Refresh Master Data`
- Vehicle, Rider, Driver, and Helper Master Data dropdowns
- a first option named `— Blank / type manually —`

The V42 backend RPC is already installed, so this hotfix changes no database objects. It replaces the active route source and makes the verifier reject a stale V40/V41 production bundle.

## Install

Extract this ZIP directly beside `package.json` and `src`, then run:

```bash
node install_wayplan_v43_1.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_v43_1.mjs
```

Deploy only after:

`SAFE TO DEPLOY WAYPLAN V43.1 MASTER DROPDOWN ACTIVATION`

Then deploy:

```bash
npx vercel --prod
```

Hard-refresh `/#/wayplan-command` with Ctrl+Shift+R.

## Expected screen evidence

At the top of Wayplan Command, confirm:

`MASTER DATA DROPDOWNS ACTIVE`

In Route Assignment, confirm four dropdowns appear before the ID/name fields:

1. Vehicle Master Data / Manual
2. Rider Master Data / Manual
3. Driver Master Data / Manual
4. Helper Master Data / Manual

Selecting a Master Data row fills the ID and name/plate fields. Selecting the blank first row unlocks manual entry.

## Backend

No new SQL is required for the dropdown fix. It uses:

`be_wayplan_assignment_options_v42()`

The included V43 SQL is retained only for a complete package and should be run only when the Supervisor approval objects have not already been installed.
