# Package 06 — Waybill & Invoice Go-Live

## Purpose
Label printing queue management and invoice approval/rejection workflow.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/75-waybill-invoice-go-live.sql` | RPCs: `be_label_queue`, `be_mark_waybill_printed`, `be_invoice_list`, `be_invoice_approve`, verification |
| `src/lib/waybillInvoiceApi.ts` | Typed API helpers |
| `src/pages/WaybillInvoicePage.tsx` | Two-tab UI: Label Queue + Invoice Approval |
| `src/pages/WaybillInvoiceRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/75-waybill-invoice-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_waybill_invoice_go_live_verification();`

## RBAC
- Label Queue: admin, operation_manager, cs, data_entry, supervisor, finance
- Invoice Approval: admin, finance, accountant, operation_manager
