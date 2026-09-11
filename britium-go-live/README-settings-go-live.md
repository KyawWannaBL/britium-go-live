# Package 10 — Settings Go-Live

## Purpose
Admin settings: tariff master editor, user management + role status toggle, and system config key-value store.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/79-settings-go-live.sql` | RPCs: tariff read/update, user list/toggle, config read/write, verification |
| `src/lib/settingsApi.ts` | Typed API helpers |
| `src/pages/SettingsPage.tsx` | Three tabs: Tariff / Users / System Config |
| `src/pages/SettingsRoutes.snippet.tsx` | Route snippet |

## Apply Instructions
1. Run SQL: `supabase/sql/79-settings-go-live.sql`
2. Extract `src/` into portal `src/`
3. Verify: `SELECT be_settings_go_live_verification();`

## RBAC
- Tariff/Config: admin only
- User management: admin, operation_manager
