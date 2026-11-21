# Britium Express — Isolated UAT Data Entry integrity, photo review and manual pin tests
**21 November 2026 | UAT only** `hgijdyfwmvskchsruknp`

## Objective
Continue recovering genuine Data Entry registration, photo proof and location review dependencies with **historical-data restoration excluded**. Production `dltavabvjwocknkyvwgz` was consulted **read-only** for function and trigger definitions. No production changes or Vercel promotion.

## 1. Six production-derived integrity triggers restored
Applied: [uat-six-integrity-triggers-20261121.sql](./uat-six-integrity-triggers-20261121.sql)

| Table | Trigger(s) |
|---|---|
| `be_data_entry_parcel_details` | `be_branch_registration_guard_details_v1`, `be_data_entry_canonical_delivery_way_id_v134`, `trg_be_data_entry_updated_at`, `trg_be_guard_terminal_parcel_status_coherence_v194` |
| `be_data_entry_parcels` | `be_branch_registration_guard_parcels_v1` |
| `be_waybill_ledger` | `be_branch_registration_guard_ledger_v1` |

The source trigger functions were restored from production, with no public/anon/authenticated direct function EXECUTE grants. The updated-at helper has a pinned search path. Rollback tests verified:
- ISN branch manager cannot register a parcel into either Data Entry parcel table or waybill ledger;
- canonical P-prefixed placeholder Way ID is changed to its server-allocated D-prefixed Way ID;
- contradictory `parcel_status=RTO` and `way_management_status=DELIVERED` are corrected;
- `updated_at` is refreshed;
- no synthetic QA test data persisted from the rehearsal.

**Limit:** This restores **6**, not all original triggers. Inspected production Save/Waybill tables carry 49 non-internal triggers; many are from the Oct-2026 protection epoch or depend on missing finance, warehouse, notification and address history schemas. UAT cannot be considered functionally equivalent until these dependencies are reconciled.

## 2. Parcel-photo review restored for synthetic QA only
Applied: [uat-parcel-photo-review-synthetic-only-20261121.sql](./uat-parcel-photo-review-synthetic-only-20261121.sql)

- Restored original `public.be_parcel_photo_reviews` table, 21 columns, PK, RLS enabled and client table privileges revoked.
- Restored `be_rider_safe_positive_integer(text)` internal helper with fixed search path.
- Restored `be_review_parcel_photo(jsonb)` using production business logic, with **extra UAT-only safeguards**:
  - only active, global-read-authorized UAT Super Admin may review;
  - only synthetic `P2026-ISN-901` or `P2026-MDY-901` pickup requests with known synthetic merchant/address;
  - APPROVE requires existing nonempty proof photo path/data/URL and rejects rows already marked as `photo_skipped`;
  - reviewer identity/email come from authenticated staff registry, ignoring client-supplied identity;
  - allow `authenticated` EXECUTE with internal authorization, deny `anon`.
- Rollback tests covered missing-evidence denial, fake proof-reference approval, REJECT setting `REUPLOAD_REQUIRED`, spoofed reviewer rejection, and branch-manager denial.
- Post-apply `SET LOCAL ROLE authenticated` test passed. **A mock path is not a real uploaded image**; Storage upload and media inspection still need UI/mobile tests.

## 3. Location Review V23/V29 restored for synthetic QA only
Applied: [uat-location-review-synthetic-manual-pin-20261121.sql](./uat-location-review-synthetic-manual-pin-20261121.sql)

- Restored the original `be_delivery_location_review_batch_v29(jsonb)` and `be_delivery_location_review_batch_v23(jsonb)` wrapper, with additional UAT-specific role, scope, and canonical Way ID constraints.
- Only the synthetic ISN/MDY pickup IDs and their four existing server-allocated D-prefixed Way IDs can be changed.
- Requires active global Super Admin with `can_update` scope, and financial runtime `MUTATION_SHADOW`.
- Manual `APPLY_CORRECTION` retains original coordinate, reason, manual pin confirmation, address/township, and audit checks.
- UAT `SKIP_REVIEW` additionally requires an **existing stored trusted Google exact-location suggestion** matching the coordinates and address; client-provided source claims alone are not trusted.
- Post-install authenticated-role MDY manual pin test recorded coordinates `21.97,96.08`, `ACCEPTED` review and a location audit event **inside the transaction**. Branch-manager denial confirmed. Transaction rolled back cleanly.
- This test verifies database validation, **not** browser Map interaction, geocoding or pin-to-textbox synchronization.

## 4. Combined synthetic UAT smoke test
A single transaction tested the following ordered pipeline:
1. A fictional parcel was given a mock evidence-path row (`uat-qa/fake-evidence-not-real-file.jpg`).
2. `be_review_parcel_photo` approved the row under `authenticated` Super Admin.
3. `be_delivery_location_review_batch_v23` accepted a confirmed manual pin at `16.9,96.1`, with an audit event.
4. The original `be_data_entry_financial_v2_save` returned **`ok=true`, `dry_run=true`, `persisted=false`** using the same user's authentication context. The Save RPC was invoked internally because the client `authenticated` role still has no EXECUTE on Save.
5. COD calculation matched: 20,000 MMK item + 4,000 MMK delivery = **24,000 MMK**; canonical Way ID `D2026-ISN-0001`.
6. `ROLLBACK`: no proof, location, audit, new registration or published waybill retained.

## 5. Updated static three-screen RPC inventory
| Screen | Referenced names | Installed | Still absent |
|---|---:|---:|---:|
| Data Entry Financial V2 | 20 | **18** | **2** |
| Wayplan Command Center | 10 | 1 | 9 |
| Dispatch Command Center | 3 | 1 | 2 |
| **Total** | **33** | **20** | **13** |

The two missing Data Entry names are `be_data_entry_financial_v2_add_registrations` (changes authorized parcel count) and `be_data_entry_registration_delete_v1` (destructive/archive workflow). They should not be exposed without transaction and audit validation. This is *name presence*, not full system coverage or UAT acceptance.

## 6. Final UAT preservation and release gates
| Item | Verified state |
|---|---|
| Auth users / staff accounts / branch roster | 18 / 18 / 16 |
| Synthetic pickups / parcel details / draft wayplans | 2 / 4 / 2 |
| Persistent photo proof / review / location / audit rows | **0 / 0 / 0 / 0** |
| Issued waybills | **0** |
| V58 mutation mode | `MUTATION_SHADOW` |
| `authenticated` Execute on Save and Create Ready Waybill | **False / False** |
| Original Oct-2026 write-guard schema and dependent triggers | **Not restored** |
| Vercel UAT browser login and isolation validation | **Not verified in this stage** |
| Production changes | **None** |

Security-advisor warnings remain in UAT: 118 mutable function search paths, 86 authenticated-executable SECURITY DEFINER functions, 71 anon-executable SECURITY DEFINER functions, plus broad GraphQL visibility warnings. This is a **project-wide** count, not all new regressions; specific new functions have scoped role guards. The RLS-enabled/no-policy notices on staged protected tables are intentional pending role-specific policies.

## Next safe implementation steps
1. Compare and restore October-2026 write epoch `private.be_oct2026_*` dependencies and the related terminal finance/warehouse/address-history triggers in a dedicated isolated rehearsal; do not bypass their controls.
2. Rehearse idempotency, write-audit and Waybill sync under transaction protection. Previously proposed temporary ACTIVE-mode write rehearsal was blocked before execution; **do not claim committed Save works**.
3. Test actual UAT-credential browser login and Vercel preview Supabase URL/key isolation before any user-facing mutation.
4. Validate real photo uploads, Google Maps pin persistence, Save/Save All and waybill printing, then warehouse scanning, wayplan, rider and COD flows.
5. Keep production unchanged until explicit sign-off and rollout approval.

**Status: Back-end photo approval → manual pin → real Save DRY RUN passed for synthetic UAT; committed write workflows remain blocked and production remains unchanged.**
