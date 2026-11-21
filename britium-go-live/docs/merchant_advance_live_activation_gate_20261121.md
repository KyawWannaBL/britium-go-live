# Britium Express Merchant Advance — Live Activation Gate (21 Nov 2026)

**Current decision: NO-GO for money-moving / advance-disbursement recording.**
Production UI is preview-only. PR #328 is draft. Production advance tables and RPCs have not been installed.

## Verified production accounting integration
- Existing merchant settlement v3 payment RPC: `public.be_finance_record_payment_v3`.
- Existing v3 merchant accounting: `private.be_merchant_payment_accounting_v200` debits liability 212002, credits cash 111001 or bank 112003, then refreshes party wallets.
- Available **Merchant Advances asset**: chart account **114004** (postable and active).
- Candidate `merchant_advance_accounting_bridge_v1_UAT_ONLY.sql` uses debit 114004 / credit 111001 or 112003 for an externally verified advance, and reverses it on verified merchant refund. Events are REVIEW_PENDING; not automatically posted or included in wallet totals.
- **Unresolved:** when a parcel is Delivered, recognize/offset its final merchant payable against already disbursed asset 114004 exactly once, support positive/negative final deltas, reconcile COD and Merchant wallets, and post balanced approved journals without double-counting.
- **Unresolved:** RTO accounting and cash receipt workflow testing, including partial refunds, waivers and payout reversals, including merchant statement presentation.

## Duplicate-payment / revalidation controls added to UAT candidates
1. v3 settlement batch items insert guard for advance way.
2. v2 direct parcel settlement ledger guard for advance way.
3. Reverse eligibility checks at payout: merchant policy still enabled, parcel not RTO/cancelled, no hold/dispute or normal settlement, original Finance validation still OK.
4. Case-insensitive bank transfer reference cross-check against normal V3 settlements, bulk transfer references, advances and refunds, under an advisory transaction lock.
5. Independent creator, approver and payout recorder, and secure payment evidence. Missing policy defaults to ineligible. Genuine pickup approval / warehouse scan and next MMT day required.
6. Existing paid or inactive normal settlements block new advances; BBB/BLK consolidated-merchant mappings are blocked.

## Final offset review added (21 Nov)
- Candidate `sql/candidates/merchant_advance_final_offset_review_v1_UAT_ONLY.sql` maintains one per-way review record after a verified Delivered+COD eligible parcel was already advanced and disbursed.
- Stores delivered entitlement, advance asset paid, offset amount, remaining merchant payable, overadvance recovery, and separate negative merchant receivable. CHECK constraint conserves amounts.
- Requires authenticated Finance creator and an independent Finance approver. Rechecks live delivery, validation, merchant identity, holds, disputes, normal batch and settlement status. No journal posting or cash movement.
- `src/components/finance/MerchantAdvanceSettlementPanel.tsx` now displays the maker/checker offset review in the feature preview only.
- Read-only five-case financial conservation checks passed on both production and incomplete UAT. Anonymous EXECUTE denial and RLS isolation passed during BEGIN/ROLLBACK compilation. These tests do not substitute for authenticated UAT.
- **Accounting uncertainty:** production COD_COLLECTED events show both debits and credits against account 111004 in aggregate, and 212002 Merchant Payable has debit entries in observed settled events but payable accrual source was not established. Do not post Dr Payable/Cr Advance until an authorized Finance accountant confirms accrual and COD clearing mechanics, including existing event deduplication.

## Payable accrual / posting-readiness guard (21 November)
- New UAT-only SQL: `sql/candidates/merchant_advance_payable_accrual_readiness_v1_UAT_ONLY.sql`, with read-only `be_finance_advance_payable_accrual_readiness_v1`.
- Blocks any claimed readiness unless: independent final offset review is approved, advance is actually disbursed and its accounting event is **POSTED**, delivery is DELIVERED with unchanged Finance validation/merchant/payable, no hold/dispute/prior normal settlement, and exactly one **POSTED** matching way-level Merchant Payable accrual credits 212002 with amount equal to final payable.
- No journal posting, ledger, bank or wallet mutation. Even the status `POSTING_PREREQUISITES_SATISFIED_REVIEW_ONLY` is not approval to move money.
- Existing authorized accounting workflow requires `be_accounting_review_event_v1` and `be_accounting_post_approved_event_v2`, which can block self-approval/self-post. Do not bypass them from Finance Advance.
- **Production accounting blocker observed:** 1,264 `REVIEW_PENDING`, 57 `NEEDS_REVIEW`, and zero `POSTED` event statuses at verification; missing posted accrual means no advance final-offset posting is permitted. Existing events should be reviewed through standard Finance accounting controls rather than mass-approved.
- Candidate RPC compiled with all preceding SQL candidates inside `BEGIN/ROLLBACK`; no production object persisted. End-to-end UAT and signed merchant policy still missing.
- Finance feature preview displays a per-way `posting_gate` reason for transparent back-office reconciliation.

## Rehearsal status
- Syntax/dependency compile of all three candidate SQL files in a **single BEGIN/ROLLBACK transaction against production**: passed. No objects persisted.
- This is NOT a payout functional test.
- Existing UAT `hgijdyfwmvskchsruknp` currently lacks required warehouse receipts, finance batches/items, disputes, holds, finance settlement queue and Finance authorization RPC. It cannot execute a valid advance payout rehearsal yet.
- Existing six active merchant financial profiles have no configured `settlement_method`. Advance percentages, deductions, and contractual eligibility have not been provided or approved. Do not invent policy rates.
- No live parcel, payment, wallet, finance or refund records were modified.

## Release prerequisites (all mandatory)
- [ ] Restore actual UAT dependencies from reviewed schema baseline without overwriting branch auth data.
- [ ] Obtain signed per-merchant advance policy (merchant IDs, rates, per-way deductions, providers, effective dates, verified beneficiary).
- [x] Implement review-only final-delivery advance-to-payable offset proposal and independent reviewer controls (not posting).
- [ ] Independently audit payable accrual, COD journal source, approved final offset posting, wallet/report impact and recovery of negative final balances.
- [ ] Test maker/checker/payment officer segregation and RLS / direct RPC invocation; revoked users denied.
- [ ] End-to-end test YGN/MDY/NPT/Royal/DK, cross-branch and pickup proof next-day logic.
- [ ] Test idempotent transfers, reference collisions, parallel duplicate attempts, fraud controls, partial payout and all RTO/refund outcomes.
- [ ] Reconcile balances for representative signed real-world cases to Finance-approved expected results.
- [ ] Obtain Finance approval, production backup and staged rollback plan, then authorize exact version release.

**Do not merge PR #328 or run any SQL candidate in production until these gates pass.**
