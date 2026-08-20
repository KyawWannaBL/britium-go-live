# BRITIUM EXPRESS
## Data Entry Minimal Clean UX — Implementation Specification V61.6

**Build identifier:** `PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03`  
**Target route:** `/#/data-entry`  
**Environment:** Production only  
**Financial mode:** `MUTATION_SHADOW`  
**Financial writes enabled:** `false`  

---

## 1. Objective

Rebuild the active Data Entry page into a compact, calm, task-focused screen for operational staff.

The main page must show only the fields that the Data Entry operator must type or select. All backend-derived values, tariff metadata, audit information, internal identifiers, technical status values, calculation versions, timestamps, and system instructions must remain hidden from the normal registration screen.

The operator must be able to:

1. Enter recipient, address, parcel, and collection information.
2. Allow the backend to calculate tariff, surcharge, COD, Britium entitlement, and merchant settlement automatically.
3. Review all parcels in one full-screen inspection sheet before saving.
4. Correct editable values directly inside the inspection sheet.
5. Recalculate all changed rows.
6. Save only after every row passes the backend validation gate.
7. Print the Waybill only after successful save/readiness confirmation.

---

## 2. Non-Negotiable Rules

1. Do not display disabled textboxes for backend-only values on the normal Data Entry screen.
2. Do not display schema, environment, mutation mode, calculation version, timestamp, tariff source, provider, zone code, audit actor, or internal validation metadata on the normal screen.
3. Do not display long instructional paragraphs beneath fields.
4. Do not display tariff reference cards or township suggestion explanations after township selection.
5. Do not calculate tariff authority locally in the browser.
6. Do not directly upsert Financial V2 records from the browser.
7. Do not enable production financial writes as part of V61.6.
8. Keep `MUTATION_SHADOW` and `VITE_FINANCIAL_V2_WRITES_ENABLED=false`.
9. The parcel weight section must appear before final charge results.
10. The weight surcharge must be calculated by the backend and applied exactly once according to the selected collection type.
11. All editable corrections made in the review sheet must invalidate the previous calculation and trigger recalculation before save.
12. Waybill creation must remain blocked for `ERROR`, unresolved `BREAKDOWN_REQUIRED`, or unresolved opaque-contract records.

---

## 3. Main Screen — Final Layout

### 3.1 Compact page header

Display only:

- Page title: `Data Entry Registration`
- Selected Pickup ID
- Merchant name/code
- Parcel count
- Language switch

Do not display:

- Production badge
- Schema version
- Field count
- Environment
- Mutation gate
- Download template
- Workbook validator
- Backend status cards
- Technical subtitle

### 3.2 Parcel navigation

For multiple parcels, use one of the following compact patterns:

- Horizontal parcel tabs: `Parcel 1`, `Parcel 2`, `Parcel 3`, or
- Previous / Next buttons with `Parcel 1 of 3`

Only one parcel form should be expanded at a time.

The page must not display all 50 backend fields for every parcel vertically.

### 3.3 Section A — Recipient

Show only:

- Recipient Name
- Recipient Phone
- Township
- Delivery Address

Layout:

- Recipient Name and Phone on one row
- Township full width or half width
- Delivery Address full width

Township behavior:

- Keep search and selection.
- Do not show provider, source fee, tariff reference, source code, city/region explanation, backend authority note, or suggestion cards after selection.
- Store only the selected canonical township value in the row input.

### 3.4 Section B — Parcel

This section must appear before all final financial results.

Show only:

- Actual Weight (kg)
- CBM surcharge input only when the operator explicitly enables `Add CBM charge`
- Other approved surcharge only when the operator explicitly enables `Add other surcharge`

Default state:

- Weight visible
- CBM hidden
- Other surcharge hidden

Do not show as textboxes:

- Included kg
- Chargeable weight
- Extra kg
- Extra per kg
- Weight surcharge
- Tariff zone
- Tariff zone code
- Base tariff
- Commitment threshold
- Commitment refund

After calculation, show one compact non-editable summary line below the weight input:

`10 kg − 3 kg included = 7 kg extra × 500 MMK = 3,500 MMK`

This line must be a simple summary, not a textbox.

### 3.5 Section C — Collection

Show:

- Collection Type
- Only the amount fields required for the selected collection type

Collection type labels must be user-friendly. Do not show raw enum codes to operators.

#### Type 1 — Item Price + Delivery

Show:

- Item Price
- Merchant Delivery Charge

Hide:

- Merchant Stated Total

#### Type 2 — Total Amount Including Delivery

Show:

- Item Price
- Merchant Stated Total

Hide:

- Merchant Delivery Charge

#### Type 3 — Delivery Charge Only

Show:

- Merchant Delivery Charge

Hide:

- Item Price
- Merchant Stated Total

#### Type 4 — Exact Collection Amount

Show:

- Exact Collection Amount

Hide:

- Item Price
- Merchant Delivery Charge

The backend may return `REVIEW / BREAKDOWN_REQUIRED` until an accepted breakdown exists.

#### Type 5 — Opaque COD Collection

Show:

- Contracted COD Amount

Hide:

- Item Price
- Merchant Delivery Charge

This type must be available only for an eligible merchant profile or approved contract flag.

#### Type 6 — Item Price Only; Merchant Pays Delivery

Show:

- Item Price

Hide:

- Merchant Delivery Charge
- Merchant Stated Total

### 3.6 Optional adjustments

Keep hidden under one compact button:

`Additional adjustments`

When expanded, show only editable operational adjustment fields:

- Additional customer charge
- CBM surcharge
- Other approved surcharge
- Merchant payable charges
- Other merchant credits
- Remarks

These fields must remain collapsed by default.

### 3.7 Section D — Final Summary

Display three large summary cards only:

1. `Receiver Collection`
2. `Britium Delivery Charge`
3. `Merchant Settlement`

Optional fourth compact status badge:

- Ready
- Review required
- Error

Do not display separate textboxes for:

- COD amount
- Base tariff
- Gross system delivery charge
- Net system delivery charge
- Delivery difference
- Settlement direction
- Merchant adjustment
- Calculation version
- Calculated at

The three summary cards must update only from the backend calculation response.

---

## 4. Backend Calculation Matrix

### 4.1 Common tariff formula

```text
chargeable_weight_kg = CEILING(MAX(actual_weight_kg, 0))
extra_kg = MAX(0, chargeable_weight_kg - included_kg)
weight_surcharge = extra_kg × extra_per_kg
backend_delivery_surcharges = weight_surcharge + cbm_surcharge + other_surcharge
britium_delivery_entitlement = MAX(
  0,
  base_tariff + backend_delivery_surcharges - commitment_refund
)
```

### 4.2 Standard 10 kg example

```text
Tier: STANDARD
Base tariff: 4,000 MMK
Included weight: 3 kg
Actual weight: 10 kg
Extra weight: 7 kg
Extra rate: 500 MMK/kg
Weight surcharge: 3,500 MMK
Britium entitlement: 7,500 MMK
```

### 4.3 Collection type formulas

#### Item Price + Delivery

```text
receiver_collection = item_price
                    + merchant_declared_delivery
                    + customer_payable_delivery_surcharges
                    + additional_customer_charge

effective_declared_delivery = merchant_declared_delivery
                              + customer_payable_delivery_surcharges

merchant_settlement = receiver_collection
                    - britium_delivery_entitlement
                    + other_merchant_credits
                    - merchant_payable_charges
```

Example:

```text
50,000 + 6,000 + 3,500 = 59,500 MMK receiver collection
59,500 - 7,500 = 52,000 MMK merchant settlement
```

#### Total Amount Including Delivery

```text
receiver_collection = merchant_stated_total
                    + customer_payable_delivery_surcharges
                    + additional_customer_charge

effective_declared_delivery = merchant_stated_total
                              - item_price
                              + customer_payable_delivery_surcharges
```

#### Delivery Charge Only

```text
receiver_collection = merchant_declared_delivery
                    + customer_payable_delivery_surcharges
                    + additional_customer_charge

merchant_settlement = receiver_collection
                    - britium_delivery_entitlement
                    + other_merchant_credits
                    - merchant_payable_charges
```

#### Exact Collection Amount

```text
receiver_collection = exact_collection_amount
                    + customer_payable_delivery_surcharges
```

Normal merchant settlement remains blocked until an accepted breakdown exists.

#### Opaque COD Collection

```text
receiver_collection = contracted_opaque_cod_amount
                    + customer_payable_delivery_surcharges
```

Merchant payout remains subject to the approved opaque-service-fee contract rule.

#### Item Price Only; Merchant Pays Delivery

```text
receiver_collection = item_price + additional_customer_charge
customer_payable_delivery_surcharges = 0
merchant_delivery_deduction = britium_delivery_entitlement
merchant_settlement = item_price
                    - britium_delivery_entitlement
                    + other_merchant_credits
                    - merchant_payable_charges
```

The receiver must not pay the delivery charge or weight surcharge for this type.

---

## 5. Automatic Calculation Behaviour

1. Use a 400–600 ms debounce after relevant editable inputs change.
2. Trigger `be_data_entry_financial_v2_calculate` only when the minimum required fields for the selected collection type are present.
3. Cancel or ignore stale responses when the row changes before an earlier request returns.
4. Show a small spinner inside the summary area only.
5. Do not show technical request text or RPC names.
6. On success, update the three summary cards.
7. On `REVIEW`, show one short warning banner.
8. On `ERROR`, show one short field-level or row-level error message.
9. Do not render empty backend outputs as disabled boxes.

---

## 6. Review Before Save

### 6.1 Button

Use the exact Myanmar label:

`မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်`

English label:

`Review All Records Before Saving`

### 6.2 Review sheet presentation

Open a full-screen modal or full-page overlay.

The review sheet must:

- Show all parcels in one table.
- Use taller rows for names and addresses.
- Keep the first columns sticky.
- Allow horizontal scrolling.
- Hide system-generated columns by default.
- Use white/light editable cells for operator inputs.
- Use dark read-only cells only after `Show system columns` is enabled.

### 6.3 Default visible columns

1. Parcel No.
2. Way ID
3. Recipient Name
4. Recipient Phone
5. Township
6. Delivery Address
7. Collection Type
8. Item Price
9. Merchant Delivery Charge
10. Merchant Stated Total
11. Weight (kg)
12. CBM Surcharge
13. Other Surcharge
14. Receiver Collection
15. Britium Delivery Charge
16. Merchant Settlement
17. Validation

Columns irrelevant to the selected collection type may show `—`.

### 6.4 Hidden system columns

Reveal only when the operator clicks:

`Show system columns`

Hidden columns include:

- Pickup ID
- Merchant ID
- Customer ID
- Tier source
- Monthly ways
- Tariff zone
- Tariff zone code
- Base tariff
- Included kg
- Chargeable weight
- Extra kg
- Extra per kg
- Weight surcharge
- Gross system charge
- Commitment refund
- Net system charge
- Effective declared delivery
- Delivery difference
- Settlement direction
- Merchant settlement adjustment
- Calculation version
- Calculated timestamp
- Entered by
- Authorized by
- Environment
- Audit metadata

### 6.5 Editing inside review sheet

Editable cells:

- Recipient name
- Recipient phone
- Township
- Delivery address
- Collection type
- Type-dependent amount fields
- Weight
- Optional adjustments
- Remarks

When any editable cell changes:

1. Mark the row as `Changed`.
2. Clear the previous validation status.
3. Clear the previous summary result visually.
4. Recalculate the row automatically or through `Recalculate Changed Rows`.
5. Block save until the row returns a valid backend response.

### 6.6 Review sheet actions

Footer actions:

- `Back to Data Entry`
- `Recalculate Changed Rows`
- `Validate All`
- `Save All Records`
- `Save and Continue to Waybill`

`Save All Records` and `Save and Continue to Waybill` remain disabled while writes are disabled or any row is not save-ready.

---

## 7. Frontend Component Structure

Recommended structure:

```text
DataEntryFinancialV2Page.tsx
  ├─ DataEntryCompactHeader
  ├─ ParcelNavigator
  ├─ ParcelRegistrationCard
  │   ├─ RecipientSection
  │   ├─ ParcelWeightSection
  │   ├─ CollectionSection
  │   ├─ OptionalAdjustments
  │   └─ FinancialSummaryCards
  ├─ ReviewBeforeSaveButton
  └─ DataEntryReviewSheet
      ├─ ReviewToolbar
      ├─ ReviewTable
      ├─ SystemColumnToggle
      └─ ReviewFooterActions
```

Do not generate the normal form dynamically by rendering every backend schema field.

Use the backend schema for:

- Field ownership
- Required rules
- Input type
- Save payload validation
- Full review-sheet system-column metadata

Use an explicit UI allowlist for the compact normal form.

---

## 8. Main-Form Field Allowlists

### Always visible

```text
recipient_name
recipient_phone
township
delivery_address
amount_entry_type
weight_kg
```

### Conditionally visible

```text
item_price
delivery_charges
merchant_stated_total_amount
customer_tier  // only for truly unregistered merchants
additional_customer_charge
cbm_surcharge
other_surcharge
merchant_payable_charges
other_merchant_credits
remarks
```

### Never render as main-form textboxes

```text
id
way_id
pickup_id
customer_id
merchant_id
status
environment
monthly_ways
tariff_zone
tariff_zone_code
base_tariff
included_kg
extra_per_kg
commitment_min_ways
commitment_refund_per_way
chargeable_weight_kg
extra_kg
weight_surcharge
gross_system_delivery_charge
commitment_refund
net_system_delivery_charge
effective_declared_delivery_charge
delivery_difference
settlement_direction
merchant_settlement_adjustment
merchant_final_settlement_amount
validation_status
validation_message
calculation_version
calculated_at
created_at
updated_at
entered_by
authorized_by
```

---

## 9. Visual Design Rules

1. Maximum four editable controls per desktop row.
2. Maximum two controls per tablet row.
3. One control per mobile row.
4. No text smaller than 12 px for editable fields.
5. Minimum input height: 44 px.
6. Use only four section headings.
7. Use one consistent card border and background.
8. Use amber only for headings and primary action emphasis.
9. Use green only for valid/ready state.
10. Use red only for blocking errors.
11. Do not use uppercase labels for Myanmar text.
12. Do not show paragraphs beneath each field.
13. Do not show empty server values as `—` boxes on the normal page.
14. Keep the review button sticky at the bottom on mobile and desktop.
15. Keep the summary cards visible near the bottom of the active parcel form.

---

## 10. Error and Review Messaging

Use short messages only.

Examples:

- `Township is required.`
- `Enter the parcel weight.`
- `Enter the item price.`
- `Enter the merchant delivery charge.`
- `The exact collection requires an approved breakdown.`
- `This merchant is not eligible for Opaque COD.`
- `Recalculate this row before saving.`

Do not show raw backend JSON, RPC names, SQL errors, calculation versions, or technical stack messages to operators.

Detailed technical errors may be logged to the console and audit channel for authorized support users.

---

## 11. Required Backend Contracts

Preserve these existing RPCs:

```text
be_data_entry_financial_v2_schema
be_data_entry_financial_v2_snapshot
be_data_entry_financial_v2_calculate
be_data_entry_financial_v2_save
be_data_entry_financial_v2_create_waybill
```

V61.6 is primarily a frontend UX correction. Do not alter verified V61.5 financial formulas unless a new backend defect is found through a failing acceptance test.

---

## 12. Acceptance Test Matrix

### 12.1 Main screen cleanliness

- No schema metric cards.
- No environment card.
- No mutation-mode card.
- No tariff reference panel.
- No disabled server textboxes.
- No calculation version or timestamp.
- No long field instructions.
- No technical labels.
- Weight appears before summary cards.
- Only relevant amount fields appear for the selected collection type.

### 12.2 Standard 10 kg test

Input:

```text
Township: Dagon Myothit (North)
Tier: STANDARD
Collection type: Item Price + Delivery
Item price: 50,000
Merchant delivery charge: 6,000
Weight: 10 kg
CBM: 0
Other surcharge: 0
```

Expected:

```text
Included kg: 3
Extra kg: 7
Extra per kg: 500
Weight surcharge: 3,500
Receiver collection: 59,500
Britium delivery charge: 7,500
Merchant settlement: 52,000
Validation: OK
```

### 12.3 Collection type tests

Test all six types with 10 kg Standard tier.

Required outcomes:

- Item + Delivery: surcharge added to receiver collection.
- Total Including Delivery: surcharge added to stated total.
- Delivery Only: surcharge added to delivery collection.
- Exact Collection: surcharge added; settlement remains review-gated.
- Opaque COD: surcharge added; payout remains contract-gated.
- Merchant Pays Delivery: receiver does not pay delivery or weight surcharge; Britium entitlement is deducted from merchant settlement.

### 12.4 Review sheet tests

- Button opens full-screen review sheet.
- All parcels appear.
- System columns hidden by default.
- Editable cells can be amended.
- Changed rows lose old validation state.
- Recalculation updates row values.
- Save remains blocked for error/review rows.
- `Show system columns` reveals all backend fields as read-only.
- Closing the review sheet preserves edits.

### 12.5 Security tests

- No direct financial table upsert in browser code.
- No anonymous write path.
- No production write while `VITE_FINANCIAL_V2_WRITES_ENABLED=false`.
- Registered merchant tier remains backend-authoritative.
- Blocked/inactive merchant profile is not treated as unregistered.
- Waybill uses backend-stored COD amount only.

---

## 13. Source Verifier Requirements

Required markers:

```text
PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03
DATA_ENTRY_MAIN_INPUT_ALLOWLIST_V61_6
DATA_ENTRY_BACKEND_FIELDS_HIDDEN_V61_6
DATA_ENTRY_WEIGHT_BEFORE_SUMMARY_V61_6
DATA_ENTRY_DYNAMIC_AMOUNT_FIELDS_V61_6
DATA_ENTRY_REVIEW_SHEET_V61_6
DATA_ENTRY_SYSTEM_COLUMNS_HIDDEN_V61_6
DATA_ENTRY_REVIEW_INLINE_EDIT_V61_6
DATA_ENTRY_RECALCULATE_CHANGED_ROWS_V61_6
DATA_ENTRY_SIX_PAYMENT_TYPES_V61_6
DATA_ENTRY_NO_SERVER_TEXTBOXES_V61_6
DATA_ENTRY_NO_TARIFF_REFERENCE_PANEL_V61_6
DATA_ENTRY_NO_TECHNICAL_HELP_TEXT_V61_6
```

Forbidden patterns:

```text
.from('be_parcel_financial_v2').insert
.from('be_parcel_financial_v2').upsert
.from("be_parcel_financial_v2").insert
.from("be_parcel_financial_v2").upsert
VITE_FINANCIAL_V2_WRITES_ENABLED=true
```

---

## 14. Build and Deployment Gates

1. Install V61.6 frontend patch.
2. Run source verifier.
3. Run `npm run build`.
4. Run compiled-dist verifier.
5. Confirm no missing required markers.
6. Confirm no forbidden direct-write patterns.
7. Deploy with `npx vercel --prod`.
8. Confirm Vercel target `production` and status `Ready`.
9. Confirm aliases include `https://www.britiumexpress.com`.
10. Run incognito browser acceptance on `/#/data-entry`.
11. Do not enable writes until separate controlled write-readiness approval.

---

## 15. Definition of Done

V61.6 is complete when:

- The normal Data Entry page contains only essential operator inputs.
- Backend-only values are absent from the normal form.
- Weight appears before final financial summaries.
- The Standard 10 kg example calculates 7 kg extra and 3,500 MMK surcharge.
- All six collection types follow the verified V61.5 backend formulas.
- The three summary cards show receiver collection, Britium charge, and merchant settlement.
- The review-before-save button opens one editable full-picture sheet.
- System columns are hidden by default and available on demand.
- Corrections can be made directly in the review sheet.
- Changed rows must recalculate before save.
- Waybill processing remains backend-authoritative.
- Production financial writes remain disabled.

