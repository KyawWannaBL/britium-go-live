# Package Contents

## Application

- `src/App.tsx` - production route integration.
- `src/components/Sidebar.tsx` - production navigation.
- `src/pages/DataEntryFinancialV2Page.tsx` - Financial V2 entry.
- `src/pages/NetworkFulfillmentPage.tsx` - branch and partner operational control.
- `src/pages/branch/BranchOfficeSettlementPage.tsx` - Naypyitaw branch settlement.
- Existing Finance/Merchant Settlement, Workforce Commission, Business Development, Marketing, Mobile Operations, HR, Accounts, and Final Synchronization screens.

## Shared rules

- `src/lib/integratedMasterSpec.ts`

## Database

- `migrations/20260731190000_integrated_master_v4_1.sql`

## Rate cards

- `config/highway_station_dropoff_rates_v41.csv`
- `config/dk_delivery_rate_bands.csv`
- `config/royal_express_rate_card_q019_2026.csv`

## Master specification and source contracts

- `docs/integrated-master-v4.1/Britium_Integrated_Master_Specification_V4_1.*`
- DK Delivery source rate PDF.
- Royal Express quotation PDF.

## Validation

- `scripts/verify_integrated_master_v4_1.mjs`
- `verification/integrated_master_v4_1_verification.md`
- `verification/integrated_master_v4_1_verification.json`
- `tsconfig.integrated-check.json`
