# SDD ledger — plan: docs/superpowers/plans/2026-09-25-enterprise-accounting-portal-ui.md

Pre-flight shared interfaces:
| Tasks | Shared interface | Finding |
|---|---|---|
| 1 → 2 | accounting client/types/hooks consumed by Finance entry | Plan paths target root shell, but Vercel production builds britium-go-live/ nested app. |
| 1 → 3 | accounting client/types/hooks consumed by Review Queue | Production nested app has no TanStack Query dependency; direct Supabase is the established runtime pattern. |
| 1 → 4 | accounting client/types/hooks consumed by General Ledger | Same deployed-app mismatch as above. |
| 2 → 3 | submitted manual Finance records feed review queue | Backend has no authenticated event-review transition RPC; REVIEW_PENDING cannot become APPROVED through the current UI contract. |
| 5 → 6 | Admin/HR accounting sources and Superadmin correction/audit | Existing backend correction/period RPCs exist; UI paths differ from plan. |

Ruling: execute against britium-go-live/src/* because Vercel production build logs prove britium-clean-enterprise-portal is the deployed app — using root src/* would ship code that users never see — cost if wrong: rework paths, no accounting data impact.
Ruling: follow the nested app's direct Supabase + local React state convention instead of adding TanStack Query/Vitest solely to satisfy the stale root-shell plan — the approved spec requires behavior/security, not those libraries — cost if wrong: later refactor to shared query/test libraries.
Ruling: add an audited be_accounting_review_event_v1 RPC and secure submission RPCs before wiring Review Queue/entry buttons — current be_accounting_post_event_v1 requires APPROVED but no authenticated transition exists — cost if wrong: one additive migration/RPC cleanup; no posted history mutation.
