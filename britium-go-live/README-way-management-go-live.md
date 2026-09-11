# Package 03 — Way Management Go-Live

## Purpose
Shipment control tower — master-detail list, cargo event timeline, status updates, and return initiation.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/72-way-management-go-live.sql` | RPCs: `be_way_management_list`, `_detail`, `_update_status`, `_initiate_return`, verification |
| `src/lib/wayManagementApi.ts` | Typed API helpers |
| `src/pages/WayManagementPage.tsx` | Master-detail shipment control tower |
| `src/pages/WayManagementRoutes.snippet.tsx` | Route/nav integration snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/72-way-management-go-live.sql`
2. Extract `src/` into portal `src/`
3. Add route per snippet
4. Verify: `SELECT be_way_management_go_live_verification();`

## RBAC
- View: admin, operation_manager, supervisor, cs, dispatch
- Edit: admin, operation_manager, supervisor, cs
