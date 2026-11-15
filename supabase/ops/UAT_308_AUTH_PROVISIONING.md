# Mandalay + Insein UAT account setup (project hgijdyfwmvskchsruknp)

The connected Supabase tools in this environment can execute SQL but **cannot create Supabase Auth identities** through the supported Auth Admin API. Never insert user rows or password hashes into `auth.users` using SQL.

1. Confirm project selector shows `hgijdyfwmvskchsruknp`. Go to **Authentication -> Users** and use the supported Supabase Dashboard creation/invitation flow, or a private script using `supabase.auth.admin.createUser` / `inviteUserByEmail` with the **UAT-only service role credential** in a secure server environment. Never paste that credential into chat, logs or public GitHub.
2. Set server-controlled `raw_app_meta_data` via a supported **Admin API** (never user-editable `user_metadata`). Use exactly these branch IDs:
   - Mandalay: `53a0d736-ac93-4f61-aeb8-289bce9978e7` (code `MDY_UAT`)
   - Insein: `69185e4b-caf8-4c02-9038-65c120ea73fa` (code `INSEIN_UAT`)
3. Allowed `uat_role`: `branch-office`, `supervisor`, `data-entry`, `warehouse-staff`, `rider`, `driver`, `helper`. Metadata must contain `uat_approved=true`, `branch_id` and `uat_role`. Field staff additionally need an actual approved `worker_code`. Do not invent staff or reuse production credentials.
4. Run `supabase/ops/uat_308_link_approved_auth_accounts.sql` in the **UAT** SQL editor. The SQL creates or updates profiles and workforce mappings only for explicitly approved UAT Auth users, leaving `auth.users` unchanged. The helper role maps to `branch-office` in the legacy `employee_role` enum, while its workforce role remains `helper`.
5. Force fresh sign-in / token refresh so new `app_metadata.branch_id` is present in the JWT. Use separate real UAT sessions for each branch and verify both self-visibility and cross-branch denial.
6. Run full pickup, warehouse, dispatch, finance UAT only after the migration baseline passes. This account link does not solve `MIGRATIONS_FAILED`.

**Safety:** This SQL is a controlled post-provisioning step, not an Auth-user creation script. Current UAT has zero Auth users, so it will not provision anyone until step 1 is complete.
