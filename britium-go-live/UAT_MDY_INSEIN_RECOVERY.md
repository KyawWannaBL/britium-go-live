# Mandalay & Insein isolated UAT recovery — 2026-11-16

## Intended environment
- Supabase development branch: `branch-uat-mdy-insein-20261116` (project ref `hgijdyfwmvskchsruknp`), **with_data=false**.
- Dedicated Vercel project: `britium-uat-mdy-insein`, team `britium-ventures-website`.
- Git branch: `uat/mdy-insein-isolated-20261116`. Never merge this UAT-only Supabase rewrite into Production `main`.
- Portal `/supabase/:path*` must point exclusively to `https://hgijdyfwmvskchsruknp.supabase.co/:path*`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be from the isolated project. The UAT client rejects a different backend URL.

## Verified blockers
1. Supabase branch status is `MIGRATIONS_FAILED`, including after requesting a `rebase_branch`. Public tables: 249 versus 1,149 in current Production; key modern objects (`be_user_account_registry`, `be_branch_offices`, `be_role_authority_matrix`, `be_branch_intake_parcels_v1`) are missing.
2. **Exact migration error verified in Supabase `workflow_run_logs` on 2026-11-16 at 07:18:07 UTC:** `20260721093501_remote_schema.sql` fails at statement 2 with `ERROR: type "app_role" already exists (SQLSTATE 42710)`. The first 24 earlier baseline migrations have already created that enum. Production's `remote_schema` migration comprises **26,003 SQL statements / roughly 3.8 MB**, including hundreds of tables, functions, indexes, policies and grants. **Inventory comparison:** of 868 table definitions in that snapshot, 235 already exist on UAT while 633 are missing. This makes naive replay fail on duplicates and naive skipping omit hundreds of tables. Merely skipping the migration, marking it applied, or dropping/renaming `app_role` would be unsafe and leave the UAT schema incomplete. Do not take those shortcuts.
3. Branch Auth users: 0. No actual employee test credentials have been provisioned or distributed.
4. The exact existing Vercel project is `prj_Gugvuie3OTr0ZXkRub21G4jTyDew`, at https://vercel.com/britium-ventures-website/britium-uat-mdy-insein. The owner's dashboard screenshot **confirms it exists, is GitHub-connected and has preview branches**, but has no successful UAT Production deployment. The connected Vercel MCP identity gets 404 when inspecting project details and 403 when listing deployments, so it cannot inspect deployment logs, production-branch settings or environment variables. Do not create a duplicate project.
5. GitHub status for the UAT PR reports the separate `Vercel – britium-uat-mdy-insein` check as failed. This is a Vercel deployment failure, not proof of a repository code-build failure; the exact cause remains unavailable until deployment build logs can be accessed.
6. Do not invite staff or publish a UAT link before backend isolation, schema compatibility and account provisioning pass.

## Exact remaining actions
1. **Use the existing Vercel project**, not a duplicate. Have a team owner inspect the failed deployment **Build Logs**, verify **Vite / root directory `britium-go-live` / output directory `dist`**, and set its production branch to `uat/mdy-insein-isolated-20261116` (never the repository `main`). The UAT branch's `prebuild` now emits explicit `UAT_CONFIG_ERROR` messages when Vercel variables are missing or point at Production. Configure `VITE_SUPABASE_URL=https://hgijdyfwmvskchsruknp.supabase.co` and a **publishable/anon** key from that same UAT project; optional `VITE_NATIVE_SUPABASE_PROXY_URL` must also point to that project. Keep credentials in Vercel settings, not screenshots or source code.
2. **Correct the baseline-schema migration design in an isolated rehearsal environment.** The 20260721093501 remote-schema snapshot is duplicating objects created by April baseline migrations. Reconcile the full migration sequence and dependencies rather than skipping the snapshot or dropping live enum types. Validate a clean schema-only replay on an empty test project/branch; **never copy live waybills, COD ledgers, or Auth users**. Only after rehearsal passes should the chosen safe migration repair be applied to the UAT branch. Do not reset the current UAT schema blindly.
3. Run a read-only schema compatibility audit for user registry, branch directory, RBAC, pickup temporary QR, warehouse, wayplan, transfer, rider and finance interfaces.
4. Provision 8 UAT users for Mandalay and 8 for Insein through the supported Supabase Auth admin/invitation flow, assign branch-scoped roles and one-time password setup. Never set known default passwords.
5. Verify login for each branch role, that branch users cannot access the other branch, and that UAT sign-in cannot reach Production.
6. End-to-end test: inbound existing Way ID; temporary QR; branch evening manifest; physical load scan; HQ receive scan; HQ conversion to permanent Way ID; local rider pickup/delivery; failed reason and Return Scan; supervisor approval; COD isolation.
7. Mark UAT ready and communicate the confirmed URL and test-account roster only after all required steps pass.

## Planned role quantities (not provisioned)
- Mandalay: Manager 1, Rider 3, Warehouse 1, Finance/Cashier 1, Driver 1, Helper 1.
- Insein: Manager 1, Rider 3, Warehouse 1, Finance/Cashier 1, Driver 1, Helper 1.

**Release gate:** Draft only; never promote or merge into Production main.


## Follow-up audit — 2026-11-16 (after Vercel READY)
- Owner-provided Vercel screenshot shows the **dedicated UAT frontend deployment is READY** on its own project. This does **not** certify working login, backend schema, or UAT acceptance; any older frontend-deployment blockers above are historical.
- Live read-only isolated Supabase check: **249 public tables**, **27 recorded migration ledger entries**, **0 users in auth.users**, and the **app_role enum already exists**.
- Live schema check: **missing** `public.be_user_account_registry`, `public.be_branch_offices`, `public.be_role_authority_matrix`, `public.be_branch_intake_parcels_v1`, and `public.be_login_access_profile` RPC.
- Supabase branch status remains **MIGRATIONS_FAILED**. Do not rebase/reset or mark snapshot migration applied to conceal the conflict; repair the full 26,003-statement snapshot vs. baseline dependencies in an isolated schema-only rehearsal first.
- Read-only repeatable audit added: `sql/audits/uat_mdy_insein_schema_gate_readonly.sql`. It must pass before account provisioning or invitations.
- **No UAT Auth accounts created**. The connected Supabase tools do not expose an Auth-admin invitation/create-user action; do not write directly into `auth.users`, do not invent user emails, and do not assign shared passwords. Use the official Supabase Dashboard or a scoped server-side Auth Admin action after schema/RLS readiness, with verified staff identities.
- Keep Production `main` and Production Supabase unchanged. Never copy live parcels, finance data, or Auth users into UAT.


## Authorized temporary schema rehearsal — 2026-11-16
- User explicitly approved a new Supabase rehearsal branch at **US$0.01344/hour**; cost confirmation accepted.
- Created branch `rehearsal-mdy-insein-20261116-schema`, id `2f3ba906-14a1-4083-aa3d-4565d8e7b7c5`, project ref `omxttoaopfafltphtybg`, parent `dltavabvjwocknkyvwgz`, `with_data=false`.
- On creation response and immediate status check, branch is `CREATING_PROJECT`. Query access shows zero auth.users, no account registry, no branch registry, and the initial migration listing has 7 April versions; **do not mistake this intermediate state for final migration failure or success**.
- Never publish the rehearsal URL or use for production/employee logins. Do not copy production records.
- **Delete the temporary branch when testing is finished to stop hourly charges** using branch id above. Do not delete the separate existing operational UAT branch.


## Fresh hosted rehearsal result — 2026-11-16
- Approved hourly US$0.01344 temporary rehearsal branch `omxttoaopfafltphtybg` was created with `with_data=false`.
- Automated migration runner reported `MIGRATIONS_FAILED` after only **7 April 2026 migrations**; new database had no UAT Auth users or modern branch tables.
- Direct PostgreSQL logs showed first concrete error at `2026-11-16T08:48:51.477Z`: `function public._quote_ident_like(text, text) does not exist`. This precedes the later July `app_role` duplication problem.
- Retrieved exact `public._quote_ident_like(text,text)` function definition using read-only `pg_get_functiondef` on Production. Applied definition to **temporary rehearsal project only**, not operational UAT or Production. Direct `to_regprocedure` and function invocation checks PASSED.
- Archived UAT-only repair candidate `sql/candidates/uat_quote_ident_like_dependency.sql` for ordered-migration source reconciliation. Applying this helper after the initial migration failure does **not** retroactively mark the branch healthy or complete the full replay.
- Do not assign logins until the initial migration source sequence is repaired and the full branch replay succeeds. Do not manually spoof the Supabase migration ledger. Delete temporary branch when done to stop charging.
