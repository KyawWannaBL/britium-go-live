BRITIUM EXPRESS DATA ENTRY FINANCIAL V2 V61.3
Customer-paid weight-surcharge pass-through and merchant-settlement correction

PURPOSE
Correct the production Financial V2 calculation so customer-paid delivery surcharges are:
- included in receiver COD,
- retained by Britium as part of its delivery entitlement, and
- not deducted from the merchant a second time.

CONFIRMED INSEIN EXAMPLE
50,000 item + 6,000 merchant delivery + 3,500 weight surcharge = 59,500 receiver COD.
4,500 base tariff + 3,500 weight surcharge = 8,000 Britium entitlement.
59,500 receiver COD - 8,000 Britium entitlement = 51,500 merchant settlement.

IMPORTANT
- Merchant-stated subtotal remains 56,000 and remains editable.
- The 3,500 weight surcharge is backend-calculated and read-only.
- Financial V2 remains MUTATION_SHADOW.
- No historical row is changed by the migration.
- Do not enable production financial writes.

FILES
sql/20260802_financial_v2_weight_surcharge_pass_through_v61_3.sql
sql/verify_financial_v2_weight_surcharge_pass_through_v61_3.sql
sql/rollback_financial_v2_weight_surcharge_pass_through_v61_3.sql
apply_data_entry_weight_surcharge_pass_through_v61_3.mjs
verify_data_entry_weight_surcharge_pass_through_v61_3.mjs
verify_dist_data_entry_weight_surcharge_pass_through_v61_3.mjs
patch/src/pages/DataEntryFinancialV2Page.tsx

STEP 1 - BACKEND MIGRATION
Open Supabase SQL Editor and run the complete file:
  sql/20260802_financial_v2_weight_surcharge_pass_through_v61_3.sql

Required result markers:
  "ok": true
  "calculation_version": "PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3"
  "receiver_cod": 59500
  "britium_total_entitlement": 8000
  "merchant_delivery_margin": 1500
  "merchant_final_settlement": 51500
  "mutation_mode": "MUTATION_SHADOW"
  "financial_writes_enabled": false

Then run:
  sql/verify_financial_v2_weight_surcharge_pass_through_v61_3.sql

Do not continue if the SQL verifier returns ok=false.

STEP 2 - FRONTEND INSTALL
From the main portal repository root:
  node ./data_entry_weight_surcharge_pass_through_v61_3_patch/apply_data_entry_weight_surcharge_pass_through_v61_3.mjs .

Then:
  node ./data_entry_weight_surcharge_pass_through_v61_3_patch/verify_data_entry_weight_surcharge_pass_through_v61_3.mjs .

STEP 3 - BUILD AND DIST VERIFY
  rm -rf dist node_modules/.vite
  npm run build
  node ./data_entry_weight_surcharge_pass_through_v61_3_patch/verify_dist_data_entry_weight_surcharge_pass_through_v61_3.mjs .

STEP 4 - PRODUCTION DEPLOY
  npx vercel --prod

Then inspect the returned production URL:
  PROD_URL='PASTE_RETURNED_PRODUCTION_URL'
  npx vercel inspect "$PROD_URL" --wait

Required: target production, status Ready, alias https://www.britiumexpress.com.

BROWSER TEST
Open an incognito window:
  https://www.britiumexpress.com/#/data-entry

Test:
- Township: Insein
- Customer tier: STANDARD
- Amount type: ITEM_PRICE_PLUS_DECLARED_DELIVERY
- Item price: 50000
- Merchant delivery: 6000
- Weight: 10
- Additional customer charge: 0
- CBM surcharge: 0
- Other surcharge: 0
- Merchant charges: 0
- Merchant credits: 0

Required:
- Merchant-stated subtotal: 56,000, editable
- Extra kg: 7
- Weight surcharge: 3,500
- Receiver COD: 59,500
- Britium entitlement: 8,000
- Delivery difference / merchant delivery margin: 1,500
- Settlement direction: CREDIT_TO_MERCHANT
- Merchant final settlement: 51,500
- Mutation gate: Shadow / dry-run only

ROLLBACK
Use rollback SQL only after a confirmed V61.3 regression and only while mutation mode is MUTATION_SHADOW.
