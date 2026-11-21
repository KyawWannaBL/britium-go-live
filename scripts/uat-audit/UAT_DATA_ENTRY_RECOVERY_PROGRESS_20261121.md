# Britium Express — Data Entry hosted UAT recovery status
**As of 2026-11-21.** Target Supabase: `hgijdyfwmvskchsruknp` (hosted isolated UAT). Production: `dltavabvjwocknkyvwgz` (read-only inspections; no production mutation).

## Functional scope and preservation
- Historical customer, parcel and wayplan data have **not** been copied into UAT.
- 18 Supabase Auth identities, 18 linked staff registry entries, 16 branch roster entries preserved.
- Two synthetic, non-deliverable pickup requests: `P2026-ISN-901` and `P2026-MDY-901`, linked to 4 synthetic Data Entry parcel rows, 4 dispatch stops and 4 wayplan membership rows.
- Two corresponding wayplan headers have supervisor review **DRAFT**, no dispatch scans, and zero COD; not approved for field delivery.
- `be_data_entry_financial_v2_runtime_v58` remains `MUTATION_SHADOW`; transactional saves, finance mutation, waybill publication and settlement are **not activated**.

## New changes applied and verified

### Canonical pickup data, supervisor queue and branch-safe list
- Restored original **193-column** `be_portal_pickup_requests` structure (constraints/defaults, not the original write triggers), 32-column `be_app_notifications` schema and 153-column `be_v_supervisor_pickup_queue`.
- Supervisor view is **`security_invoker=true`** to respect caller row-level security.
- `be_data_entry_pickup_list_web_v16(integer)` and `be_data_entry_pickup_list_web_v16()` restored to the original 16-field response format but changed to **SECURITY INVOKER**, with scope enforced by live UAT `be_login_access_profile()` territory grants and pickup RLS. This is a deliberate UAT security adaptation, not a byte-for-byte production function.
- Verified using real Postgres `authenticated` role: Insein branch manager reads 1 pickup (ISN only), Mandalay manager 1 (MDY only), Super Admin 2, rider 0. Anonymous EXECUTE denied.
- `be_data_entry_pickup_safe_numeric_v16(text,numeric)` pinned to fixed `pg_catalog, public, pg_temp` search_path after security-advisor inspection.
- Notification table remains unpopulated, with no user-facing notification RLS policy. **Notification delivery remains untested**.
- The QA parcel rows and stops were linked to their canonical synthetic pickup IDs; cross-table per-pickup counts passed.

### Original calculation backend restored in UAT
- Restored **25 original production-derived financial calculation functions**, forming the 27-function named pricing closure together with previously restored V57 authorization functions.
- The top-level `be_data_entry_financial_v2_calculate(jsonb)` has an extra **UAT-only Data Entry `create` authorization gate**. `authenticated` is allowed EXECUTE; anonymous users are denied; nested functions have no public/client EXECUTE privileges.
- Installed five configuration tables from source structure with **only synthetic/verified test configuration**: `be_merchant_master`, `be_merchant_financial_profiles_v2`, `be_parcel_tariffs_v2`, `be_tariff_location_alias_v61_7_1`, `be_township_identity_v61_7`.
- Installed source-structured `public.parcels` (94 columns) **empty and closed to client roles**, because the legacy calculation checks monthly parcel volume. Its five FK dependencies (upload_batches, riders, enterprise_accounts, pickup_requests, delivery_zones) and production triggers are **deferred**, so this is not a production-equivalent writable parcel ledger.
- Synthetic `UAT-QA` merchant profile: STANDARD tier; five source-verified subset tariff rows covering Insein and Mandalay, including Royal tier test lookup entries. No production merchant/customer/contact/settlement-account dataset copied.
- Post-apply tests as actual `authenticated` Postgres role:
  - Insein: 20,000 MMK item + 4,000 MMK tariff = **24,000 MMK COD**, `ok=true`.
  - Mandalay: 20,000 MMK item + 6,000 MMK tariff = **26,000 MMK COD**, `ok=true`.
  - Returned financial payload explicitly labels `environment=UAT`.
  - Insein/Mandalay branch manager unauthorized for Data Entry calculation, SQLSTATE 42501.
- The production merchant financial profile table did **not** return profiles for GSK/GRS in the limited query. Their special fee/commission cases remain **unverified**; no merchant-specific terms were invented.

## Three-screen RPC inventory (presence by name only)
| Screen | Required names | Present | Missing |
|---|---:|---:|---:|
| Data Entry Financial V2 | 20 | **6** | **14** |
| Wayplan Command Center | 10 | 1 | 9 |
| Dispatch Command Center | 3 | 1 | 2 |
| **Total** | **33** | **8** | **25** |

The six Data Entry names present: form-schema, runtime-state, tariff-options, service-provider-options, pickup-list, financial-calculation. These are only the directly referenced static RPC names in three source pages; neither signatures nor end-to-end UI are fully certified by this count.

## Save/Publish dependency audit — still blocked
An initial recursive read-only production query over `be_data_entry_financial_v2_save`, `be_data_entry_financial_v2_save_batch_v22`, `be_data_entry_financial_v2_create_ready_waybill`, `be_data_entry_financial_v2_ready_sequences_v137`, and `be_data_entry_financial_v2_add_registrations` identified **39 function signatures**, **37 qualified nonfunction/unresolved reference names**, and a further unresolved scan frontier. These are not necessarily 37 missing functions; they include relations, and this audit is **not complete**.

Important relations still absent from UAT include:
- `be_waybill_ledger`, `be_data_entry_financial_v2_requests_v58`, `be_data_entry_register_rows`, `be_data_entry_register_batches`, `be_data_entry_parcels`, `be_data_entry_pending_drafts`;
- `be_delivery_location_registry`, `be_delivery_way_id_registry`, `be_delivery_way_id_aliases_v33`, `be_way_id_reconciliation_archive_v33`;
- `be_pickup_parcel_verifications`, `be_branch_offices`, `be_audit_events`;
- warehouse inventory, route/wayplan items and stop tables, and finance-projection dependencies.

The original save/waybill functions must **not** be installed with dummy ledger, ID-allocation, location, proof or audit responses. They remain absent and UAT write operations must remain locked.

## Security-advisor findings
Supabase security advisors still report wider-project WARN/INFO findings including mutable function search paths, executable SECURITY DEFINER functions, and GraphQL table visibility. The new numeric helper's search path was pinned. The intentionally authenticated financial-calculation SECURITY DEFINER RPC has a new UAT-only active-account/role authorization gate, but this still requires formal security review before release. Avoid general `USING (true)` RLS policies. See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

## Frontend acceptance and deployment gates
1. Verify the **actual UAT Vercel preview** uses `https://hgijdyfwmvskchsruknp.supabase.co` and its corresponding publishable key. A previous preview visibly showed production wayplan data and must not be used for write testing.
2. Test a real UAT password login; database-role simulations do not prove browser authentication.
3. Test read-only Pickup List, Data Entry form, tariff selections and Calculate in the browser with synthetic records.
4. Restore genuine Save/Save All, registration, photo verification, waybill ledger, publication and branch-specific RLS/trigger chain using original transaction semantics, then rehearse with rollback and dry-run approvals.
5. Test supervisor wayplan creation, warehouse scan, rider proof and finance COD/settlement end to end only after the write chain passes.
6. Keep production deployment unchanged.

## SQL files already applied (do not rerun; guarded)
- `scripts/uat-audit/uat-canonical-pickup-scope-list-20261121.sql`
- `scripts/uat-audit/uat-qa-pickup-linkage-20261121.sql`
- `scripts/uat-audit/uat-financial-calculator-staged-20261121.sql`
- `scripts/uat-audit/uat-pickup-safe-numeric-search-path-20261121.sql`
- Previously: `uat-data-entry-acl-schema-shadow-20261121.sql`, `uat-data-entry-limited-tariff-options-20261121.sql`, plus Wayplan/Dispatch read-only stages.

**Status:** Pickup reads and the original UAT-gated **Calculate** path pass isolated synthetic role/pricing tests. **Save, Save All, Print Waybill and wider operational write workflows are still blocked** by missing dependencies. No production changes.

---

## 2026-11-21 — Save/Waybill foundation follow-on (latest)

**Applied on hosted UAT only** after rollback rehearsals:

- `scripts/uat-audit/uat-save-waybill-foundation-20261121.sql`: restored **11 closed-RLS tables / 250 columns** for financial request idempotency, registration batches/rows, Way ID registry and aliases, location registry, pickup proof, audit events, branch offices and canonical waybill ledger. No historical data. Provisioned two labeled synthetic branch profiles (ISN and MDY). Neither `anon` nor `authenticated` has direct table SELECT/INSERT privileges. Production triggers / nonconstraint indexes still require targeted review.
- `scripts/uat-audit/uat-save-pickup-territory-guards-20261121.sql`: restored four original internal role/territory/pickup-guard helpers. Hardened pickup guard to reject unauthenticated users before role checks. Direct application EXECUTE revoked. Rollback tests showed Mandalay branch manager could read MDY synthetic pickup, was denied ISN pickup and create access; UAT Super Admin could access both.
- `scripts/uat-audit/uat-waybill-readiness-registration-state-20261121.sql`: restored original read-only `be_data_entry_financial_v2_ready_sequences_v137(text)` and `be_data_entry_registration_state_v1(text)`. Super Admin sees two registered synthetic parcel details and **zero ready-to-print waybill sequences**; unauthorized branch manager denied.
- `scripts/uat-audit/uat-data-entry-merchant-tier-options-20261121.sql`: restored original merchant-tier lookup with V57 Data Entry role check for the synthetic `UAT-QA` merchant. Branch manager receives `ok=false`, not profile data.
- `scripts/uat-audit/uat-data-entry-staff-progress-20261121.sql`: restored original V98 staff progress report with an added V57 Data Entry view gate. Test output includes the two synthetic pickups; branch manager denied.
- `scripts/uat-audit/uat-data-entry-phone-history-guarded-20261121.sql`: restored phone-history read function with added V57 role gate. A temporary synthetic phone lookup matched only for the authorized Data Entry actor and returned zero rows for branch manager. Temporary phone edit was rolled back.

**Post-apply proof:** actual `authenticated` PostgreSQL role can call registration state, readiness, merchant tier and staff progress; anonymous EXECUTE is denied for all five newly exposed read-only Data Entry functions. The temporary synthetic phone value is not stored.

### Updated static RPC-name availability

| Source screen | Required | Present | Missing |
|---|---:|---:|---:|
| Data Entry Financial V2 | 20 | **11** | **9** |
| Wayplan Command Center | 10 | 1 | 9 |
| Dispatch Command Center | 3 | 1 | 2 |
| **Total** | **33** | **13** | **20** |

Nine Data Entry RPC names still absent:
`be_data_entry_financial_v2_save`, `be_data_entry_financial_v2_save_batch_v22`, `be_data_entry_financial_v2_create_ready_waybill`, `be_data_entry_financial_v2_add_registrations`, `be_data_entry_photo_waiver_v54`, `be_data_entry_registration_delete_v1`, `be_delivery_location_batch_v10`, `be_delivery_location_review_batch_v23`, `be_review_parcel_photo`.

### Release blocker

**Save / Save All / Create Waybill are not yet functional or enabled.** The original write chain still needs the dependent operational schemas and functions, mandatory triggers, RLS/permissions, delivery-way ID allocation, audit semantics, canonical parcel validation, photo/location review and waybill publication rules, followed by transaction-rollback tests with synthetic UAT data. The writer should not be replaced with a success-returning placeholder, and `MUTATION_SHADOW` must stay set until validation and end-to-end browser tests pass.

**No production changes. No production deployment.** Vercel UAT configuration/login/browser operation not yet verified during this stage.
