BRITIUM EXPRESS FINANCIAL V2 V61.3.1
Weight-surcharge pass-through for all merchant registration states, tiered by STANDARD / ROYAL / COMMITMENT

WHY THE SQL EDITOR ERROR OCCURRED
The text below is a file path, not SQL, and PostgreSQL correctly rejected it:
  data_entry_weight_surcharge_pass_through_v61_3_patch/sql/20260802_financial_v2_weight_surcharge_pass_through_v61_3.sql
Open the .sql file, copy its complete contents, paste those contents into Supabase SQL Editor, and run once.

BUSINESS CONTROL
- Active registered merchant: backend uses the active approved profile tier and ignores a different client tier.
- Truly unregistered merchant: Data Entry must select STANDARD, ROYAL, or COMMITMENT.
- A merchant with an inactive, expired, or blocked profile is NOT treated as unregistered and remains blocked.
- Tier-specific tariff, included kg, extra-per-kg, Commitment threshold/refund, and settlement are loaded from be_parcel_tariffs_v2.
- Receiver COD includes customer-paid weight/CBM/other delivery surcharges for ITEM_PRICE_PLUS_DECLARED_DELIVERY and DELIVERY_CHARGE_ONLY.
- Financial writes stay disabled and mutation mode stays MUTATION_SHADOW.

BACKEND
Run the complete contents of:
  sql/20260802_financial_v2_weight_surcharge_all_merchants_v61_3_1.sql
Then run:
  sql/verify_financial_v2_weight_surcharge_all_merchants_v61_3_1.sql

FRONTEND
  node ./data_entry_weight_surcharge_all_merchants_v61_3_1_patch/apply_data_entry_weight_surcharge_all_merchants_v61_3_1.mjs .
  node ./data_entry_weight_surcharge_all_merchants_v61_3_1_patch/verify_data_entry_weight_surcharge_all_merchants_v61_3_1.mjs .
  rm -rf dist node_modules/.vite
  npm run build
  node ./data_entry_weight_surcharge_all_merchants_v61_3_1_patch/verify_dist_data_entry_weight_surcharge_all_merchants_v61_3_1.mjs .

Do not deploy the frontend until the backend verifier returns ok=true.
