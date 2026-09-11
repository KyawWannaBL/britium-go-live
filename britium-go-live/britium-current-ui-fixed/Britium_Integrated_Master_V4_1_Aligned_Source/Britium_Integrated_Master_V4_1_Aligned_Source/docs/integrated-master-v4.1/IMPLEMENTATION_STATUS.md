# Britium Integrated Master V4.1 - Code Alignment Status

**Build:** `BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31`  
**Package date:** 31 July 2026  
**Status:** Source-aligned package ready for staging database deployment and production build validation.

## Implemented in this package

### Financial V2 and merchant settlement

- Financial V2 is the active `/data-entry` screen.
- The legacy screen is isolated at `/data-entry-legacy` for controlled transition only.
- All five amount-entry types are supported.
- Merchant-declared delivery, company tariff, receiver collection, delivery difference, and merchant settlement are separate values.
- Highway-station drop-off is a controlled service type.
- Backend RPC contracts are included for calculate, save, and waybill creation.
- The Finance/Merchant Settlement screen remains connected to credit, deduction, exception, batch, payment, dispute, and statement workflows.

### Highway station drop-off

Active stations and base rates:

| Station | Rate |
|---|---:|
| Downtown Highway Station Drop Off | 4,000 MMK |
| Bayintnaung Drop Off | 4,000 MMK |
| Hlaing Thar Yar - Dagon Thiri Highway Station | 4,000 MMK |
| North Okkalapa - Aung Mingalar Highway Station | 3,000 MMK |
| Parami Highway Station | 3,000 MMK |

The standard tier includes 3 kg; Royal and Commitment include 5 kg. The default extra-weight charge is 500 MMK per chargeable extra kilogram. CBM, other approved surcharges, and Commitment refund remain separate components.

### Fulfillment routing and partner operations

The configured precedence is:

1. Yangon -> Britium Direct.
2. Naypyitaw -> Naypyitaw Branch.
3. Mandalay -> Britium-managed, DK Delivery executed.
4. Other supported destinations -> Royal Express.
5. Arlu Post, Ninja Van, and Safe Delivery Services -> authorized exception/fallback providers.

The new Network Fulfillment screen covers routing, branch/partner handovers, transit, delivery exceptions, returns, COD custody, partner settlement, branch reconciliation, SLA, coverage/contracts, and audit.

### Mandalay / DK Delivery

- Britium customer charge remains the Yangon-Mandalay tariff plus applicable Britium surcharges.
- Highway bus line-haul cost and DK last-mile cost are recorded separately.
- DK last-mile bands are 2,000, 2,500, and 3,000 MMK.
- DK 500/1,000 MMK size/weight surcharge rows remain `PENDING_CONFIRMATION`; the system does not guess the trigger.
- Fulfillment margin is Britium recognized delivery revenue less allocated highway cost and approved DK costs.

### Royal Express

- All 227 quoted routes are included in the partner rate CSV and migration.
- Normal customer rate, 15% discounted partner rate, next-kilogram fee, COD fee, and monthly rebate are separate financial elements.
- Yangon, Mandalay, and Naypyitaw Royal rows are retained for history/reference but excluded from current routing precedence.
- COD fee rule: 195 MMK up to 300,000 MMK; 0.2% above 300,000 MMK.
- Rebate tiers: 5% at 1,000+, 10% at 2,000+, and 15% at 3,000+ completed monthly ways.

### Naypyitaw branch settlement

- Dedicated Naypyitaw-only Branch <-> Head Office Settlement screen.
- 55% sender-side share and 45% last-mile share.
- 10% Head Office management fee on Naypyitaw's allocated gross share.
- COD custody/remittance is separate from revenue sharing.
- Batch, prepaid, penalties, payments, disputes, and audit workflows are represented.

### Workforce commission

- `MERCHANT_REFERRAL` remains a separate company workforce expense.
- Rate is 100 MMK per eligible delivered way.
- Employee employment period and merchant referral assignment period are enforced by the migration.
- Duplicate commission events for the same Way/employee are prevented.

### Production controls

- Active App and Sidebar contain no UAT route or “Mobile Sandbox” label.
- New production routes are registered in App and Sidebar.
- Financial and settlement changes are designed for backend authority and audit.
- The integrated migration includes permissions, rate snapshots, settlement snapshots, partner events, COD custody, and audit records.

## Verification completed

- Automated integrated-master conformance verifier: **48 passed, 0 failed**.
- Targeted strict TypeScript check for new/modified isolated modules: passed.
- Syntax transpilation check for App, Sidebar, and all new screens: passed.
- Rate-card validation:
  - Highway station rows: 5.
  - Royal Express rows: 227.
  - DK base bands: 2,000/2,500/3,000 MMK.

See:

- `verification/integrated_master_v4_1_verification.md`
- `verification/integrated_master_v4_1_verification.json`
- `tsconfig.integrated-check.json`

## Required before production activation

1. Back up current production schema, RPCs, RLS policies, grants, and active rate masters.
2. Review and execute `migrations/20260731190000_integrated_master_v4_1.sql` in staging.
3. Load/confirm merchant, employee, branch, provider, bank-account, and permission records.
4. Confirm the contract items listed in `KNOWN_CONTRACT_CONFIRMATIONS.md`.
5. Install dependencies on a supported Linux build runner and run:

   ```bash
   npm ci
   npm run verify:integrated-master
   npm run lint
   npm run build
   ```

6. Run staging acceptance tests and financial reconciliation before production migration.

## Important packaging note

The delivered ZIP intentionally excludes `node_modules`, generated builds, legacy ZIP/TGZ bundles, temporary backup files, and obsolete source backups. Dependencies must be installed from `package-lock.json` on the deployment runner.
