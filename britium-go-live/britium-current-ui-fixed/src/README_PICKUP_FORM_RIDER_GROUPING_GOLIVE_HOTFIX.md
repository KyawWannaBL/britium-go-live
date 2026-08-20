# Britium Go-Live Hotfix: Pickup Form RPC + Rider Pickup Grouping

This patch fixes two current UAT issues:

1. Pickup Form error:
   `Could not choose the best candidate function between public.be_create_pickup_request_from_master(...)`

2. Rider App `/rider/pickups` showing the same pickup once per delivery way instead of once per pickup verification.

## Backend

Run in Supabase SQL Editor:

```sql
rollback;
```

Then run:

```txt
sql/pickup_form_rider_grouping_golive_hotfix.sql
```

This SQL:

- Drops all overloaded `be_create_pickup_request_from_master` RPC versions.
- Recreates one canonical RPC with `p_duplicate_confirmed boolean`.
- Keeps duplicate pickup confirmation support.
- Creates `be_v_rider_assigned_pickups_grouped`.
- Creates `be_rider_assigned_pickup_snapshot(p_rider_email text)`.
- Reloads PostgREST schema.

## Enterprise Portal Frontend

Copy:

```txt
pages/PickupFormPage.tsx -> src/pages/PickupFormPage.tsx
```

This frontend always sends `p_duplicate_confirmed`, and if an active pickup already exists it shows one confirmation dialog before creating another pickup.

## Rider App Frontend

Copy into the rider app project:

```txt
pages/AssignedDeliveryRoutePage.tsx -> src/pages/AssignedDeliveryRoutePage.tsx
lib/riderRuntime.tsx                -> src/lib/riderRuntime.tsx
lib/riderPickupGrouping.ts          -> src/lib/riderPickupGrouping.ts
```

Do not replace the whole rider `App.tsx`. Only ensure this route exists:

```tsx
<Route path="/rider/pickups" element={<AssignedDeliveryRoutePage />} />
```

You can use:

```txt
App.additive_pickup_grouping_routes_snippet.tsx
```

## Expected Result

For UAT pickup:

```txt
P0620-APA-030
```

The Rider App should show:

```txt
1 pickup verification card
30 delivery ways / parcels
```

not 30 repeated pickup cards.

## Verification

Run:

```txt
sql/pickup_form_rider_grouping_verification.sql
```

Expected:

- Only one `be_create_pickup_request_from_master(...)` signature.
- `be_rider_assigned_pickup_snapshot('testrider@britiumexpress.com')` returns grouped pickup rows.
- `P0620-APA-030` appears once with `delivery_way_count = 30`.

## Build

Enterprise portal:

```bash
npm run build
npx vercel --prod
```

Rider app:

```bash
npm run build
npx vercel --prod
```
