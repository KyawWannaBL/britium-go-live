# Britium Express — Advance Merchant Settlement (UAT Acceptance)

## Requirement
Selected merchants are paid the business day following **verified physical pickup/inbound receipt**, regardless of final delivery state. This is an advance against item value, not a claim that rider COD has been collected. Applies to YGN, MDY, NPT, Royal Express, DK and approved highway/partner lanes. Standard delivered-only settlement remains available for other merchants.

## Files
- SQL candidate: `sql/candidates/merchant_advance_settlement_v1_UAT_ONLY.sql`
- UI: `src/components/finance/MerchantAdvanceSettlementPanel.tsx`
- Integration: `src/pages/MerchantSettlementPage.tsx`

## Financial rules
1. Merchant enablement is OFF by default. Finance Admin or Super Admin records an approved commercial rate, per-way deduction, allowed providers, and signed reference. No assumed percentage or flat fee.
2. The operational record must have a matching, physically scanned Warehouse receipt; the next **Myanmar calendar day** must have started.
3. Finance validation must be OK. Held/disputed, RTO/cancelled, already advanced, or already normally batched parcels cannot create advance drafts. Restrict one merchant per draft.
4. Advance per parcel = round(item_price * rate_pct / 100 - flat_deduction, 2). Retain immutable per-way snapshots of item value, fee policy, provider, receipt timestamp and status.
5. Finance Creator drafts and submits; a different Finance Approver approves; a third authorized payment recorder verifies an actual external transfer, transaction reference and receipt. No API initiates banking transfer.
6. A pre-paid parcel that later becomes RTO creates an explicit merchant refund-due case; independent review and a third-person recorded external receipt are required before `REFUND_RECEIVED`. Do not relabel the original advance as unpaid.
7. Do not rewrite delivery scans, COD collected, wayplan state or customer delivery from merchant settlement.
8. A duplicate-settlement trigger blocks the normal batch creator for advanced parcels. **Release blocker**: a reviewed advance-offset final-delivery reconciliation and ledger posting must be implemented and tested before enabling any real advance payouts. Blocking is deliberately safer than double payment.
9. Existing UAT database `hgijdyfwmvskchsruknp` lacks parcel/warehouse/finance tables. This SQL cannot be installed there until UAT recovery is complete; production rollout is prohibited without rehearsal.

## Required UAT tests
- T1: Merchant policy absent/disabled => no advance; differing provider rules; no default value silently used.
- T2: Pickup today => not yet eligible; verified yesterday => eligible; time zone Asia/Yangon; return-scan cannot fake initial pickup.
- T3: Not delivered / MDY / NPT / Royal / DK => eligible with approved merchant/provider; unverified site/pickup => blocked.
- T4: Delivered-only legacy merchant settlement unchanged; stale selection and changed finance validation rejected at transaction time.
- T5: Draft, submit, review, confirmed payout by separate accounts; creator and approver cannot act as recorder; unsupported role denied.
- T6: Parallel drafts, same way from different sessions, same payment reference, repeated RTO request => no duplicate payout/receivable.
- T7: RTO after disbursement; refund due, independent approval, external refund receipt; waive audit; refund within paid amount.
- T8: Validate final balance: advance paid + final COD net reconciliation + refund/recovery = documented merchant liability; reconcile each item and finance postings exactly once. **Not yet implemented.**
- T9: Confirm no fake Delivered/RTO status, no COD booking from advance, no auto-dispatch or provider custody mutation.
- T10: Existing Finance creator, approver, payment officer and merchant account RLS, audit roles and receipt access verified.
- T11: No live feature enablement until no reconciliation blockers and signed UAT.

## Test SQL
Compile candidate on production **only inside a transaction that ends ROLLBACK**, then verify `to_regclass` reports no persisted advance objects. Compilation alone is NOT functional UAT.

## Sample workflow
Warehouse verified 2026-11-20 at 16:00 MMT -> next MMT date 2026-11-21 is advance-eligible if policy and finance gates pass. For example if item value 100,000, approved rate 100% and per-way deduction 4,000, candidate advance 96,000 MMK (illustrative, not a default or approved tariff). Later RTO creates recovery up to actually paid advance; receiving refund requires documented evidence.
