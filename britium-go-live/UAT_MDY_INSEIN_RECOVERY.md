# Mandalay & Insein isolated UAT recovery — 2026-11-16

## Intended environment
- Supabase development branch: `branch-uat-mdy-insein-20261116` (project ref `hgijdyfwmvskchsruknp`), **with_data=false**.
- Dedicated Vercel project: `britium-uat-mdy-insein`, team `britium-ventures-website`.
- Git branch: `uat/mdy-insein-isolated-20261116`. Never merge this UAT-only Supabase rewrite into Production `main`.
- Portal `/supabase/:path*` must point exclusively to `https://hgijdyfwmvskchsruknp.supabase.co/:path*`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be from the isolated project. The UAT client rejects a different backend URL.

## Verified blockers
1. Supabase branch status is `MIGRATIONS_FAILED`, including after requesting a `rebase_branch`. Public tables: 249 versus 1,149 in current Production; key modern objects (`be_user_account_registry`, `be_branch_offices`, `be_role_authority_matrix`, `be_branch_intake_parcels_v1`) are missing.
2. Branch Auth users: 0. No actual employee test credentials have been provisioned or distributed.
3. Old Vercel project ID `prj_Gugvuie3OTr0ZXkRub21G4jTyDew` is not accessible (404). Vercel's authorized team currently rejects the new project creation action with `403 forbidden`.
4. Do not invite staff or publish a UAT link before backend isolation, schema compatibility and account provisioning pass.

## Exact remaining actions
1. Restore / recreate the UAT Vercel project using an authorized team-owner account. Use **Vite**, root directory `britium-go-live`, output directory `dist`, Git branch `uat/mdy-insein-isolated-20261116`, with branch-specific UAT API environment variables. Do not copy Production service-role keys.
2. Diagnose the first failed Supabase branch migration via Supabase dashboard logs. Restore current application schema using an isolated branch strategy; **never** copy live waybills, COD ledgers, or Auth users into this environment. Do not reset the existing UAT schema blindly.
3. Run a read-only schema compatibility audit for user registry, branch directory, RBAC, pickup temporary QR, warehouse, wayplan, transfer, rider and finance interfaces.
4. Provision 8 UAT users for Mandalay and 8 for Insein through the supported Supabase Auth admin/invitation flow, assign branch-scoped roles and one-time password setup. Never set known default passwords.
5. Verify login for each branch role, that branch users cannot access the other branch, and that UAT sign-in cannot reach Production.
6. End-to-end test: inbound existing Way ID; temporary QR; branch evening manifest; physical load scan; HQ receive scan; HQ conversion to permanent Way ID; local rider pickup/delivery; failed reason and Return Scan; supervisor approval; COD isolation.
7. Mark UAT ready and communicate the confirmed URL and test-account roster only after all required steps pass.

## Planned role quantities (not provisioned)
- Mandalay: Manager 1, Rider 3, Warehouse 1, Finance/Cashier 1, Driver 1, Helper 1.
- Insein: Manager 1, Rider 3, Warehouse 1, Finance/Cashier 1, Driver 1, Helper 1.

**Release gate:** Draft only; never promote or merge into Production main.
