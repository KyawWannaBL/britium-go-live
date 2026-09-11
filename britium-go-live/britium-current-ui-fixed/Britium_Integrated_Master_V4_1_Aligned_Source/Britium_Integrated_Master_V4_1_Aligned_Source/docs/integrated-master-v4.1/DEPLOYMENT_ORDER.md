# Integrated Master V4.1 Deployment Order

## 0. Freeze and backup

- Freeze financial schema changes during deployment.
- Export production schemas, RPC definitions, RLS policies, grants, triggers, and current tariff/provider masters.
- Record pre-deployment totals for pending COD, merchant payable, branch balances, partner payable, and commission events.

## 1. Review contractual configuration

Confirm and record:

- DK 500/1,000 MMK surcharge trigger.
- Royal rebate calculation base.
- Royal COD fee payer/owner.
- Naypyitaw 10% management-fee interpretation.
- Approved highway cost allocation method for Mandalay manifests.
- Effective dates for every rate and contract.

Do not activate an unresolved rate row.

## 2. Deploy database migration to staging

Run:

```text
migrations/20260731190000_integrated_master_v4_1.sql
```

Then confirm:

- All tables and functions were created.
- RLS and grants match security policy.
- Existing parcel rows remain valid.
- No active historical tariff snapshot was overwritten.
- No duplicate settlement/commission events were created.

## 3. Seed and validate master data

- Highway station master.
- Provider and partner contracts.
- Royal Express 227-route rate card.
- DK rate bands and pending surcharge rows.
- Coverage and routing precedence.
- Naypyitaw branch settlement rule.
- Employee/referrer assignment records.

## 4. Deploy application source

- Install dependencies on Linux.
- Run `npm run verify:integrated-master`.
- Run lint and production build.
- Deploy the generated Vite build.

## 5. Staging acceptance tests

At minimum test:

- Merchant delivery higher, lower, equal, included-total, and merchant-paid scenarios.
- Exact collection requiring breakdown.
- Highway stations at 3,000 and 4,000 MMK, with extra kg and Commitment refund.
- Yangon direct, Naypyitaw branch, Mandalay DK, and Royal routing.
- DK cost stack with highway allocation.
- Royal normal/discount/COD/rebate calculations.
- NPT 55/45 and 10% management fee in both directions.
- Partner POD and COD remittance.
- Merchant referral commission during and outside employment/referral periods.
- Duplicate batch/payment/event prevention.
- Role and branch access restrictions.

## 6. Financial reconciliation gate

For every sample batch verify:

```text
Customer Collection
= Merchant Settlement
+ Britium Delivery Revenue
+ Company-Owned Additional Charges
```

Also separately verify:

```text
Britium Outsourced Margin
= Recognized Britium Delivery Revenue
- Approved Partner/Line-Haul Cost
```

COD custody must reconcile independently from revenue sharing and partner fees.

## 7. Production release

- Apply the reviewed migration.
- Deploy the validated application build.
- Enable feature flags in sequence: Financial V2, Network Fulfillment, NPT Settlement, Partner Settlement.
- Monitor exceptions, reconciliation mismatches, missing rates, missing POD, and COD overdue alerts.

## 8. Rollback

- Disable new routes/features first.
- Stop new batch creation.
- Preserve all new ledger/audit records.
- Restore previous function definitions only from the pre-deployment backup.
- Never delete completed settlement or commission history during rollback.
