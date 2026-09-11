# Package 09 — Branch Office Go-Live

## Purpose
Branch performance snapshot for YGN, MDY, and NPT — today/month KPIs, staff roster, recent shipments.
Branch Office role is restricted to their own branch; admin/op_manager can see all.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/78-branch-office-go-live.sql` | RPCs: `be_branch_snapshot`, `be_branch_list`, verification |
| `src/lib/branchOfficeApi.ts` | Typed API helpers |
| `src/pages/BranchOfficePage.tsx` | Branch selector, KPI cards, staff table, recent shipments |
| `src/pages/BranchOfficeRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/78-branch-office-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_branch_go_live_verification();`

## RBAC
- View own branch: branch_office, supervisor
- View all branches: admin, operation_manager
