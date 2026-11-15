# Mandalay + Insein Branch UAT Environment (2026-11-16)

**Status: PREPARED / NOT AUTHORIZED FOR TRANSACTIONAL UAT UNTIL ISOLATED BACKEND EXISTS**

- Git branch: `uat/mandalay-insein-isolated-20261116`
- Production: `www.britiumexpress.com` (never promote this branch without a release review)
- Branch identities: `MDY` (Mandalay Branch Office), `YGN-INS` (Insein Branch Office)
- Production Supabase ref **MUST NEVER be used for this branch**: `dltavabvjwocknkyvwgz`
- UAT backend: pending creation and migration verification; Supabase cost-confirmation approval is required.
- No production parcel, COD, settlement or Auth data are to be imported. Do not seed actual customer PII, COD, live waybills or employee login passwords.

## Isolation rules already implemented on this Git branch

1. Enterprise client has no Production credential fallback. Browser UAT builds refuse to start without a valid, non-Production `VITE_SUPABASE_URL`.
2. Rider client refuses the Production project ref and requires a separate backend.
3. The Vercel `/supabase/:path*` rewrite pointing at Production was removed on this branch.
4. Do not deploy this branch to Production; do not merge into main.
5. Before enabling UAT, search for additional direct calls to Production Supabase, external payment notifications, webhooks, SMS and live shipping providers.

## Required Supabase setup

Create a separate **data-less Supabase branch** of `britium-enterprise` (or a dedicated UAT Supabase project). Prefer a persistent staging branch with production data copy **OFF**. This may incur additional charges. Check that all ~503 historical schema migrations complete; older preview branches have `MIGRATIONS_FAILED`. Do not assume ready from project ACTIVE alone. If schema migrations fail, repair the UAT branch's migration history, never production.

1. Seed synthetic records for MDY and YGN-INS only, plus test merchants, customers, rates, waybills, fleet and role-scoped users.
2. Create **distinct UAT Auth accounts**. Never sign in with real Production employee passwords.
3. Set allowed redirect URLs for only the UAT Vercel preview hostname.
4. Use a test Storage bucket, disable outbound SMS/email provider events except UAT invitations, and make all Finance settlement, payout, third-party webhooks and production email notifications non-operational or simulated.
5. Set branch RLS rules: MDY user must not see YGN-INS test records; YGN-INS user must not see MDY records; Riders can change only their assigned test tasks.
6. Keep HQ Data Entry and HQ CS ownership for Insein. Mandalay permissions must follow its latest approved role policy, not copied automatically from Insein.

## Vercel preview wiring

Use **non-production** Vercel project/environment variables, scoped to the exact UAT Git branch:

```env
VITE_SUPABASE_URL=https://<uat-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<uat-publishable-or-anon-key>
```

Never configure `VITE_SUPABASE_URL` with the Production ref. Never use service-role/secret keys as `VITE_*`. Rebuild after setting env vars; Vite embeds them at build time.

Run separate QA for both the Enterprise portal and the Rider app; if the Rider app is deployed via its dedicated Vercel project, it must also use UAT-only Supabase env vars. A preview URL by itself does not imply backend isolation.

## UAT cases, per branch (record PASS, FAIL, BLOCKED, evidence, Way ID)

| Group | Scenario | Expected safe result |
|---|---|---|
| AUTH | Manager, Rider, optional Warehouse/Driver/Helper logins | Login resolves correct role, no cross-branch access |
| RLS | MDY user query YGN-INS and vice versa | Access denied; HQ only under approved scope |
| INTAKE | Insein receive existing HQ Way ID; use temporary Pickup QR where supported | No duplicate permanent Way ID; HQ performs data entry |
| INTAKE | Mandalay source parcel & HQ-origin inbound | Correct authorized source registration policy and one Way ID |
| TRANSFER | HQ -> branch outbound, seal, transport, unique inbound scans | Manifest/load/receipt counts reconcile; exceptions logged |
| PICKUP | Pickup request -> assignment -> accept -> arrive -> parcel photo + weight -> upload all -> warehouse custody | Saved evidence, separate HQ registration where applicable |
| WAYPLAN | Date-ready received ways -> branch rider route -> acceptance | No 50-parcel minimum; blocked future-date, duplicate or missing scan |
| DISPATCH | Scan Way ID continuously -> handover to assigned Rider | Every selected way has scan and custody handover |
| DELIVERY | Start -> customer arrived -> recipient+COD+photo+signature -> delivered | Exact Way ID and evidence, correct COD; cannot falsely deliver |
| FAILED | Phone off, unreachable, wrong address, refused | Correct reason propagates to CS, Warehouse, Operations |
| POSTPONE | Customer-specific next delivery date | No early reassignment |
| RETURN | Failed Rider -> warehouse return scan -> HQ transfer if needed | Custody transitions and no duplicate active assignment |
| FINANCE | Cash rider handover and synthetic COD reconciliation | No actual financial posting or payout; outstanding reconciles |
| PROVIDER | Mandalay direct delivery vs DK outsourced; Royal if relevant | No fictitious provider fee; proof and finance separately validated |
| REPORT | AM, midday and evening branch close | Counts, exception list and HQ view reconcile |
| FAILURE | Timeout, offline retry, failed photo upload, duplicate scan | Retry idempotent, no duplicate or false completion |

## UAT acceptance

- Use purely synthetic way IDs beginning with `UAT-MDY-` and `UAT-ISN-`; ensure actual generator accepts them or track them as labels instead.
- Capture screenshots and audit/evidence references. No real merchant or recipient details.
- **Required approvals**: Branch Manager, HQ Operations, HQ Warehouse, HQ CS, HQ Finance, Security/Admin.
- Mark an integration BLOCKED rather than manually overriding audit or custody statuses.
- Do not certify full UAT until all critical flows pass via authenticated real screens.
- No production deployment, data copy, live payments, external notifications or production service activity is authorized by this UAT document.
