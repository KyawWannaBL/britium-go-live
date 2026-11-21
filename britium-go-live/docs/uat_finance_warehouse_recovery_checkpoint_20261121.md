# Britium Express — UAT Finance/Warehouse Recovery Checkpoint (2026-11-21)

**Projects:** isolated UAT `hgijdyfwmvskchsruknp` only. Production `dltavabvjwocknkyvwgz` unchanged.

## Executed on existing UAT
1. `sql/candidates/11_uat_finance_v3_secure_canonical_restore.sql`
   - Original Finance V3 baseline compiled on UAT in BEGIN/ROLLBACK, then applied additively.
   - 8 canonical Finance settlement tables, 15 functions, original no-op Finance role table (no hard-coded finance@... admin).
   - RLS enabled for all 8 new tables, no direct browser SELECT, anonymous Finance snapshot RPC denied.
   - **Not a live finance release:** V3 RPCs depend on an operational finance queue still absent.
2. `sql/candidates/12_uat_waybill_warehouse_v36_secure_restore.sql`
   - Canonical `be_parcel_waybills` (13 columns) and Warehouse V36 receipt/events/exceptions tables, 29-column receipt shape, view and 4 original RPCs.
   - Warehouse and waybill records empty. New tables are RLS protected; direct warehouse view access revoked until scoped access is validated.
   - The original 2026-era production private write-guard triggers are NOT restored; branch-only data access restrictions need later QA.
3. `sql/candidates/13_uat_warehouse_v36_rpc_auth_hardening.sql`
   - Discovered recovered legacy Warehouse RPCs didn't check auth.uid; this was closed.
   - All four RPCs now require authenticated active HQ warehouse/operations/superadmin role; branch-scoped Warehouse users must use their dedicated branch RPCs.
   - Recorded actor now comes from auth.users, not client-supplied actor_email.
   - Anonymous EXECUTE revoked; unauthenticated SQL invocation negative tests passed.

## Actual verification
- 8/8 Finance tables present and RLS enabled; finance access seed count 0; no authenticated table SELECT, anonymous Finance RPC denied.
- Waybill table present with zero records; Warehouse receipts present (29 columns) with zero records; Warehouse snapshot RPC present and authenticated-only.
- Production advance tables and RPCs still absent. No production payment/Finance records changed.
- Supabase UAT branch still shows MIGRATIONS_FAILED in branch metadata. Schema DDL was executed directly as targeted repair, **not** marked as historical migrations.
- No full UAT backup has been obtained via these tools. Before replacing existing objects, destructive operations or a full migration replay, capture a full UAT backup.

## Next dependency gap for Advance UAT installer
Missing as verified by `to_regclass` and `to_regprocedure`:
- `public.be_accounting_events`, `public.be_accounting_event_lines`, `public.be_chart_of_accounts`
- `public.be_accounting_upsert_event_v1(...)`
- `public.be_finance_cod_settlements_v48`
- `public.be_parcel_settlement_ledger_v2`
- `public.delivery_waybills`
- `private.be_merchant_settlement_receipts_v200`
- `public.be_v_finance_merchant_settlement_queue_v2`

Production merchant Finance queue view references private merchant-settlement receipts, COD settlements, delivery_waybills and other tables. Restore **canonical definitions and their dependency order** from reviewed source/dumps; do not fabricate empty stand-in tables or spoof historical migrations.

## Go/no-go
**No live advance payments.** PR #328 still Draft. No signed merchant advance policies, no end-to-end UAT payment/refund/offset, no verified completed journal workflow. Continue with non-destructive UAT dependency recovery, then actual UAT data fixtures and authorization tests. Preserve production Vercel and Supabase state.
