# Package 07 — Reporting Go-Live

## Purpose
Operational and financial period reports with charts (Recharts), KPI cards, and CSV export.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/76-reporting-go-live.sql` | RPCs: `be_report_operational`, `be_report_finance`, verification |
| `src/lib/reportingApi.ts` | Typed API helpers |
| `src/pages/ReportingPage.tsx` | Date range picker, KPI summary, charts, export |
| `src/pages/ReportingRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/76-reporting-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_reporting_go_live_verification();`

## RBAC
- Operational: admin, operation_manager, supervisor, auditor, finance
- Finance: admin, finance, accountant, auditor, operation_manager
