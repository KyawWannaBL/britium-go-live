# Britium Express — Isolated functional UAT progress (2026-11-21)

**Target only:** Hosted UAT `hgijdyfwmvskchsruknp`. Production `dltavabvjwocknkyvwgz` was read-only for this work.

## Changes executed and verified
1. **Synthetic UAT fixtures**: 2 draft-only wayplans (`UAT-QA-ISN-20261121`, `UAT-QA-MDY-20261121`), 4 synthetic parcel rows, 4 stops, 4 memberships, 2 `DRAFT` reviews. Zero dispatch scans and zero COD. No valid delivery addresses. `wayplan_status=CREATED`, but supervisor reviews are **DRAFT**, so these fixtures do **not** constitute a successful route-creation workflow or dispatch authorization.
2. **Branch isolation**: Transactional rehearsal returned one wayplan/two jobs to each of the Insein and Mandalay branch-manager identities and both wayplans/four jobs to an authorized UAT Super Admin. Test fixtures do not carry production identifiers.
3. **Region options**: Restored `be_wayplan_region_runtime_v19` (3 region rows) and a read-only `SECURITY INVOKER` `be_wayplan_region_options_v19()`. Yangon/Insein and Mandalay marked active for this UAT, Naypyitaw inactive. `authenticated` can SELECT under RLS and execute options RPC; `anon` cannot.
4. **User access profiles**: All 18 UAT registry identities returned `authorized:true` in a rollback-only simulation of `be_login_access_profile()`. This is **not** password validation or a browser login test.
5. **Preservation**: UAT auth users=18; account registry=18; branch roster=16. Production previously verified as 75 wayplans and 307 auth accounts and no production mutations were executed.

## Frontend RPC gap (name existence only, based on three active source pages)
| Screen | Requested distinct names | In hosted UAT | Missing |
|---|---:|---:|---:|
| Data Entry Financial V2 | 20 | 0 | **20** |
| Wayplan Command Center | 10 | 1 (`be_wayplan_region_options_v19`) | **9** |
| Dispatch Command Center | 3 | 1 (`be_dispatch_command_snapshot_v63`) | **2** |
| **Total** | **33** | **2** | **31** |

Source pages:
- `britium-go-live/src/pages/DataEntryFinancialV2Page.tsx`
- `britium-go-live/src/pages/WayplanCommandCenterPage.tsx`
- `britium-go-live/src/pages/DispatchCommandCenterPage.tsx`

The source page RPC inventory is **not complete coverage** of all screens or indirect API calls. Signature, permissions, trigger and end-to-end tests remain pending even where a name exists.

## UAT release gates
- [x] Isolated UAT storage and 18 Auth accounts preserved.
- [x] Authorized snapshot branch isolation with synthetic read-only fixtures.
- [x] Authenticated read-only region options for Yangon/Insein and Mandalay.
- [ ] Verify recovery-branch Vercel preview is built with `VITE_SUPABASE_URL=https://hgijdyfwmvskchsruknp.supabase.co` and the matching **publishable** key, never production. Current login-failure screenshot on a different preview showed production wayplans.
- [ ] Reverify successful email/password login for UAT-specific identities, using unique UAT credentials; current production accounts are not automatically present in UAT Auth.
- [ ] Restore real Data Entry access checks, runtime, tariffs, registration, calculations and waybill issuance; test via frontend with new records.
- [ ] Restore actual Wayplan creation/review/crew assignment, warehouse receipt and mandatory Dispatch scan functions with original guards and triggers; test via frontend.
- [ ] Verify rider pickup/delivery proof and finance, COD/settlement flows.
- [ ] Browser-level UAT acceptance, cleanup of synthetic fixtures, and explicitly separate production deployment authorization.

## GitHub change files
- `scripts/uat-audit/uat-synthetic-draft-smoke-fixture-20261121.sql` (already applied; guarded; do not rerun)
- `scripts/uat-audit/uat-wayplan-region-readonly-20261121.sql` (already applied; guarded; do not rerun)
- `scripts/uat-audit/uat-functional-readiness-preflight-20261121.sql` (read-only; safe to rerun)

**Status: Partial backend smoke test passed; full functional UAT remains blocked by 31 named RPCs missing from these three pages alone. Do not treat the system as ready or attempt production dispatch.**
