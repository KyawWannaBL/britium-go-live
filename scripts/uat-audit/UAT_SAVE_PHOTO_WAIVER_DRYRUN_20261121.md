# Britium Express — isolated UAT Save/Photo-Waiver rehearsal (2026-11-21)

## Scope and non-production safety
- Hosted isolated Supabase UAT `hgijdyfwmvskchsruknp`, 18 Auth users, 18 linked staff records, 16 branch-roster entries.
- Read-only comparison with production `dltavabvjwocknkyvwgz` only; no production DDL, DML, Auth changes or deployment.
- Runtime remains **`MUTATION_SHADOW`**. Do **not** enable financial writes or change the production portal.
- Existing UAT synthetic records: 2 pickup requests (ISN, MDY), 4 parcel detail rows, 2 draft wayplans, 0 published waybills.

## Completed changes and tests

### 1. Restored original photo-waiver RPC with UAT restrictions
Applied SQL: `scripts/uat-audit/uat-photo-waiver-synthetic-only-20261121.sql`

Original `be_data_entry_photo_waiver_v54(jsonb)` source function was adapted to:
- require a signed-in, active **global Super Admin** with a readable GLOBAL territory;
- accept **only** `P2026-ISN-901` and `P2026-MDY-901`, provided they still have the synthetic UAT merchant `UAT-QA` and the explicit no-actual-pickup address;
- require the exact server-allocated canonical `be_delivery_way_id_registry` Way ID for the pickup and sequence;
- preserve the original reason-required `WAIVE` / `CLEAR` semantics, `be_pickup_parcel_verifications` proof state and `be_audit_events` audit trail;
- prohibit function EXECUTE for `anon`; grant only to `authenticated`, while the internal role/territory checks deny other accounts.

Successful transactional tests:
- Global UAT Super Admin `WAIVE` on ISN QA parcel created an `APPROVED` proof row and the expected audit event inside a transaction.
- Authenticated Postgres `authenticated` role `WAIVE` on MDY QA parcel succeeded.
- Authenticated Insein branch manager invocation rejected with SQLSTATE `42501`.
- Every test was **rolled back**; no audit events, proof rows or waivers remained.

This is a **UAT-only** QA control, not blanket permission to omit real parcel proof.

### 2. Original Save transaction: successful DRY RUN (no commit)
- Source `be_data_entry_financial_v2_save(jsonb)` in hosted UAT matches the original production body (MD5 check).
- Save/Save All/Create Waybill functions already exist but are **not executable by `authenticated`**; this restriction has been preserved.
- A UAT Super Admin first invoked the synthetic-only photo waiver inside a rollback transaction, then called original Save with `dry_run:true` for a fictional Insein parcel. Result:

| Property | Result |
|---|---|
| `ok` | `true` |
| `dry_run` | `true` |
| `persisted` | `false` |
| `mutation_mode` | `MUTATION_SHADOW` |
| canonical Way ID | `D2026-ISN-0001` |
| item price | 20,000 MMK |
| delivery fee | 4,000 MMK |
| COD | **24,000 MMK** |
| `validation_status` | `OK` |
| `audit_written`, `idempotency_written` | `false` |

The prior `PARCEL_PHOTO_APPROVAL_REQUIRED` result was resolved **only inside this explicitly audited synthetic waiver rehearsal**. No permanent parcel was registered.

### 3. Missing canonical parcel table restored, locked
Applied SQL: `scripts/uat-audit/uat-canonical-data-entry-parcels-20261121.sql`

- Restored the original 64-column `public.be_data_entry_parcels` relation with PK/unique constraints, column defaults and types; the table remains **empty**.
- Enabled RLS and revoked direct `anon` and `authenticated` table privileges.
- Original four production write triggers are **not** restored. The table and writers are **not** approved for real operations.

## Write release gates and limitations
- A transaction-only `ACTIVE` financial-mode rehearsal was attempted but **blocked by the execution safety checks before SQL ran**. No test activated persistent financial writes.
- `be_data_entry_financial_v2_save(jsonb)`, `be_data_entry_financial_v2_save_batch_v22(jsonb)`, `be_data_entry_financial_v2_create_ready_waybill(jsonb)`: definitions present but app-role EXECUTE remains denied, so UI Save/Save All/Print is **not operational**.
- Restore and review original dependent function chain, canonical waybill ledger business triggers, database constraints, transaction idempotency, location/proof validation and authorization before considering app-facing write grants.
- Verify a clean **UAT-connected Vercel preview** and UAT-specific login credentials before browser acceptance. Earlier preview showed live production wayplans and must not be used for mutation tests.

## Final read-only verification
| UAT check | Value |
|---|---:|
| `auth.users` | 18 |
| staff registry | 18 |
| UAT branch roster | 16 |
| synthetic pickups | 2 |
| synthetic parcel details | 4 |
| draft wayplans | 2 |
| proof/audit rows | 0 / 0 |
| published waybills | 0 |
| saved registration rows | 0 |
| `be_data_entry_parcels` rows | 0 |
| financial mode | `MUTATION_SHADOW` |
| app-role Save EXECUTE | denied |
| app-role UAT photo waiver EXECUTE | enabled with restricted internal authorization |

The production account and wayplan counts were **read-only**: 307 Auth users and 76 wayplans at the last check. Earlier production had 75 wayplans; independently occurring live activity may change those counts. **No production writes were issued by this recovery.**

**Status:** Genuine approved-photo-waiver **Save dry-run PASS**. Real persisted Save, Save All, Waybill issuance, and Vercel browser UAT remain blocked.
