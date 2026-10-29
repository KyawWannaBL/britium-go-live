# Mandalay branch controls — release candidate

Manager: Aye Pwint Phyu, MDY-BM-001. Login already exists as branch_mgr_mdy@britiumventures.com.
Target: early November 2026 joint operation with DK Delivery. Exact opening and takeover dates are not configured.

## Daily work

1. Sign in and change the temporary password when prompted.
2. Open Branch Office. The manager is restricted to MDY; Superadmin can select MDY or YGN.
3. Use Plan branch deliveries to select warehouse-ready, received MDY ways and assign approved branch crew. Continue through Supervisor review and release. Scan each canonical Way ID on the review screen, then dispatch through Wayplan Command. Existing delivery eligibility, approved review, workforce authentication and scan gates remain.
4. Record dispatch to the other branch using canonical Way IDs, carrier/team, manifest/seal reference and handover evidence. The destination branch acknowledges only the physical parcels actually received. Partial receipts remain open. Transfer receipt does not mark delivery complete or automatically make a parcel warehouse-ready.
5. Submit setup, expense, asset, contract or daily counted closing cash records with a unique reference, evidence reference/link and notes. Include asset custodian, contract renewal date, cash breakdown or purchase detail in notes.
6. Head-office Finance/Superadmin reviews submissions. The author cannot approve their own record. Approval records a document review only; it does not execute a payment, verify COD, post journals or settle a merchant.
7. Use existing rider handover, Finance reconciliation and merchant settlement workflows for money. Keep DK and branch collections distinct. Do not use expected collection shown on a manifest as confirmed cash.

## Release evidence

- New tests: full migration compilation, branch RPC list/detail boundaries, generator collision denial, regional denial, inactive account denial, Superadmin cross-branch read, source custody, duplicate in-flight transfers, partial and full receipt by destination manager, self-review prohibition.
- Existing enterprise regression suite passes; production build succeeds.
- Finance regression follow-up: the full npm test suite now passes. Settlement tests cover current pending states and distinguish genuine zero due from positive-due missing handovers. Totals tests identify each read RPC independently and cover filters, refresh, ground-report separation, unknown amounts and error isolation. The shared settlement display now requires a positive delivered amount due before showing a pending Finance handover; no payment or settlement authority changed. Production build also passes.
- Broad tsc check encounters existing invalid snippet files: App.additive_pickup_grouping_routes_snippet.tsx, routes/AuthRoutes.snippet.tsx and pages/WaybillStudio.tsx. Vite production build completes.
- No live parcel/payment data created as test data. No production migration/deployment applied by this release candidate: automatic approval review rejected the broad live RPC migration pending explicit authorization.

## Remaining launch checks

Actual manager sign-in; real crew availability/mobile mapping; verified Mandalay hub address/pin; destination warehouse readiness and two-direction delivery exercise; cash opening balances, approved budgets/bank details; Finance posting/sync activation and real reconciliation; direct document upload, renewal reminders, payroll and automatic budget variance are not implemented by this patch. Existing 10% franchise configuration is unchanged and requires business review. This is a control-workflow release candidate, not full branch launch sign-off.
