BRITIUM EXPRESS — DATA ENTRY PAYMENT SETTLEMENT V61.8.1
Build date: 2026-08-04

PURPOSE
This hotfix implements the latest approved collection and settlement rules.
It supersedes the earlier V61.8 assumption that exact and opaque COD require an unresolved settlement review.

APPROVED SOUTH OKKALAPA / STANDARD / 10 KG EXAMPLE
Base tariff: 4,000 MMK
Included weight: 3 kg
Extra weight: 7 kg
Extra rate: 500 MMK/kg
Weight surcharge: 3,500 MMK
Britium entitlement: 7,500 MMK

PAYMENT MATRIX
1. ITEM_PRICE_PLUS_DECLARED_DELIVERY
   Inputs: item 50,000 + merchant delivery 6,000
   Receiver COD: 50,000 + 6,000 + 3,500 = 59,500
   Britium: 7,500
   Merchant: 52,000

2. TOTAL_AMOUNT_INCLUDING_DELIVERY
   Approved operational interpretation: item and merchant delivery are entered separately.
   Inputs: item 50,000 + merchant delivery 6,000
   Receiver COD: 59,500
   Britium: 7,500
   Merchant: 52,000

3. DELIVERY_CHARGE_ONLY
   Input: merchant delivery 6,000
   Receiver collection: 6,000 + 3,500 = 9,500
   Britium: 7,500
   Merchant: 2,000

4. EXACT_COLLECTION_AMOUNT
   Input: exact gross amount 56,000
   Receiver collection: 56,000
   Britium: 7,500
   Merchant: 56,000 - 7,500 = 48,500

5. OPAQUE_COD_COLLECTION
   Input: opaque gross amount 56,000
   Receiver collection: 56,000
   Britium: 7,500
   Merchant: 56,000 - 7,500 = 48,500

6. ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT
   Input: item 50,000
   Receiver collection: 50,000
   Britium: 7,500
   Merchant: 42,500

BACKEND INSTALLATION
Run the complete contents of:
  sql/20260804_financial_v2_payment_settlement_v61_8_1.sql

Then run the complete contents of:
  sql/verify_financial_v2_payment_settlement_v61_8_1.sql

Do not paste file paths into Supabase SQL Editor.
Do not run the rollback unless an actual rollback decision is made.

FRONTEND INSTALLATION
From repository root:
  node ./data_entry_payment_settlement_v61_8_1_patch/apply_data_entry_payment_settlement_v61_8_1.mjs .
  node ./data_entry_payment_settlement_v61_8_1_patch/verify_data_entry_payment_settlement_v61_8_1.mjs .
  rm -rf dist node_modules/.vite
  npm run build
  node ./data_entry_payment_settlement_v61_8_1_patch/verify_dist_data_entry_payment_settlement_v61_8_1.mjs .
  npx vercel --prod

SAFETY
- Canonical tariff source remains be_parcel_tariffs_v2.
- Historical rows are not changed.
- Tariff rows are not changed.
- Mutation mode remains MUTATION_SHADOW.
- Financial writes remain disabled.
