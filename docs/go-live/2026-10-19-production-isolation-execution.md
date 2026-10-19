# October production isolation — execution record

Isolation activated on 19 October 2026 at 23:51:29 Myanmar Time (17:21:29 UTC). The approved new-production boundary is 20 October 2026, 00:00 Myanmar Time (19 October 17:30 UTC).

The user authorized clearing pre-cutoff operational and financial transactions and explicitly waived archiving for unmatched or incomplete data. Existing recovery copies remain retained; this execution does not claim that every disposed row is recoverable.

## Verified result

- 25,383 transaction rows removed from an explicit scope of 436 tables.
- All 436 scoped transaction tables verified empty after commit.
- 588 retained tables verified unchanged, excluding specifically reset operational wallet balances and cutover control fields.
- Account identities, credentials, roles, permissions, masters, tariffs, configuration, audit history, and numbering preserved.
- 23 historical foreign-key relationships remain validated through identity-only catalogs. These catalogs contain identifiers, not transaction payloads, and accept identities from subsequent live inserts.
- PostgreSQL numbering sequences continue from their prior values.
- Wallet cached operational balances reset to zero while wallet identities remain.
- Both web applications identify their requests with the October epoch. Missing/obsolete client epochs and retired transaction identifiers are rejected by the scoped write guards.
- Production transaction writes remain closed until the approved midnight boundary.
- The activation function is idempotent: subsequent calls report the existing active state without another wipe.

## Validation

The production rollback rehearsal removed the same 25,383 rows, verified preserved data and numbering, rolled back, and confirmed original counts and protected records were restored. Local PostgreSQL fixtures also covered obsolete clients, retired identifiers, separate identifier namespaces, future-cutoff refusal, and repeated activation. Production post-cutover checks confirmed all scoped transaction tables empty and the current status ACTIVE.

The installed migrations below record the exact six production installation components; none invokes activation automatically. The activation was an explicit database administrator operation after rehearsal.

Portal client release: PR #190. Workforce client release: KyawWannaBL/Rider-App#29. The portal status panel reads the authoritative isolation report instead of continuing to display a blocked preview after activation.

Physical Android camera/permission/process-recreation acceptance is not claimed by this record.
