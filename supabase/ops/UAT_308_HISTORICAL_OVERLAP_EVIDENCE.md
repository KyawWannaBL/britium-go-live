# #308 historical migration overlap evidence — 2026-11-16

Scope: **read-only** comparison of two existing migration records in production catalog. Nothing was executed from either historical snapshot.

| Version | Migration | Stored statements | SQL text characters | CREATE TABLE statements | CREATE TYPE statements |
| --- | --- | ---: | ---: | ---: | ---: |
| `20260412000000` | `emergency_restore` | 7,480 | 966,925 | 194 | 21 |
| `20260721093501` | `remote_schema` | 26,003 | 3,840,816 | 868 | 22 |

**Table overlap:** 194 distinct names in the earlier restore; 867 parseable distinct table names in the later snapshot; **192 names in both**. The only two earlier names absent from the later snapshot were `role_permissions_2026_02_28_20_06` and `route_optimizations_2026_02_18_18_00`.

Both migrations contain unconditional `CREATE TYPE` definitions for `app_role` and `employee_role`. The later snapshot also drops `pg_net`, therefore **do not apply it against an already migrated database**.

The recovery branch currently contains an *empty* `supabase/migrations/20260721093501_remote_schema.sql` file, whereas the production migration history contains the full stored snapshot. The empty file is not a valid substitute: it creates a false sense of replay success while leaving core UAT tables absent.

## Required resolution

1. Treat the historical snapshots as overlapping **baselines**, not independent incremental migrations.
2. In a disposable Postgres/Supabase environment, build a reviewed, versioned bootstrap schema from the authoritative production **schema only** (no customer/finance/auth data). Keep enum definitions, function dependencies, grants, RLS, views and extensions in scope.
3. Decide and document the migration cutover version. Replay only incremental migrations **after** that baseline in isolation; validate after each stage.
4. Compare schema with production, record differences, and run negative authorization tests for MDY/INSEIN branch separation.
5. Apply only the verified baseline strategy to a *new* disposable UAT instance first; preserve existing `hgijdyfwmvskchsruknp` until replacement proves safe. **Do not** falsify `supabase_migrations` history, drop enums, or overwrite production.
6. Provision individual Auth invitations after the isolated schema is operational. Do not activate staff until end-to-end tests pass.

Source release gates:
- `supabase/ops/uat_308_readonly_release_gate.sql`
- `supabase/ops/uat_308_source_guard.mjs`

**Known status:** schema recovery incomplete; release gate fails; production unchanged.
