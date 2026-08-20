# Integrated Master V4.1 Verification

- Build: `BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31`
- Generated: 2026-07-31T12:25:10.111Z
- Passed: 50
- Failed: 0
- Warnings: 3

| Status | Check | Detail |
|---|---|---|
| PASS | Required file: src/lib/integratedMasterSpec.ts |  |
| PASS | Required file: src/pages/DataEntryFinancialV2Page.tsx |  |
| PASS | Required file: src/pages/NetworkFulfillmentPage.tsx |  |
| PASS | Required file: src/pages/branch/BranchOfficeSettlementPage.tsx |  |
| PASS | Required file: src/pages/FinanceMerchantSettlementPage.tsx |  |
| PASS | Required file: src/pages/WorkforceCommissionPage.tsx |  |
| PASS | Required file: migrations/20260731190000_integrated_master_v4_1.sql |  |
| PASS | Required file: config/highway_station_dropoff_rates_v41.csv |  |
| PASS | Required file: config/dk_delivery_rate_bands.csv |  |
| PASS | Required file: config/royal_express_rate_card_q019_2026.csv |  |
| PASS | Required file: docs/integrated-master-v4.1/Britium_Integrated_Master_Specification_V4_1.md |  |
| PASS | Financial V2 is the active /data-entry route |  |
| PASS | Legacy data entry is isolated |  |
| PASS | Network fulfillment route exists |  |
| PASS | Partner settlement route exists |  |
| PASS | Naypyitaw branch settlement route exists |  |
| PASS | Production App has no UAT route |  |
| PASS | Sidebar exposes Network Fulfillment |  |
| PASS | Sidebar exposes Partner Settlement |  |
| PASS | Sidebar exposes NPT Branch Settlement |  |
| PASS | Sidebar has no Mobile Sandbox label |  |
| PASS | Login displays production status |  |
| PASS | Global watermark displays production status |  |
| PASS | All five highway stations are defined |  |
| PASS | Highway rates include 4,000 and 3,000 MMK bands |  |
| PASS | Tier allowances are 3/5/5 kg |  |
| PASS | Default extra kg rate is 500 MMK |  |
| PASS | Routing precedence covers YGN/NPT/MDY/Royal |  |
| PASS | NPT 55/45 and 10% management formulas exist |  |
| PASS | DK cost stack exists |  |
| PASS | Royal COD fee and rebate tiers exist |  |
| PASS | Data Entry supports all five amount-entry types |  |
| PASS | Data Entry supports highway-station drop-off |  |
| PASS | Data Entry calls backend calculate/save/waybill RPCs |  |
| PASS | Network screen uses V55 snapshot RPC |  |
| PASS | Network screen exposes required operational tabs |  |
| PASS | Branch settlement is fixed to NPT Phase 1 |  |
| PASS | Branch settlement includes COD, prepaid, penalties and audit |  |
| PASS | Merchant settlement handles credit and deduction directions |  |
| PASS | Merchant referral commission is represented in UI |  |
| PASS | Integrated SQL contains all required modules/RPCs |  |
| PASS | Integrated SQL is explicitly version stamped |  |
| PASS | Highway station rate card contains exactly five rows | rows=5 |
| PASS | Highway rate card has 3x4000 and 2x3000 |  |
| PASS | DK rate card contains 2,000/2,500/3,000 bands |  |
| PASS | DK unclear surcharge condition is not silently finalized |  |
| PASS | Royal rate card contains 227 routes | rows=227 |
| PASS | Royal YGN/MDY/NPW routes are excluded from routing precedence |  |
| PASS | No UAT/sandbox label in src/App.tsx |  |
| PASS | No UAT/sandbox label in src/components/Sidebar.tsx |  |
| WARNING | Staging database deployment required | The migration is packaged but has not been executed against the live Supabase project. |
| WARNING | Live provider contracts require Finance confirmation | DK 500/1,000 surcharge split, Royal rebate base, Royal COD fee owner, and final NPT management-fee interpretation remain explicit configurable confirmations. |
| WARNING | Full production build requires a Linux dependency install | The uploaded archive contained Windows-native node modules, and the available package mirror did not contain zustand@5.0.14. Targeted strict TypeScript and syntax checks are used for this package. |
