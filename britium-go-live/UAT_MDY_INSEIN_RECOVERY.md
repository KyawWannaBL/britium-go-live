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
