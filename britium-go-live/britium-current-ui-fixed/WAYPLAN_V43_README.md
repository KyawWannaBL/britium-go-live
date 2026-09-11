# Britium Express Wayplan V43

V43 adds the missing Supervisor approval gate between Wayplan creation and mandatory Dispatch scanning.

## Workflow

```text
WAREHOUSE_READY
-> Wayplan created with V42 Master Data assignments
-> PENDING_REVIEW
-> Supervisor APPROVED
-> DISPATCH_READY
-> mandatory parcel scanning in Dispatch
-> guarded Publish
-> DISPATCHED / OUT_FOR_DELIVERY
```

A planner can no longer send a Wayplan directly to Dispatch. The old V40 handoff RPC is redefined to enforce V43 approval, and direct authenticated access to the V41 Publish RPC is revoked. Dispatch uses `be_dispatch_publish_wayplan_v43`.

## Backend installation

Run the complete file in Supabase SQL Editor:

```text
wayplan_supervisor_approval_v43.sql
```

Expected verification objects:

```text
be_wayplan_supervisor_snapshot_v43(text)
be_wayplan_submit_review_v43(text,text,text)
be_wayplan_supervisor_decide_v43(text,text,text,text)
be_wayplan_prepare_dispatch_v43(text,text)
be_dispatch_publish_wayplan_v43(text,text)
be_wayplan_review_status_v43(text)
be_wayplan_review_v43
```

## Frontend deployment

Extract this package directly beside `package.json` and `src`, then run:

```bash
node install_wayplan_v43.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_v43.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYPLAN SUPERVISOR APPROVAL V43
```

Then deploy:

```bash
npx vercel --prod
```

## Production test

1. Open `/#/wayplan-command`.
2. Create one route-group Wayplan with V42 Rider/Driver/Helper/Vehicle assignments.
3. Select **Submit for Review**.
4. Confirm `/#/supervisor-wayplan?wayplan=<WAYPLAN_ID>` opens.
5. With a non-Supervisor account, confirm approval buttons are blocked.
6. With Supervisor/Admin authority, review parcel eligibility and assignment details.
7. Select **Approve & Send to Dispatch**.
8. Confirm Dispatch opens with the selected Wayplan.
9. Confirm Publish remains disabled until every parcel is scanned.
10. Publish and confirm parcels become `DISPATCHED / OUT_FOR_DELIVERY`.

A rejected Wayplan remains out of Dispatch and can be resubmitted after its route or assignment is corrected.
