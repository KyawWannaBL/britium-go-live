# Go-live isolation dependency audit — Enterprise + Rider

**Cutoff:** 2026-10-20 00:00 Myanmar (2026-10-19 17:30 UTC)
**Status:** AUDIT ONLY — NO ACTIVATION. This is a non-executable scope review.

## Confirmed database registry state
- 1,033 registered scope tables: 12 PROTECTED_MASTER, 3 TRANSACTION_ROOT and 1,018 UNCLASSIFIED.
- Existing transaction roots: be_data_entry_parcel_details (delivery_way_id), be_pickup_requests (pickup_id), be_wayplan_dispatches (wayplan_id).
- be_user_account_registry is PROTECTED_MASTER.
- Production cleanup functions remain disabled.

## Immediate dependency classification required
These are **candidates for archived transactions, not approved executable deletion instructions**:

| Table | Relationship discovered | Precutoff inventory |
|---|---|---:|
| be_portal_pickup_requests | pickup_id / delivery_way_id / wayplan_id | 387 |
| be_cod_ledger | pickup_id / delivery_way_id / settlement_id | 267 |
| be_financial_settlements | pickup_id / delivery_way_id / settlement_id | 267 |
| be_rider_wallet_ledger | pickup_id | 16 |
| be_workforce_commission_ledger | worker/assignment references require further mapping | 3 |
| be_accounting_manual_journal_drafts_v1 | journal id / status / posted_at | 3 |
| be_delivery_jobs | pickup_id / wayplan_id | 0 |
| be_waybill_ledger | pickup_id / delivery_way_id / wayplan_id | 0 |
| be_journal_entries | id / status / posted_at | 0 |
| be_journal_lines | journal_id / account_id | 0 |

The earlier 14-table sample contained 3,201 pre-cutoff rows. It is **not** a complete count of the cutover graph. Timestamp is not enough to guarantee a correct graph: children may have later creation timestamps, and historical real-world obligations require reconciliation.

## Immutable protected categories
Authentication, all user accounts, credentials, roles, permissions, merchant and workforce masters, tariffs/rates/commission configuration, branches, townships, address/location master, vehicles, Chart of Accounts, accounting periods/configuration, numbering history, settings, integration billing counters, security/audit records and financial evidence archives.

## Blocking requirements before enabling Activate Isolation
1. Resolve classification and FK/source-reference dependencies across all relevant tables, views, RPCs, realtime subscriptions and both clients.
2. Create verified restore-capable backups and a checksum-based immutable archive manifest including storage proof objects.
3. Reconcile and explicitly record authorization to isolate genuine unsettled financial obligations; retain lawful audit/accounting history.
4. Fence writers and offline Rider queues against pre-cutoff epoch; apply one shared production epoch and consistently exclude archived records.
5. Prove atomic cutover, idempotent retry, permissions and rollback with synthetic data; compare protected master hashes before/after.
6. Complete authorized Superadmin preview/approval; do not invoke be_go_live_purge_mock_data or disabled legacy cleanup routines.

No production transaction rows were updated or deleted in this audit.
