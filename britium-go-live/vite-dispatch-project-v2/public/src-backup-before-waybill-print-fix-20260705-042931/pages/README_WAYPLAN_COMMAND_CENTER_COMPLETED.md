# Wayplan Command Center Completed Page

## File to replace

Copy:

```txt
WayplanCommandCenterPage.tsx -> src/pages/WayplanCommandCenterPage.tsx
```

## SQL required once

Run:

```txt
wayplan_rpc_cleanup.sql
```

This removes the old 4-parameter `be_wayplan_create_for_waybill` RPC so Supabase/PostgREST only sees the full 10-parameter function.

## Page behavior

The completed page calls:

```ts
supabase.rpc("be_wayplan_create_for_waybill", {
  p_waybill_no,
  p_branch_code,
  p_route_code,
  p_route_name,
  p_dispatch_date,
  p_vehicle_id,
  p_rider_email,
  p_driver_email,
  p_helper_email,
  p_actor_email
})
```

It also keeps Wayplan Command, Fleet Zoning, Generated Manifest, Mapbox GeoJSON, and legacy page consolidation in one screen.

## Deploy

```bash
npm run build
npx vercel --prod
```

Hard refresh after deploy.
