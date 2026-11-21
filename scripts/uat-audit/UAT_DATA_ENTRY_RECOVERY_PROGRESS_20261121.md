# Britium Express — Data Entry UAT recovery, 2026-11-21

## Scope
Connected hosted UAT project: `hgijdyfwmvskchsruknp`.
Production project `dltavabvjwocknkyvwgz` was queried read-only for source definitions and four tariff configuration values. Production was not modified.
Historical customer/parcel import is **out of scope**; only synthetic QA records remain.

## Database changes applied (both preceded by transaction/rollback rehearsals)

### V57 authorization + V2 form-schema metadata
- Tables restored from production column/constraint catalog: `be_data_entry_access_grants_v57`, `be_data_entry_access_mode_v57`, `be_role_authority_matrix`, `be_data_entry_financial_v2_runtime_v58`.
- UAT-only role authority matrix: 7 current UAT role types. Only `super_admin` has Data Entry and Waybill view/create/update/upload/export entries. Branch manager has *no* Data Entry permission (retains read-only Waybill matrix entry); warehouse, finance, and mobile roles cannot access the Data Entry form under this matrix.
- Original production function bodies installed: `be_data_entry_actor_access_v57(text,boolean)`, `be_data_entry_require_access_v57(text,boolean)`, `be_data_entry_financial_v2_schema()`, `be_data_entry_financial_v2_runtime_state()`.
- `actor_access` and `require_access` EXECUTE revoked from `PUBLIC`, `anon`, and `authenticated` (owner-internal calls only). Form schema and runtime-state RPC EXECUTE granted only to `authenticated`; anonymous execution denied.
- `be_data_entry_access_mode_v57` is `MATRIX_SHADOW`. `be_data_entry_financial_v2_runtime_v58` remains **MUTATION_SHADOW**: transactional registration/waybill financial writes not activated.
- Verified as real `authenticated` database role: Super Admin form schema returns `ok:true`; runtime `mutation_mode=MUTATION_SHADOW`; Insein branch manager form-schema permission denied with SQLSTATE 42501.

### UAT-only, limited tariff/provider options
- Tables created with RLS and authenticated SELECT: `be_data_entry_service_providers`, `be_data_entry_tariff_catalog`. RLS requires an authenticated user and active rows.
- Original invoker functions restored: `be_data_entry_service_provider_options_v13()`, `be_data_entry_tariff_options()`. EXECUTE limited to `authenticated`, not `anon`.
- Seeded **only three service providers**: Britium, DK Delivery, Mandalay Branch, and **only four published test tariff rows**. Source rates from read-only production tariff catalog:
  - Insein / Britium: 4,000 MMK.
  - Mandalay (Royal) / DK Delivery: 6,000 MMK.
  - Chanayethazan / Mandalay Branch: 6,000 standard, 5,000 special MMK.
  - Mandalay / Mandalay Branch: 6,000 standard, 5,000 special MMK.
- Verified as real `authenticated`: 3 providers returned, 4 tariff rows returned, schema `ok:true`. This **is not the full live tariff catalog**.

## Preserved UAT state
- auth.users = 18; be_user_account_registry = 18; branch roster = 16.
- 2 draft synthetic QA wayplan headers; 4 synthetic parcel rows; no real customer delivery requests or COD.
- No historical dataset or production Auth users imported.

## Remaining 3-screen static RPC-name gap
| Screen | Previously found | Now found | Still missing |
|---|---:|---:|---:|
| Data Entry Financial V2 (20) | 0 | 4 | 16 |
| Wayplan Command Center (10) | 1 | 1 | 9 |
| Dispatch Command Center (3) | 1 | 1 | 2 |
| **Total** | **2 / 33** | **6 / 33** | **27** |

This is name-based only and is not a complete app-wide RPC signature or permission audit.

## Real registration/waybill blockers
- `be_data_entry_financial_v2_calculate(jsonb)` depends on a chained legacy business pricing implementation, including ~21 functions identified in the initial dependency closure, the merchant financial profiles, parcel tariff tables, lookup functions and business date handling. Do **not** replace it with a flat fixed-price stub.
- `be_data_entry_financial_v2_save(jsonb)` needs the delivery-way ID allocator, alias reconciliation, pickup authorization, financial validation, location registry and waybill ledger, none fully restored.
- `be_data_entry_financial_v2_save_batch_v22(jsonb)` and `be_data_entry_financial_v2_create_ready_waybill(jsonb)` also need pickup requests, audit events, V58 request tracking, access guards, publication checks and downstream ledger synchronization.
- Production `be_data_entry_pickup_list_web_v16` uses a supervisor pickup queue view and `be_portal_pickup_requests` plus territory permission checks; no empty-response stub installed.
- All real mutations, existing production financial logic, branch scoping and proof/warehouse requirements remain release gates.

## Follow-up sequence
1. Restore the canonical pickup-request schema, its view and authorization helpers; seed explicitly synthetic branch-scoped pickup requests and validate the authenticated Data Entry pickup list.
2. Rebuild financial calculation dependency closure with real tariffs/merchant master and run pricing scenario fixtures (including GSK/GRS/merchant COD cases) **before** allowing mutations.
3. Restore save, calculate-all, publish waybill and ledger integration with audit/trigger/permission checks.
4. Run the actual Vercel UAT preview against **isolated** Supabase URL/key, test authenticated login, registration, Save All and Waybill print, then warehouse scan/wayplan/rider/finance flows.
5. Do not merge to production or use the previously production-connected preview for write tests.

## Applied SQL (do not rerun; guarded against existing objects)
- `scripts/uat-audit/uat-data-entry-acl-schema-shadow-20261121.sql`
- `scripts/uat-audit/uat-data-entry-limited-tariff-options-20261121.sql`

**Status: READ-ONLY Data Entry metadata and limited tariffs ready in hosted UAT. Parcel registration, financial calculation and Waybill creation still NOT operational.**
