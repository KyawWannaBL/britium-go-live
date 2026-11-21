# Britium Express — Hosted UAT October write-control / finance / address audit restoration
**Date:** 2026-11-21  
**Scope:** Isolated UAT `hgijdyfwmvskchsruknp`. Production `dltavabvjwocknkyvwgz` queried read-only. Historical production records explicitly out of scope.

## Applied — October write-control core, inactive

SQL: `scripts/uat-audit/uat-oct2026-inactive-epoch-foundation-20261121.sql`

Restored these private schema objects directly from production definitions:
- Tables `private.be_oct2026_epoch`, `private.be_oct2026_identity_links`, `private.be_oct2026_retired_keys`.
- Functions `private.be_oct2026_key_family(text,text)`, `private.be_preparation_row_allowed_v1(text,jsonb)`, `private.be_oct2026_write_guard()`.

UAT epoch label: `UAT-2026-11-21`; `is_active=false`, with a synthetic future cutoff. Production epoch `2026-11-01` and its activation state were **not** copied. No operational Oct-2026 guard triggers were attached. `MUTATION_SHADOW` stays on.

Rollback-only guard tests using a **temporary** synthetic table confirmed:
1. Inactive epoch leaves an ordinary synthetic insert unaffected.
2. Temporarily activating with future cutoff rejects a write (SQLSTATE `55000`).
3. When the simulated cutoff passes, a permitted synthetic write proceeds.
4. A synthetic retired key is rejected (SQLSTATE `22023`).

The temporary epoch change, test table, and retired key were all **rolled back**.

## Applied — 16 identity-ledger structures, no historical IDs

SQL: `scripts/uat-audit/uat-oct2026-empty-identity-ledgers-20261121.sql`

- Created 16 one-column private identity tables (15 UUID keys and 1 integer key), each with original ID type and primary-key constraint.
- Restored 16 production-derived `parent_table` / `parent_column` / `identity_table` / `parent_type` mappings to `private.be_oct2026_identity_links`.
- All 16 identity tables have RLS enabled, no direct `anon` or `authenticated` grants, **zero rows**.
- Production had approximately **65,252** retired-key records when checked; **none imported** into UAT, per historical-data-isolation policy. Hence this remains a **test-only** epoch, not production-equivalent.
- Simulated an `AFTER INSERT` guard on temporary `parcels(id uuid)`; its synthetic UUID was recorded in the corresponding private identity table inside the transaction. Transaction rolled back.

**Do not set `is_active=true` permanently** or attach the Oct-2026 guard to broad operational tables until the app's epoch header, historical/key reuse risk, and missing parents and triggers have been checked.

## Applied — recipient address-history integrity

SQL: `scripts/uat-audit/uat-address-history-audit-trigger-20261121.sql`

- Restored source-accurate nine-column `public.be_delivery_address_history` (BIGINT identity PK, CHECK constraint, timestamps and before/after JSONB).
- Enabled RLS and denied all direct client-table access because address history contains recipient personal data.
- Restored `private.be_capture_delivery_address_history()` (SECURITY DEFINER, fixed empty search path), direct EXECUTE revoked from public/client roles.
- Attached `parcel_detail_address_history` to UAT `be_data_entry_parcel_details`.
- Synthetic transaction tests proved changing recipient address writes one audit row and preserves `actor_id` from `auth.uid()`. Updating only parcel status did not generate an address history record.
- Transaction rolled back. Persistent address-history table currently contains **zero** rows.

## Applied — original pre-dispatch finance policy and sync

SQL: `scripts/uat-audit/uat-finance-predispatch-cod-sync-20261121.sql`

- Restored source-accurate 20-column `public.be_finance_predispatch_reviews_v1` with PK, RLS enabled and all direct client-table access revoked.
- Restored `public.be_finance_cod_policy_v2(text,numeric,integer)`, `public.be_parcel_cod_service_fee_sync_v1()`, `public.be_finance_predispatch_sync_from_parcel_v1()`.
- Attached source triggers `trg_be_parcel_cod_service_fee_sync_v1` (before parcel financial changes) and `be_finance_predispatch_sync_from_parcel_v1` (after financial changes).
- Direct function EXECUTE revoked from public, anon and authenticated roles; internal triggers execute as designed.
- Rollback tests verified a synthetic parcel update creates one matching finance-review record and synchronizes its pickup finance status. Repricing from 24,000 to 350,000 MMK updates the existing review record rather than duplicating it; calculated COD service fee equals the original `be_finance_cod_policy_v2` result.

## Combined post-apply regression (ROLLBACK ONLY)

Within a single UAT rollback transaction:
1. Updated one fictional ISN parcel contact/address and set 24,000 MMK COD; generated exactly one address-history row and one finance pre-dispatch review.
2. Applied a synthetic-only, reason-logged parcel-photo waiver under UAT global Super Admin.
3. Applied manual location pin `16.9, 96.1` with an audit entry.
4. Called the original `be_data_entry_financial_v2_save(jsonb)` using `dry_run=true`, with 20,000 MMK item + 4,000 MMK delivery = 24,000 MMK COD. Assertion: `ok=true`, `persisted=false`.
5. Verified 1 transient address history, 1 finance review, 1 location, 1 photo verification, **0 issued waybills**.
6. Executed `ROLLBACK`; every synthetic change was discarded.

The test does not prove committed Save, Save All, financial settlement, publication, or browser/mobile use.

## Final UAT preservation check

| Invariant | Verified |
|---|---:|
| Auth users / account registry / branch roster | 18 / 18 / 16 |
| QA pickups / parcel details / draft wayplans | 2 / 4 / 2 |
| Published waybills / registered new rows | 0 / 0 |
| Persistent address history / finance reviews / photo proofs / locations | 0 / 0 / 0 / 0 |
| Mutation mode | `MUTATION_SHADOW` |
| Oct-2026 private epoch | **INACTIVE** |
| Identity mappings / identity ledgers | 16 / 16 |
| Imported retired IDs | **0** |
| `authenticated` EXECUTE on Save / Save All / Create Waybill | **false / false / false** |
| Data Entry parcel details currently installed noninternal triggers | **7** |
| Canonical parcels / Waybill ledger installed triggers | 1 / 1 |

## Remaining release gates

- **Oct-2026 activation:** reconcile production retired-key policy, existing UAT IDs, epoch request headers, identity-map parents, pending October triggers and other cutover policy. Do not copy production live retired-key dataset blindly.
- **Triggers:** many production triggers remain absent, including October row/truncate guards on registration/ledger, finance projection, warehouse, and pickup event/notification workflows. The current staged schema is not full migration equivalence.
- **Save/Save All/Waybill:** writer business transaction, idempotency, and authoritative finance/waybill ledger synchronization need a controlled committed-write rehearsal on synthetic data and security review. App-facing EXECUTE remains revoked.
- **UAT frontend:** verify an actual UAT-isolated Vercel build and UAT login, then real photo upload, Google Maps pin and lat/long persistence, workflow progression, printing and scanning.
- **Security:** Supabase advisors still report project-wide mutable search paths and executable SECURITY DEFINER functions. New private functions have direct EXECUTE revoked; project-wide findings must be triaged before release.
- **Production:** no changes/deployment during this work.

**Overall: The original write-epoch core, empty identity mapping structures, address audit, and finance pre-dispatch sync are staged and tested. The real application write release remains blocked intentionally.**
