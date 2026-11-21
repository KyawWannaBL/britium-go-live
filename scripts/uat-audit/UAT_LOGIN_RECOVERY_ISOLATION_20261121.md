# Mandalay/Insein UAT login and password-recovery isolation — 2026-11-21

## Findings
- Hosted UAT Supabase: `hgijdyfwmvskchsruknp` (18 confirmed Auth users, 18 registry rows, 18 users with password hashes, zero banned).
- 2 UAT accounts had previous sign-ins. The UAT superadmin passed a simulated authenticated-role `be_login_access_profile()` check.
- The default Vercel UAT site uses `britium-uat-mdy-insein.vercel.app`. Its intended Git branch client detects this UAT hostname and requires a UAT-specific Supabase URL/key.
- In the last 24h queried, UAT auth logs showed no `invalid_credentials` events; production auth logs had six such events with referring hostname `www.britiumexpress.com`. These logs cannot be tied to the user's particular failed request.
- Standard Yangon production accounts (`optmgr_ygn_001@britiumventures.com`, `wh_lead@britiumexpress.com`, etc.) are not among the UAT Auth users.
- A recovery routing bug existed: `britium-go-live/api/password-recovery.mjs` sent recovery links to production, and `britium-go-live/public/auth-recovery.html` posted new passwords through the production `/supabase` proxy.

## Source-only fix committed on `fix/uat-migration-replay-audit-308`
- `britium-go-live/api/password-recovery.mjs`: for recognized UAT hosts, require matching `https://hgijdyfwmvskchsruknp.supabase.co` URL and UAT anon/publishable key. Fail closed on mismatch; keep production behavior unchanged. Send UAT recovery email links to the requesting UAT host.
- Same API returns only its **public** browser connection information to the UAT recovery page. Never return service-role keys.
- `britium-go-live/public/auth-recovery.html`: for recognized UAT hosts, validate public config and send authenticated password updates directly to the UAT Auth endpoint. Production page continues to use its existing production route.
- Both changed on recovery branch only. **NOT verified deployed to the live Vercel UAT domain** because connected Vercel deployment access returned 403/404.

## Required release verification
1. On Vercel project `britium-uat-mdy-insein`, verify `VITE_SUPABASE_URL` = `https://hgijdyfwmvskchsruknp.supabase.co` and `VITE_SUPABASE_ANON_KEY` belongs to the same project in the correct environment. Never paste keys in chat or commit them.
2. Deploy reviewed recovery branch to **UAT preview only**. Do not promote production. Verify `GET /api/password-recovery?public_config=1` succeeds on UAT preview and reports the UAT project URL.
3. In hosted UAT Supabase Auth URL configuration allowlist, permit the exact tested UAT recovery callback URL `https://<uat-preview-or-alias-host>/auth-recovery.html`. Keep production redirect unchanged.
4. Test password recovery for one authorized UAT test account and verify a new password can be set, then sign in. Confirm DevTools Network sends Auth requests only to `hgijdyfwmvskchsruknp.supabase.co` and never to the production reference.
5. Rotate all test credentials that were publicly documented in the Git repository, and remove plaintext passwords from published docs/seed scripts; Git history and already-exposed values remain compromised.
6. Do not modify or reset production Auth users or the 18 UAT identities merely to resolve the login UI error.

Status: diagnostic complete and UAT recovery **source-only** fix committed; live UAT login still needs real-browser verification and a controlled release.
