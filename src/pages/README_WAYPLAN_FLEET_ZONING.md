# Britium Wayplan Fleet Zoning Patch

## Page to use

Use one screen only:

```txt
Wayplan Command Center
/wayplan-command
```

This replaces the old overlap between:

```txt
Way Management
Wayplan Management
Wayplan Zone
Wayplan Management Go Live
```

## What this patch adds

The new `WayplanCommandCenterPage.tsx` has four tabs:

1. **Wayplan Command**
   - Reads warehouse-ready rows.
   - Creates/updates a wayplan from a selected waybill.
   - Shows active wayplans.

2. **Fleet Zoning Setup**
   - Add/remove service locations.
   - Add/remove delivery vans, pickup vans, and bike riders.
   - Add/remove township names in zones.
   - Designed for future fleet expansion when more vans are added.

3. **Generated Manifest**
   - Allocates jobs into:
     - 9 bike riders for Group 1.
     - 4 delivery vans for drop-offs only.
     - 2 pickup vans for highway drop + collections.
   - Excludes Dala and outer rural townships.
   - Exports a CSV manifest.

4. **Mapbox GeoJSON**
   - Generates the full Mapbox GeoJSON payload.
   - Includes hub, highway gates, and zone polygons.
   - Includes the Mapbox GL JS paint snippet for zone fills/outlines.

## Operational design implemented

### Delivery vans

```txt
Van A → Group 2 Downtown Delivery
Van B → Group 4 Western Corridor Delivery
Van C → Group 3 East-Central Belt Delivery
Van D → Group 5 Northern Rim Delivery
```

### Pickup vans

```txt
Pickup Van 1 → Dagon Ayar drop first, then Groups 2 & 4 pickups
Pickup Van 2 → Aung Mingalar drop first, then Groups 3 & 5 pickups
```

### Bike riders

```txt
Team A → East Dagon + South Dagon
Team B → North Dagon + Okkalapas
Team C → Thingangyun + Yankin
```

## Files

```txt
WayplanCommandCenterPage.tsx
wayplan_fleet_zoning_seed.sql
wayplan_fleet_allocation_engine.ts
route_config_snippet.tsx
WayManagementPage.tsx
WayManagementPlanPage.tsx
WayplanZonePage.tsx
WayplanManagementGoLivePage.tsx
```

## Copy instructions

```txt
WayplanCommandCenterPage.tsx      -> src/pages/WayplanCommandCenterPage.tsx
wayplan_fleet_allocation_engine.ts -> src/lib/wayplan_fleet_allocation_engine.ts
```

Optional redirect pages:

```txt
WayManagementPage.tsx             -> src/pages/WayManagementPage.tsx
WayManagementPlanPage.tsx         -> src/pages/WayManagementPlanPage.tsx
WayplanZonePage.tsx               -> src/pages/WayplanZonePage.tsx
WayplanManagementGoLivePage.tsx   -> src/pages/WayplanManagementGoLivePage.tsx
```

## SQL setup

Run:

```txt
wayplan_fleet_zoning_seed.sql
```

Then verify:

```sql
select public.be_wayplan_zoning_snapshot();
```

Expected:

```txt
zones = 7
assets = 15
locations = 3
excluded_townships = 14
```

## Route cleanup

Use:

```tsx
<Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
<Route path="/way-management" element={<Navigate to="/wayplan-command" replace />} />
<Route path="/way-management-plan" element={<Navigate to="/wayplan-command" replace />} />
<Route path="/wayplan-zone" element={<Navigate to="/wayplan-command" replace />} />
<Route path="/wayplan-go-live" element={<Navigate to="/wayplan-command" replace />} />
```

Keep only one sidebar item:

```txt
Wayplan Command Center → /wayplan-command
```

## Deploy

```bash
npm run build
npx vercel --prod
```

Then hard refresh:

```txt
Ctrl + Shift + R
```
