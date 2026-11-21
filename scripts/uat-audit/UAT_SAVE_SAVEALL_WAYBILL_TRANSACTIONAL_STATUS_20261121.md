# Britium Express — Hosted UAT Save, Save All and Waybill test results
**Date:** 2026-11-21. **Isolated UAT:** `hgijdyfwmvskchsruknp`. **Production:** `dltavabvjwocknkyvwgz` (read-only inspections; no production mutation).

## What actually passed

1. **Canonical Way ID allocator**: original `be_allocate_delivery_way_id`, legacy allocator, stem function and cargo-events schema restored in UAT with client EXECUTE revoked. Transactional tests proved stable IDs for repeat calls and different IDs for different parcel sequences.
2. **Synthetic test records reconciled**: the four original QA placeholder Way IDs were converted to server-assigned:
   - Insein: `D2026-ISN-0001`, `D2026-ISN-0002`.
   - Mandalay: `D2026-MDY-0003`, `D2026-MDY-0004`.
   - Parcel details, dispatch stops and wayplan membership were reconciled transactionally. Only synthetic QA records were altered. No published parcels or real customer records.
3. **Financial/audit schemas**: original structure of `be_parcel_financial_audit_v2`, `be_way_id_reconciliation_archive_v33` and `be_finance_calculation_projection_v4` restored with RLS enabled and all client table access revoked. Production triggers are deferred.
4. **Core Save (original production-derived function body)**:
   - A full synthetic transaction in temporary `ACTIVE` mode generated one canonical parcel, one registration row, one financial audit entry and one idempotency request. **Entire test ROLLBACK**.
   - The full Save wrapper also passed with a temporary simulated approved pickup-photo record. This is *not* proof of actual rider photo upload.
5. **Save All**: original production Save/Save All and legacy functions installed, execution closed to `anon` and `authenticated`.
   - Invalid second row → `SAVE_BATCH_ROLLED_BACK`, **zero** parcels/registrations persisted inside that batch.
   - Two valid rows → both canonical parcels, registrations and audits saved in the transaction.
   - Same request ID/payload replay → idempotent response with no extra rows.
   - Repeatable regression script reran successfully on the **persisted, installed** code; test transaction ended with `ROLLBACK`.
6. **Waybill readiness and publication**:
   - Original `be_data_entry_financial_v2_create_ready_waybill(jsonb)` and UAT-scoped helpers staged with browser/client EXECUTE revoked.
   - Unverified field collection was rejected by readiness checks.
   - With temporary synthetic verified pickup and proof status, the original readiness-only `dry_run=true` returned two ready parcels and no publication.
   - A separate rollback-only full publication test returned `ok=true`, `persisted=true`, `waybill_created=true`, `printable_count=2`, and idempotent replay without duplicate `be_v32_parcels` entries.
   - `be_v32_parcels` (41 columns) and private publishing helpers were restored **without** the three production `private.be_oct2026_write_guard()` triggers. Its application table privileges remain closed. Real PDF rendering and rider uploads remain untested.
   - The separate `be_waybill_ledger` stayed empty during publication. **Production also currently has 10 rows in `be_v32_parcels` and zero `be_waybill_ledger` rows**, so ledger-zero alone cannot be called a synchronization defect; verify the downstream ledger lifecycle separately.
   - For test integrity, all rider proof paths/approvals were **fictional and transaction-only**. No actual customer/employee proof file uploaded.

## Verified current persistent UAT state after all tests

| Object | Count |
|---|---:|
| Auth users | 18 |
| Account registry | 18 |
| Branch roster | 16 |
| Synthetic pickup requests | 2 |
| Synthetic parcel-detail rows | 4 |
| Canonical test Way IDs | 4 |
| Draft Wayplan headers | 2 |
| `public.parcels` | 0 |
| Data Entry registered rows | 0 |
| `be_v32_parcels` printable rows | 0 |
| Waybill ledger rows | 0 |
| Financial audit rows / request idempotency rows | 0 |
| Saved delivery locations / photo proof rows | 0 |
| Financial runtime | **MUTATION_SHADOW** |

`anon`/ `authenticated` cannot execute Save, Save All or Create Waybill yet. Data Entry calculator and the protected location-batch reader remain accessible to properly authorized authenticated users.

## Static frontend RPC availability

| Source screen | Present names | Required names | Missing names |
|---|---:|---:|---:|
| Data Entry | 15 | 20 | 5 |
| Wayplan | 1 | 10 | 9 |
| Dispatch | 1 | 3 | 2 |
| **Total** | **17** | **33** | **16** |

The five remaining Data Entry RPC names are `be_data_entry_financial_v2_add_registrations`, `be_data_entry_photo_waiver_v54`, `be_data_entry_registration_delete_v1`, `be_delivery_location_review_batch_v23`, `be_review_parcel_photo`.

**Name presence is NOT release-readiness**: 3 existing Data Entry write RPCs have application EXECUTE intentionally revoked.

## Applied UAT SQL, do not rerun
- `scripts/uat-audit/uat-delivery-id-allocation-foundation-20261121.sql`
- `scripts/uat-audit/uat-delivery-way-alias-internal-helper-20261121.sql`
- `scripts/uat-audit/uat-save-finance-audit-reconciliation-20261121.sql`
- `scripts/uat-audit/uat-reconcile-synthetic-canonical-wayids-20261121.sql`
- `scripts/uat-audit/uat-original-save-internal-dry-run-20261121.sql` — initial preview-only implementation, superseded by the original shadow-mode source
- `scripts/uat-audit/uat-save-original-shadow-no-client-execute-20261121.sql`
- `scripts/uat-audit/uat-save-saveall-original-shadow-no-grants-20261121.sql`
- `scripts/uat-audit/uat-data-entry-location-batch-scope-20261121.sql`
- `scripts/uat-audit/uat-waybill-readiness-preview-internal-20261121.sql`
- `scripts/uat-audit/uat-waybill-private-publication-foundations-20261121.sql`

## Regression tests — read warning before rerunning
- `scripts/uat-audit/uat-saveall-atomicity-regression-rollback-20261121.sql`
- `scripts/uat-audit/uat-waybill-publication-rollback-regression-20261121.sql`

These tests explicitly switch financial mode to ACTIVE **only inside BEGIN/ROLLBACK** and insert synthetic photo-approval rows. They are suitable **only** for controlled database transactional testing, not as production migrations. **Never split their statements or use them in production**.

## Remaining release gates
1. Verify and deploy the Vercel UAT frontend against the isolated Supabase URL and matching publishable key. A previously viewed Vercel preview displayed production records; **do not test live operations there**. Real UAT login remains unverified.
2. Restore and test the actual rider pickup/photo approval workflows and Data Entry photo waiver/location review functions, including access control and storage policies.
3. Review/adapt the **production epoch write guard triggers** for `be_v32_parcels`, plus original write guard, audit and branch-specific RLS policies across Save/Waybill/warehouse tables. Do not grant user-facing Save/Publish EXECUTE until these pass.
4. Verify Waybill print/PDF from `be_v32_parcels`, full ledger lifecycle, warehouse receipt and dispatch scanning, route creation/crew acceptance and COD/settlement synchronization.
5. Run browser end-to-end UAT with fresh synthetic data. Only then, and after a deliberate permission review, consider transitioning UAT from `MUTATION_SHADOW` to controlled testing mode. **Do not change production**.

**Status: core backend Save, Save All, and Waybill publish are demonstrated by rollback-only synthetic transactions. Still NOT ready for staff-operated functional UAT, browser Save or production release.**
