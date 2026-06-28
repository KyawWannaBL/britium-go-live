# Wayplan Consolidation Patch

## New single page name

Use this as the only operational Wayplan page:

```txt
WayplanCommandCenterPage.tsx
```

Recommended route:

```txt
/wayplan-command
```

## What is combined into the single page

The new `WayplanCommandCenterPage.tsx` combines these functions:

1. Data Entry → Warehouse → Wayplan synchronization
2. Warehouse received ready queue
3. Wayplan creation from ready waybill
4. Wayplan Management list
5. Wayplan item detail view
6. Manifest print
7. Zone preview / auto-grouping
8. Dispatch handoff

## Files in this patch

```txt
WayplanCommandCenterPage.tsx
WayManagementPage.tsx
WayManagementPlanPage.tsx
WayplanManagementGoLivePage.tsx
WayplanZonePage.tsx
route_config_snippet.tsx
wayplan_consolidation_verify.sql
README_WAYPLAN_CONSOLIDATION.md
```

The duplicate pages are replaced with redirects to `/wayplan-command`.

## Replace these files

Replace your existing page files with:

```txt
src/pages/WayplanCommandCenterPage.tsx
src/pages/WayManagementPage.tsx
src/pages/WayManagementPlanPage.tsx
src/pages/WayplanManagementGoLivePage.tsx
src/pages/WayplanZonePage.tsx
```

If your project uses a different folder, copy them to the equivalent page directory.

## Route configuration

Keep one active page:

```tsx
<Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
```

Redirect old duplicate routes:

```tsx
<Route path="/way-management" element={<ConsolidatedWayplanRedirect />} />
<Route path="/way-management-plan" element={<ConsolidatedWayplanRedirect />} />
<Route path="/wayplan-management" element={<ConsolidatedWayplanRedirect />} />
<Route path="/wayplan-zone" element={<ConsolidatedWayplanRedirect />} />
<Route path="/wayplan-zones" element={<ConsolidatedWayplanRedirect />} />
```

See `route_config_snippet.tsx`.

## Sidebar/Menu configuration

Keep only one menu item:

```txt
Wayplan Command Center -> /wayplan-command
```

Remove or hide these duplicated menu items:

```txt
Way Management
Wayplan Management
Wayplan Zone
Wayplan Zone Management
```

## Backend dependencies used by the page

The page reads/calls:

```txt
RPC:
- be_wayplan_command_snapshot()
- be_sync_warehouse_to_wayplan(...)
- be_force_warehouse_receive_for_wayplan(...)
- be_wayplan_create_for_waybill(...)

Views/Tables:
- be_v_wayplan_queue
- be_wayplans
- be_wayplan_items
- be_wayplan_batches
- be_mobile_workforce_accounts
- fleet_master
```

The workforce and fleet tables are optional. If they are unavailable, the page still works.

## Deployment

```bash
npm run build
npx vercel --prod
```

Then hard refresh the browser:

```txt
Ctrl + Shift + R
```

## Verification

Run `wayplan_consolidation_verify.sql`.

For the UAT pickup, expected result after the fixes already done:

```txt
wayplan_headers       >= 1
wayplan_batches       >= 1
wayplan_items         = 30
large_shipment_rows   = 30
```

The page should show:
- Ready Queue when `READY_FOR_WAYPLAN` rows exist
- Wayplan Management when `ASSIGNED / READY_FOR_DISPATCH` rows exist
- Zone Preview from ready rows, or from created wayplan item rows when ready queue is empty
