# Britium Integrated Master V4.1 - Aligned Source Package

This package aligns the active Britium application source and additive backend migration with the Integrated Master Specification V4.1.

## Start here

1. Read `docs/integrated-master-v4.1/IMPLEMENTATION_STATUS.md`.
2. Review `docs/integrated-master-v4.1/KNOWN_CONTRACT_CONFIRMATIONS.md`.
3. Follow `docs/integrated-master-v4.1/DEPLOYMENT_ORDER.md`.
4. Install dependencies and run `npm run verify:integrated-master`.
5. Test `migrations/20260731190000_integrated_master_v4_1.sql` in staging before production.

## Main production routes

- `/data-entry` - Financial V2 Data Entry
- `/financial-settlement` - Finance and merchant settlement
- `/network-fulfillment` - direct/branch/outsourced monitoring
- `/partner-settlement` - DK/Royal/provider settlement
- `/branch-settlement` - Naypyitaw Branch <-> Head Office settlement
- `/workforce-commission` - workforce and merchant-referral commission

## Security

No `.env.local`, `.env.production`, service-role credential, node module, generated `dist`, or historical deployment archive is included. Populate `.env.example` through the deployment environment. Never expose a Supabase service-role key in a `VITE_*` variable.

## Verification result

The packaged verifier reports 50 passed checks, 0 failed checks, and 3 intentional deployment warnings. See `verification/`.
