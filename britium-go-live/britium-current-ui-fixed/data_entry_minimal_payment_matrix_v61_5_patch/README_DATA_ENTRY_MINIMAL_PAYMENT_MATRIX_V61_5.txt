BRITIUM EXPRESS — DATA ENTRY MINIMAL PAYMENT MATRIX V61.5
Build date: 03 August 2026
Target: Production portal

PURPOSE
1. Correct weight, CBM and approved delivery-surcharge ownership for all six amount-entry types.
2. Keep the main Data Entry screen minimal: only fields the operator must enter are visible.
3. Place parcel weight and the weight-surcharge formula before the final COD/settlement summary.
4. Move optional adjustments, backend outputs, audit values and all hidden columns into the full review sheet.
5. Make the review sheet editable before save validation and Waybill creation.

CONFIRMED STANDARD EXAMPLE — NORTH DAGON, 10 KG
Base tariff: 4,000 MMK
Included weight: 3 kg
Extra weight: 7 kg
Extra rate: 500 MMK/kg
Weight surcharge: 3,500 MMK
Item price: 50,000 MMK
Merchant-declared delivery: 6,000 MMK
Receiver COD: 59,500 MMK
Britium entitlement: 7,500 MMK
Merchant settlement: 52,000 MMK

ALL-SIX-TYPE PAYMENT MATRIX
A. ITEM_PRICE_PLUS_DECLARED_DELIVERY
   Receiver COD = item price + declared delivery + backend delivery surcharges + additional customer charge.

B. TOTAL_AMOUNT_INCLUDING_DELIVERY
   Receiver COD = merchant-stated total + backend delivery surcharges + additional customer charge.
   Embedded delivery = stated total - item price; the backend surcharge is then added once.

C. DELIVERY_CHARGE_ONLY
   Receiver COD = declared delivery + backend delivery surcharges + additional customer charge.

D. EXACT_COLLECTION_AMOUNT
   Receiver COD = exact instructed amount + backend delivery surcharges + additional customer charge.
   Settlement remains BREAKDOWN_REQUIRED until an accepted split exists.

E. OPAQUE_COD_COLLECTION
   Receiver COD = contracted opaque amount + backend delivery surcharges + additional customer charge.
   Settlement remains OPAQUE_SERVICE_FEE review until the approved contract fee rule is available.

F. ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT
   Receiver COD = item price + additional customer charge.
   The receiver does not pay delivery surcharges. Britium entitlement, including weight surcharge, is recovered from merchant settlement.

MAIN SCREEN
Visible:
- Recipient name
- Recipient phone
- Township
- Delivery address
- Collection type
- Only the amount fields required for the selected collection type
- Merchant tier only when the backend identifies a truly unregistered merchant
- Parcel weight
- Compact weight formula
- Weight surcharge, receiver COD, Britium entitlement and merchant settlement
- Collapsed photo control

Hidden from the main screen:
- Customer/merchant IDs and status
- Schema/environment/mutation labels
- Tariff reference/provider suggestion boxes
- Base tariff, zone, monthly Ways, calculation version and timestamps as disabled inputs
- Additional customer charge, CBM, other surcharge, merchant charges, credits and remarks
- All audit fields
These remain available in the review sheet where applicable.

REVIEW SHEET
Button:
မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်

Default view:
- Editable/input columns only
- Tall editable white cells
- Sticky parcel and Way ID columns
- Immediate amendments supported
- Automatic recalculation remains active

Show all 50 columns:
- Reveals backend/system fields as read-only cells
- Does not turn server-controlled fields into trusted browser inputs

INSTALLATION
1. Run SQL migration contents in Supabase SQL Editor:
   sql/20260803_financial_v2_all_payment_types_v61_5.sql

2. Run verifier contents:
   sql/verify_financial_v2_all_payment_types_v61_5.sql

3. Install frontend from portal repository root:
   node ./data_entry_minimal_payment_matrix_v61_5_patch/apply_data_entry_minimal_payment_matrix_v61_5.mjs .

4. Verify source:
   node ./data_entry_minimal_payment_matrix_v61_5_patch/verify_data_entry_minimal_payment_matrix_v61_5.mjs .

5. Build:
   rm -rf dist node_modules/.vite
   npm run build

6. Verify compiled bundle:
   node ./data_entry_minimal_payment_matrix_v61_5_patch/verify_dist_data_entry_minimal_payment_matrix_v61_5.mjs .

7. Deploy after every gate passes:
   npx vercel --prod

SAFETY
- No tariff row is updated.
- No historical parcel or Financial V2 row is changed.
- MUTATION_SHADOW remains unchanged.
- VITE_FINANCIAL_V2_WRITES_ENABLED remains false unless separately approved.
- No direct financial-table upsert is added.
