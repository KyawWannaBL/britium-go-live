# Package 05 — Warehouse Operations Go-Live

## Purpose
Intake scan, sort scan, zone management, and dispatch confirmation workflows for the warehouse team.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/74-warehouse-go-live.sql` | RPCs: `be_warehouse_intake_scan`, `_sort_scan`, `_dispatch`, `_summary`, `_list`, verification |
| `src/lib/warehouseApi.ts` | Typed API helpers |
| `src/pages/WarehousePage.tsx` | Tabs: Summary / Intake / Sort / Dispatch |
| `src/pages/WarehouseRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/74-warehouse-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_warehouse_go_live_verification();`

## RBAC: admin, operation_manager, warehouse, supervisor, dispatch
