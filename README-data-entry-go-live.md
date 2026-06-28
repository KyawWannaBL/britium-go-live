# Package 04 — Data Entry / Bulk Upload Go-Live

## Purpose
CSV bulk shipment upload with row-level validation, batch submission, and upload history.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/73-data-entry-go-live.sql` | RPCs: `be_validate_bulk_row`, `be_bulk_upload_history`, `be_bulk_submit_batch`, verification |
| `src/lib/dataEntryApi.ts` | Typed API helpers |
| `src/pages/DataEntryPage.tsx` | Upload zone, validation table, history panel |
| `src/pages/DataEntryRoutes.snippet.tsx` | Route snippet |

## CSV Template Columns
`merchant_code, recipient_name, recipient_phone, delivery_address, delivery_township, weight_kg, service_tier, payment_method, cod_amount, priority, rider_remarks`

## Apply Instructions
1. Run SQL: `supabase/sql/73-data-entry-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_data_entry_go_live_verification();`

## RBAC: admin, operation_manager, data_entry, cs
