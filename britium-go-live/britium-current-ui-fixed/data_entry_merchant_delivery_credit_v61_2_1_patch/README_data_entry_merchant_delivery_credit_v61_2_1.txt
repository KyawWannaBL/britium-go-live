Britium Data Entry Merchant Delivery-Difference Credit V61.2.1

Confirmed business rule
- Positive delivery difference belongs to the merchant.
- Example: declared delivery 5,000 - backend net system delivery 4,000 = 1,000 merchant credit.
- With item price 50,000, no other charges/credits: final merchant settlement = 51,000.
- Do not copy the 1,000 into additional_customer_charge or other_merchant_credits; doing so would double count.
- The backend remains authoritative for delivery_difference, settlement_direction, merchant_settlement_adjustment, and merchant_final_settlement_amount.
- All operator input fields remain editable.
- Production financial writes remain disabled.

Install
1. sha256sum britium_data_entry_merchant_delivery_credit_v61_2_1_20260802.tgz
2. tar -xzf britium_data_entry_merchant_delivery_credit_v61_2_1_20260802.tgz
3. node ./data_entry_merchant_delivery_credit_v61_2_1_patch/apply_data_entry_merchant_delivery_credit_v61_2_1.mjs .
4. node ./data_entry_merchant_delivery_credit_v61_2_1_patch/verify_data_entry_merchant_delivery_credit_v61_2_1.mjs .
5. rm -rf dist node_modules/.vite && npm run build
6. node ./data_entry_merchant_delivery_credit_v61_2_1_patch/verify_dist_data_entry_merchant_delivery_credit_v61_2_1.mjs .
