# Britium Auth + Rider APK Go-Live Patch

## Files included

| File | Place in project |
| --- | --- |
| `src/pages/PortalLoginPage.tsx` | `src/pages/PortalLoginPage.tsx` |
| `src/pages/RiderLoginPage.tsx` | `src/pages/RiderLoginPage.tsx` |
| `src/pages/ForgotPasswordPage.tsx` | Replace existing `src/pages/ForgotPasswordPage.tsx` |
| `src/pages/SignupPage.tsx` | Replace existing `src/pages/SignupPage.tsx` |
| `src/pages/MustChangePasswordClient.tsx` | Replace existing `src/pages/MustChangePasswordClient.tsx` |
| `src/routes/AuthRoutes.snippet.tsx` | Copy routes into your existing router |
| `supabase_auth_wiring.sql` | Optional SQL helper for must-change-password and signup requests |
| `public/downloads/README_PUT_APK_HERE.txt` | Replace with actual signed APK file |

## Required routes

```tsx
<Route path="/login" element={<PortalLoginPage />} />
<Route path="/rider-login" element={<RiderLoginPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/signup" element={<SignupPage />} />
<Route path="/must-change-password" element={<MustChangePasswordClient />} />
```

## APK download link

Both Portal Login and Rider Login include this link:

```txt
/downloads/britium-rider-app.apk
```

Place the signed Android APK here:

```txt
public/downloads/britium-rider-app.apk
```

I cannot create a real APK without the mobile app project, Android build config, and signing keystore. The download link is fully wired; you only need to put the signed APK at the path above.

## Must-change-password flow

The login pages check these flags:

```txt
be_user_account_registry.must_change_password
be_user_account_registry.force_password_change
be_mobile_workforce_accounts.must_change_password
be_mobile_workforce_accounts.force_password_change
Supabase user metadata: must_change_password
```

If true, the user is redirected to:

```txt
/must-change-password?mode=portal&next=/dashboard
/must-change-password?mode=rider&next=/rider-dashboard
```

After password update, the page tries:

```txt
be_complete_password_change
```

Then falls back to updating the matching registry/workforce table.

## Supabase redirect URLs

In Supabase Auth settings, add these redirect URLs:

```txt
https://YOUR_DOMAIN/must-change-password
http://localhost:5173/must-change-password
```

## Build

```bash
npm run build
```

If generated Supabase types reject table/RPC names, keep the existing `(supabase as any)` casts in these files.
