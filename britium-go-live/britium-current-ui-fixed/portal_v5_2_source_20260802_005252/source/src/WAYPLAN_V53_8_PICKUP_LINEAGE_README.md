# Wayplan V53.8 — Canonical Pickup Lineage Guard

Run from the Enterprise Portal repository root:

```bash
node patch_wayplan_pickup_lineage_v53_8.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_wayplan_pickup_lineage_v53_8.mjs
```

Then run the portal locally or deploy it and test `/wayplan-command`.

For Pickup `P0729-HMS-002`, the table must show only:

- `D0729-HMS-001`
- `D0729-HMS-002`

The page must not show unrelated UQD, MML, SGP, FFY, or LUN rows.

The patch:

- prioritizes `pickup_way_id` over the compatibility field `pickup_id`;
- enforces exact selected-Pickup matching;
- blocks rows whose Pickup and Delivery cores differ;
- renders the canonical Pickup ID from each row;
- prevents stale or cross-Pickup selections from entering Wayplan creation;
- creates a timestamped backup before editing.

This patch does not alter Supabase data. The separate `waybill_no = D...` backend defect still requires a database view/RPC correction.
