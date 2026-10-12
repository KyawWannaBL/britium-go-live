# Go-live blocker register — 12 October 2026

This register records scoped evidence. It does not certify launch readiness. No production cutover has run.

| ID | Reproduction / cause | Repair | Evidence / remaining gate |
|---|---|---|---|
| APP-01 | Rider npm ci dependency lock mismatch and suppressed types/lint errors | PR21 merged; lockfile, types and Android-compatible string handling corrected | Clean install, TypeScript, six verifiers and build passed; lint 0 errors / 364 warnings. Android release Build88 succeeded at main 68d23c7e. Physical device acceptance remains PENDING. |
| LOC-01 | Learned address hits call nonexistent be_location_alias_lookup_v28; results silently fall through to provider/default | Call deployed be_location_alias_resolve_v28 with canonical township; preserve saved precision and provenance | Behavior test reproduced wrong postal fallback, now passes; cache hit makes no network call; wrong township, invalid point and unauthorized results rejected. |
| WP-01 | Saving a reviewed CREATED revision calls paid optimizer twice | Save reviewed ordering and retain compatible explicit crew | Real component test reproduced 2 calls, now 1; Driver/optional Helper van and Rider-only bike pass. |
| WP-02 | Existing revision backend rejects Yangon Mapbox and deferred estimate, applies van minimum to Rider routes | V201 aligns route and vehicle policy, requires estimate label/provenance; preserves source locks, idempotency and transactional replacement | Disposable real PL/pgSQL guard tests passed. Full staged replacement and deployed verification remain PENDING. |
| QA-01 | Portal verifier assertions lag approved V136 location defaults, V148 crew rules and current UI batching | Update obsolete assertions, retain permission/audit checks and add alias/revision/API behavior tests | All 67 registered Portal verification scripts passed; Portal production build passed. Source contracts are not whole-system browser/device acceptance. |
| CI-01 | Supabase Preview fails duplicate delivery_status type; April schema creation precedes July full remote snapshot | Root cause confirmed in current PR162 check output and migration chain | BLOCKED: coherent fresh-database baseline/replay must be verified; do not hide duplicate objects with indiscriminate IF NOT EXISTS. |
| FIN-01 | Existing acceptance fixture D1007-TSW-001 is already paid; original acceptance assumes unpaid | Repeatable isolated fixture work remains required | PENDING: full six-type / partial / split / bulk / wallet / Finance-Merchant acceptance. Never reset live paid data outside rollback. |
| RTO-01 | Legacy RTO row counter zero, historical events contain repeated submissions | Three-attempt regression asserts both return scan and failure count | PENDING audited reconciliation; historical repeats must not be counted as new attempts. |
| IAM-01 | Five legacy/demo mobile identities lack a uniquely verified worker mapping | Inventory recorded; no invented mapping or silent account disable | PENDING verified workforce/access decision and role round trips. |
| DATA-01 | Existing cleanup cannot cover all current paths; 1,033 public/private tables and 350 FKs inventoried | Explicit registry/preview/epoch/archive implementation in approved plan | BLOCKED until unknown active paths, financial links and recovery evidence resolved. Master data, tariffs, audit/evidence and Mapbox counters remain protected. |
| DEVICE-01 | No physical Android test evidence against Build88 | APK build succeeded | PENDING phone/tablet camera, audio after first interaction, GPS, offline retry and Finish Assignments. |

Portal lint dependency repair and results are tracked separately in the execution ledger. Build warnings and lint warnings are not silently described as clean.
