# Hosted Mandalay/Insein UAT login authorization repair

Date: 2026-11-20

## Scope

Isolated Supabase branch `hgijdyfwmvskchsruknp` only, NOT production `dltavabvjwocknkyvwgz`.

Migration applied using Supabase migration tool:
`uat_branch_login_registry_territory_v1`.

The Vite UAT frontend was failing with:
`Could not find the function public.be_login_access_profile without parameters in the schema cache`.

## Applied hosted UAT changes

- Established `public.be_user_account_registry` with one account per existing Auth identity, unique `auth_user_id`, and RLS own-read policy.
- Established `public.be_employee_territory_assignments` with unique branch scopes, foreign keys to Auth users, and RLS enabled.
- Installed the original `public.be_login_access_profile()` RPC from historical `supabase/migrations/20260903172827_rls_login_access_contract_v20.sql`.
- Granted `EXECUTE` on login RPC only to `authenticated`; `anon` execution denied.
- Registered the 16 pre-existing `_uat@britiumventures.com` Auth accounts; 8 MDY and 8 ISN.
- Assigned one `BRANCH` territory to each; `can_read=true`, `can_create=false`, `can_update=false`, `can_delete=false`. No `GLOBAL` territory.
- Role codes: branch-manager (1 per branch), rider (3), warehouse-staff (1), finance-user (1), driver (1), helper (1).
- Preserved existing Auth users and passwords. No modifications to production.

## Post-migration verification

- All 16 registry accounts and 16 active branch territories present.
- Both MDY and ISN manager's simulated authenticated `be_login_access_profile()` calls returned `authorized:true` with their respective branch scopes.
- MDY authenticated user's SELECT on ISN registry records returned 0.
- Anonymous RPC execution returned SQLSTATE 42501 permission denied.
- Browser sign-in not independently verified after migration.

## Outstanding operational readiness

The isolated branch still needs the full canonical operational schema, application screens, and complete row-level security/permission matrices before parcel creation, warehouse operations, wayplan creation, rider pickup, delivery proof, and finance testing. In particular, territory create/update/delete privileges were intentionally not enabled as part of this login-only repair.

The historical migration replay remains a separate incomplete remediation. Reconcile this hosted emergency compatibility schema with the canonical historical migration chain before applying wholesale migration replay or promoting changes. Do not reset the branch; 16 preexisting Auth users must be preserved.
