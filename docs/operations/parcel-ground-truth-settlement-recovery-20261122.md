# Britium Express — Real-World Parcel Outcome & Settlement Recovery
**Date:** 2026-11-22  
**Approval:** owner/superadmin authorization to proceed with controlled implementation; **NOT** permission to manufacture evidence, backdate events, or pay unverified amounts.  
**Implementation:** PR #350 (not deployed to production)

## Read-only reconciliation baseline (live production query on 2026-11-22)
| Evidence class | Ways | Meaning |
|---|---:|---|
| Distinct warehouse Way IDs | 1,985 | Base application inventory snapshot |
| Warehouse READY_FOR_DELIVERY | 1,874 | App status only; may contradict on-ground completion |
| Warehouse DELIVERY_FAILED | 79 | Must assess redelivery / returned / cancelled / lost only with evidence |
| Warehouse RETURN_TO_SENDER | 12 | Not proof of merchant receipt |
| Warehouse SUBMITTED | 20 | Require progression / custody review |
| Finance COD SETTLED | 816 | Financial status, **not** proof of delivery |
| Finance COD PENDING_REMITTANCE | 44 | Needs remittance evidence and finance approval |
| Warehouse without Finance COD v48 record | 1,125 | Not automatically a missing financial liability |
| Dedicated provider physical custody rows | 0 | Provider proof integration gap |
| Return scans | 165 events / 125 distinct ways | Multiple scans are not necessarily duplicates |\n| Return scans while warehouse READY_FOR_DELIVERY | 49 distinct ways | Independently flag, even if finance is SETTLED |
| Ledger delivered_at / rider proof / cod_settled_at populated | 0 / 0 / 0 | That specific ledger is not an authoritative proof source here |
 
**Critical:** All 816 finance SETTLED records currently pair with warehouse READY_FOR_DELIVERY. Do not reverse settlement or mark delivered automatically. Investigate joined source-of-truth conflicts and provenance.

## Reconciliation exceptions visible independently\nA way may appear in multiple exception groups. The monitoring view includes an array of independent flags instead of losing secondary evidence to a one-label precedence rule. As of the read-only audit, 816 ways have a finance-settled/warehouse-ready conflict and 49 ways have a return-scan/warehouse-ready conflict. These are not automatically 865 distinct ways.\n\n## Owner-approved operational work queue (complete in order)
1. **Freeze baseline / preservation** — Operations + Finance Controller: export immutable, timestamped canonical Way IDs, source status, COD, provider and finance evidence. Never hard-delete or bulk reset historical rows; preserve prior revisions and receipt references.
2. **Collect ground truth** — Branch Managers / Provider Coordinator / Rider Supervisors: for every Way ID import actual outcome from signed delivery sheets, POD photo, provider external tracking, delivery signatures, third-party manifests, cash handover receipts, merchant RTO acceptance. Every assertion needs source, date/time, operator, reviewer and attachment; store as **unverified ground claim** until approved.
3. **Match without overwriting** — Data Audit: match exact original Way ID first; retain merchant and destination, resolve duplicates with controlled human review; report evidence present outside app and app-only statuses. Reject joins based solely on three-letter merchant codes or recipient names.
4. **Outcome cases** — Customer Service + Ops: categorize delivered, confirmed RTO, return in transit, failed/next attempt, pending provider, warehouse stock, unknown/disputed. Distinguish **physical outcome** from **recorded status** and **finance eligibility**.
5. **Custody proof** — Warehouse Lead + Provider Coordinator: reconstruct transfers only from legitimate scan/receipt/manifest evidence. Unverified past handovers remain labelled claims. Record new physical events with append-only receipt, receiving party, timestamp and original Way ID. Never invent historic scans.
6. **Delivered cases** — CS verifies POD and collected value, Finance verifies rider/provider cash receipt, existing settlement and duplicates; create a proposed **delta** only if unpaid/underpaid or overpaid is established. Never run settlement merely because destination was delivered.
7. **RTO cases** — Warehouse + Merchant Relations obtains return receipt signed by merchant, checks retained item value, COD not collectible, delivery attempt / return fees contractually due, and who holds the item. Post RTO only upon genuine custody resolution; retain all failed attempts.
8. **Pending/failed cases** — CS + Dispatch confirms next action/date, assigned provider, stock location, last verified custodian, latest scan and customer contact. Pending stock is **not eligible** for final COD/merchant payout without independently verified payment terms.
9. **Third party / branch / ဂိတ်ချ** — Provider Coordinator reconciles Royal, DK, Mandalay Branch, Insein Branch, other provider and highway gate manifests separately. A branch may be a custody stage, not the final provider. Validate tracking ref, handover, delivery outcome, provider charges, station charge and return paths.
10. **Finance reconciliation** — Finance Controller assembles per-Way expected COD, reported collection, actual cash/bank receipt, provider fee, Britium share, merchant payable, gate charges, advances, refunds, RTO/failed fees and existing settlement credits. Reconcile signed bank receipts; zero, blank and not-recorded remain separate.
11. **Maker-checker settlement** — Finance preparer records claim and attachments; Finance Manager reviews arithmetic and duplicates; designated approver authorizes exact delta; payment officer posts/receipts; accountant verifies ledger and proof of merchant transfer. No actor self-approves; no direct SQL to change settled flags.
12. **Exception owners & SLAs** — Assign exception case with owner, priority, last contact, next action and deadline; review daily. Physical missing/lost only after investigation plus custody inventory checks, never by absence from exports.
13. **Merchant confirmation** — Issue Way ID statement by merchant and provider: delivered and COD, RTO with receipt, open/pending, settlement details; request acknowledgment and resolve discrepancies.
14. **Audit closure** — Close a case only when physical state, custody chain, finance settlement and merchant/provider acknowledgments agree, or an approved written disputed/unknown disposition exists.

## Minimum columns in ground evidence intake
- original_delivery_way_id, source_document_ref, evidence_kind, evidence_file_path
- observed_physical_outcome, observed_at, observed_by, reporting_org
- from_custodian, to_custodian, receiver, signed_manifest_ref, provider_tracking_ref
- cod_claimed_mmk, cash_received_mmk, delivery_charge_mmk, provider_charge_mmk, gate_charge_mmk
- branch, provider, merchant, destination, evidence_review_status
- reviewer, reviewed_at, discrepancy_reason, operational_case_owner, next_due_at

## Posting safeguards
- A claim is not an accepted custody event until checked.
- A payment is not posted without verified source payment evidence and maker-checker authorization.
- Never overwrite real historical amounts / confirmed settlement; post an approved adjustment linked to original way and existing settlement reference.
- Enforce idempotency and unique external receipt/payment reference. Run duplicate and negative-variance checks.
- Do not auto-upgrade warehouse READY_FOR_DELIVERY to DELIVERED from a finance SETTLED flag.
- Do not mark all 1,125 ways missing a COD v48 row as unpaid or lost.
- Preserve environment isolation and RLS branch/territory scope.

## Technical UAT gates
1. Install & validate the read-only monitor view on an isolated UAT database, reconcile counts against source.
2. Test every exception rule against seeded conflicting records and expected precedence.
3. Establish branch/RLS access for monitor query and custody ingestion, with no broad authenticated grants.
4. Connect append-only custody events through vetted staff/branch/RPC identity, duplicate protection, evidence requirements.
5. Add separate ground-claim intake and reviewer approval; no event/status mutations from unreviewed imports.
6. Add reconciliation detail, case ownership, merchant statements and approved finance delta workflow.
7. Validate for all seven provider/branch/gate categories, rollback, performance and safety before production.

## Operations daily control totals
Report total original ways, each ground outcome, each application status, unreviewed claims, evidenced physical handovers, mismatched states, COD cash actually received, verified settled amount, outstanding merchant payable, provider payable, gate charge and unmatched exceptions. Do not sum ledger balances across non-overlapping source periods without matching Way IDs.
