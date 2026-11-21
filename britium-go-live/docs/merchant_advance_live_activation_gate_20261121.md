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

## Rehearsal status
- Syntax/dependency compile of all three candidate SQL files in a **single BEGIN/ROLLBACK transaction against production**: passed. No objects persisted.
- This is NOT a payout functional test.
- Existing UAT `hgijdyfwmvskchsruknp` currently lacks required warehouse receipts, finance batches/items, disputes, holds, finance settlement queue and Finance authorization RPC. It cannot execute a valid advance payout rehearsal yet.
- Existing six active merchant financial profiles have no configured `settlement_method`. Advance percentages, deductions, and contractual eligibility have not been provided or approved. Do not invent policy rates.
- No live parcel, payment, wallet, finance or refund records were modified.

## Release prerequisites (all mandatory)
- [ ] Restore actual UAT dependencies from reviewed schema baseline without overwriting branch auth data.
- [ ] Obtain signed per-merchant advance policy (merchant IDs, rates, per-way deductions, providers, effective dates, verified beneficiary).
- [ ] Implement + independently audit final-delivery advance-to-payable offset and approved accounting journal posting, including wallet/report impact.
- [ ] Test maker/checker/payment officer segregation and RLS / direct RPC invocation; revoked users denied.
- [ ] End-to-end test YGN/MDY/NPT/Royal/DK, cross-branch and pickup proof next-day logic.
- [ ] Test idempotent transfers, reference collisions, parallel duplicate attempts, fraud controls, partial payout and all RTO/refund outcomes.
- [ ] Reconcile balances for representative signed real-world cases to Finance-approved expected results.
- [ ] Obtain Finance approval, production backup and staged rollback plan, then authorize exact version release.

**Do not merge PR #328 or run any SQL candidate in production until these gates pass.**
