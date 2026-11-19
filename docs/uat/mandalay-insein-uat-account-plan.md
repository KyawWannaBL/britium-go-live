# Mandalay / Insein isolated UAT identity provisioning

Scope: Supabase `hgijdyfwmvskchsruknp` and Vercel `britium-uat-mdy-insein`. This file is a **provisioning plan, not a record of created accounts**. Do not copy production users, passwords or tokens.

Provision by Supabase Auth Admin **Invite user**, enforce email verification/password setup and MFA for managers where supported. Only after the hosted branch and registry schema is verified, associate each invited user's actual `auth.users.id` with their corresponding branch-scoped role and territory. Do not insert directly into `auth.users`; do not assign GLOBAL privileges to branch users.

| UAT email | Branch | Role |
|---|---|---|
| `branch_mgr_mdy_001_uat@britiumventures.com` | Mandalay | Branch Manager |
| `rider_mdy_001_uat@britiumventures.com` | Mandalay | Rider |
| `rider_mdy_002_uat@britiumventures.com` | Mandalay | Rider |
| `rider_mdy_003_uat@britiumventures.com` | Mandalay | Rider |
| `warehouse_mdy_001_uat@britiumventures.com` | Mandalay | Warehouse |
| `cashier_mdy_001_uat@britiumventures.com` | Mandalay | Cashier |
| `driver_mdy_001_uat@britiumventures.com` | Mandalay | Driver |
| `helper_mdy_001_uat@britiumventures.com` | Mandalay | Helper |
| `branch_mgr_isn_001_uat@britiumventures.com` | Insein | Branch Manager |
| `rider_isn_001_uat@britiumventures.com` | Insein | Rider |
| `rider_isn_002_uat@britiumventures.com` | Insein | Rider |
| `rider_isn_003_uat@britiumventures.com` | Insein | Rider |
| `warehouse_isn_001_uat@britiumventures.com` | Insein | Warehouse |
| `cashier_isn_001_uat@britiumventures.com` | Insein | Cashier |
| `driver_isn_001_uat@britiumventures.com` | Insein | Driver |
| `helper_isn_001_uat@britiumventures.com` | Insein | Helper |

These 16 emails were confirmed by the user as created in production Supabase, NOT isolated UAT. They must be invited separately into isolated UAT before tests. The existing operational Mandalay manager address `branch_mgr_mdy@britiumventures.com` is a **separate existing identity**; do not silently replace it with the `_001` UAT identity.

## Release gates

- [ ] Full historical replay passes in disposable CI; no placeholders bypass security checks.
- [ ] Isolated hosted UAT migrations applied, checked for correct branch definitions, role matrices and RLS.
- [ ] All 16 users invited using an Auth Admin API/UI; no shared passwords or guessed person names.
- [ ] Auth user IDs verified, role/branch-scoped profiles written using approved provisioning procedures.
- [ ] Users can sign in to the UAT endpoint and cannot sign in with production credentials.
- [ ] Mandalay users cannot read or mutate Insein parcels, and vice versa; anonymous and inactive users denied.
- [ ] Manager, warehouse, cashier and rider permissions exercised with UAT-only parcels.
- [ ] Data Entry save and waybill generation; warehouse inbound and scanning by canonical Way ID; supervisor review; creation of route; staff assignment/acceptance; proof upload, RTO and reconciliation verified.
- [ ] Verify no production credentials, parcels or payment mutations occurred.

Do not mark UAT ready just because the Vercel login page renders.
