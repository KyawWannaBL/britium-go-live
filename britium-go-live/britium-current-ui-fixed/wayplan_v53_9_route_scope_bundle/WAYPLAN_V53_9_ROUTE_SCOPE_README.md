# Wayplan V53.9 — Route Group / Multi-Pickup Scope

## Why this patch is needed

A Pickup ID and Delivery Way ID are different identifier types.

Example:

- Parent Pickup ID: `P0729-HMS-002`
- Child Delivery Way ID: `D0729-HMS-003`

This is valid because both share the lineage core `0729-HMS`. The final three digits do not have to match.

A Wayplan may contain Delivery Ways from multiple parent Pickup IDs when they all belong to one route group. Therefore, the default Wayplan selection scope should be:

- Pickup Scope: **All pickups in selected route group**
- Route Group: one selected route group

Selecting a specific Pickup ID remains available as an optional narrowing filter.

## Install

Run from the Enterprise Portal repository root:

```bash
node patch_wayplan_route_scope_v53_9.mjs \
  && rm -rf dist node_modules/.vite \
  && npm run build \
  && node verify_wayplan_route_scope_v53_9.mjs
```

## Expected browser behavior

To see the complete `GROUP_5_NORTH` list:

1. Pickup Scope: `All pickups in selected route group`
2. Route Group: `GROUP_5_NORTH`
3. Search: blank

The table may then show several different Parent Pickup IDs, but every row must have a valid Pickup/Delivery lineage and must belong to `GROUP_5_NORTH`.

Selecting `P0729-HMS-002` intentionally narrows the table to Delivery Ways whose actual parent is exactly `P0729-HMS-002`.

## Separate Ops Workflow issue

The Ops Workflow screen must display each stop's row-level parent Pickup ID. It must not repeat one wayplan-level Pickup ID for every stop. That component requires a separate source patch after locating the file containing:

- `Selected Canonical Record`
- `Wayplan / Pickup`
- `Open Variances`
