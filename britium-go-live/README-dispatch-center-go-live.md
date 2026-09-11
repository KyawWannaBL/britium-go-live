# Package 08 — Dispatch Center Go-Live

## Purpose
Workforce roster, unassigned shipment queue, bulk assignment, and route management.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/77-dispatch-center-go-live.sql` | RPCs: `be_dispatch_workforce`, `_unassigned`, `_assign`, `_summary`, verification |
| `src/lib/dispatchApi.ts` | Typed API helpers |
| `src/pages/DispatchCenterPage.tsx` | Summary counters, workforce table, assignment modal |
| `src/pages/DispatchCenterRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/77-dispatch-center-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_dispatch_go_live_verification();`

## RBAC: admin, operation_manager, dispatch, supervisor
