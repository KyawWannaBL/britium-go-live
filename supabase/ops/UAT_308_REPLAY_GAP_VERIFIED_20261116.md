# Issue #308: verified UAT replay gap (2026-11-16)

**Do not merge or run this note as a migration.** The snapshot is an historical full-schema export, not an incremental patch.

## Verified read-only audit
- Production project `dltavabvjwocknkyvwgz`: 503 registered migrations, 1,045 public tables, 104 views, 2,580 functions, 599 public RLS policies, 291 Auth users.
- Isolated UAT `hgijdyfwmvskchsruknp`: `MIGRATIONS_FAILED`, 27 registered migrations, 242 public tables, 7 views, 1,247 functions, 242 public RLS policies, 0 Auth users.
- UAT branch records `MDY_UAT` and `INSEIN_UAT` both exist.
- `be_portal_pickup_requests` and `be_data_entry_parcels` are absent in UAT.
- `be_v_operational_chain` is absent in **both** UAT and production, so it is not a production-parity view gate.
- Production migration `20260721093501` stores 26,003 SQL statements (joined text 3,840,816 characters). The uploaded textual export has 106,404 physical lines (3,884,715 bytes). Whitespace/statement boundaries explain why raw digests are not directly comparable; prove ordered semantic equivalence separately.
- The uploaded snapshot starts with `DROP EXTENSION IF EXISTS pg_net` and unconditional `CREATE TYPE public.app_role`; UAT already has this enum.
- Enum differences: UAT `app_role` is missing lowercase `rider`, `driver`, `helper` compared with production. UAT `employee_role` includes `branch-office` while production has `SYS` instead. Do not silently replace enum definitions.

## Recovery gate
1. Preserve production and current UAT; leave this issue open.
2. In an authorized **disposable** database, replay all migration versions in sequence. Reconcile the historical full snapshot overlap by version-controlled source changes; no `DROP TYPE`, blanket `IF NOT EXISTS`, or migration-history manipulation.
3. Diff schema objects, dependencies, grants, RLS, views and functions against verified expected schema; run negative branch-isolation authorization tests.
4. Only after a clean reproducible replay: provision passwordless invitations in isolated UAT, configure protected dedicated Vercel UAT project and test pickup→temporary QR→branch scan→HQ transfer→delivery→COD.
5. Production deployment is out of scope of this recovery.

**Verified action this turn:** catalog queries only; no data changes or deployment.
