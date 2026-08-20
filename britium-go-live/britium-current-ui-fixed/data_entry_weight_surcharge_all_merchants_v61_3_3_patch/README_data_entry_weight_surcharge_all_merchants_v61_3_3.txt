BRITIUM EXPRESS FINANCIAL V2 V61.3.3
Controlled Insein tariff repair + weight-surcharge pass-through for registered and unregistered merchants

WHY THE LAST RUN ABORTED
The production tariff master had no unambiguous currently-active Insein row for STANDARD under the exact lookup used by V61.3.1. The transaction aborted, so its function and tariff changes did not commit.

WHAT V61.3.3 DOES
- Accepts harmless Insein aliases such as 'Insein Township' by deterministic suffix normalization only.
- When no active Insein alias exists, creates exact Insein rows by copying the active tier-specific 4,500-MMK Yangon band.
- STANDARD is guarded at base 4,500 MMK, included 3 kg, and 500 MMK per extra kg.
- ROYAL and COMMITMENT preserve any existing Insein tier tariff. Only when missing, they copy their own internally consistent active 4,500-MMK tier band; there is no cross-tier fallback.
- Active registered merchant: the active profile tier overrides the browser value.
- Truly unregistered merchant: Data Entry selects STANDARD, ROYAL, or COMMITMENT.
- Existing inactive, expired, or blocked profile remains blocked.
- Receiver COD includes customer-paid weight/CBM/other delivery surcharges for ITEM_PRICE_PLUS_DECLARED_DELIVERY and DELIVERY_CHARGE_ONLY.
- Financial V2 parcel writes remain disabled and runtime mode remains MUTATION_SHADOW.

SUPABASE
Open and run the CONTENTS of:
  sql/20260802_financial_v2_weight_surcharge_all_merchants_v61_3_3.sql
Then run the CONTENTS of:
  sql/verify_financial_v2_weight_surcharge_all_merchants_v61_3_3.sql
Do not paste either file path into SQL Editor.

FRONTEND
  node ./data_entry_weight_surcharge_all_merchants_v61_3_3_patch/apply_data_entry_weight_surcharge_all_merchants_v61_3_3.mjs .
  node ./data_entry_weight_surcharge_all_merchants_v61_3_3_patch/verify_data_entry_weight_surcharge_all_merchants_v61_3_3.mjs .
  rm -rf dist node_modules/.vite
  npm run build
  node ./data_entry_weight_surcharge_all_merchants_v61_3_3_patch/verify_dist_data_entry_weight_surcharge_all_merchants_v61_3_3.mjs .

Do not deploy the frontend until the SQL verifier returns ok=true.

V61.3.3 SQL-EDITOR AUTHENTICATION HARNESS FIX
- Supabase SQL Editor executes without an end-user JWT, so auth.uid() is normally null.
- The migration now sets a transaction-local request.jwt.claim.role=service_role before calling
  the authenticated schema and calculate RPCs during self-verification.
- The claim exists only inside the migration transaction and does not enable Financial V2 writes,
  change grants, weaken RLS, or alter application-user authorization.
