# Britium Express Integrated Delivery, Financial Settlement, Network Fulfillment, and Production Remediation Specification

**Document status:** Consolidated developer-ready master specification  
**Specification version:** `BRITIUM_MASTER_V4.1_2026-07-31`  
**Prepared for:** Britium Express management, Finance, Operations, Branch Offices, Business Development, Marketing, HR, Security Administration, and Software Engineering  
**Target environment:** Production  
**Primary technology:** React, TypeScript, Vite, React Router, Tailwind, Supabase/PostgreSQL RPCs, RLS, and trusted server-side authentication administration  
**Currency:** Myanmar Kyat (MMK)

---

## Document Control

| Item | Value |
|---|---|
| Owner | Britium Express |
| Business owners | Finance, Operations, Branch Operations, Business Development |
| Technical owners | Product Engineering, Database Engineering, Security Administration |
| Effective status | Design and implementation specification |
| Supersedes | Separate collection, settlement, branch, outsourcing, commission, and remediation drafts in this workstream |
| Calculation policy | Backend-authoritative; historical snapshots are immutable after settlement |
| Approval requirement | Finance and Operations approval for rates; Security approval for privileged access; maker-checker for payments and sensitive changes |

## Source Basis and Governing Notes

This document consolidates the business rules, attached templates, existing React implementation, tariff master, DK Delivery rate sheet, Royal Express quotation, and all developer-ready specifications prepared in this workstream.

| Source | Key use in this specification |
|---|---|
| Current Britium tariff master | Customer tariff, customer tiers, included weight, extra-kilogram rate, Mandalay and Naypyitaw destinations |
| Management-confirmed highway station drop-off matrix | Downtown, Bayintnaung, Dagon Thiri, Aung Mingalar, and Parami station base rates with standard Britium surcharges |
| Updated parcel Data Entry workbook | Field contract, customer-facing delivery amount, backend-calculated COD, settlement columns |
| Existing Branch Office React page | Current branch operations, finance-lock behavior, COD and finance views requiring replacement |
| DK Delivery partnership rate sheet | Mandalay last-mile rate bands and size/weight surcharge note |
| Royal Express quotation Q-019-05-2026 | Normal rates, 15% partner discount, COD fees, monthly rebate tiers, remittance terms, route matrix |
| Production source archive and issue notes | Current-state remediation, route consolidation, security and production cleanup |

**Important:** Where an attached document does not define a rule clearly, this specification labels it `PENDING_BUSINESS_CONFIRMATION`. The system must not guess or activate a financial rule that is not confirmed.

## Contents

1. Executive Scope and Non-Negotiable Principles  
2. Terminology and Financial Separation  
3. Customer Collection and Delivery-Charge Methods  
4. Financial V2 Data Entry and Backend Calculation  
5. Merchant Settlement Rules  
6. Financial Settlement Screen  
7. Merchant Referral Commission  
8. Network Fulfillment and Third-Party Outsourcing  
9. Naypyitaw Branch ↔ Head Office Settlement  
10. Mandalay DK Delivery and Royal Express Settlement  
11. Confirmed Current-State Technical Findings  
12. Cross-Cutting Engineering Requirements  
13. Canonical Way/Pickup/Merchant Lineage  
14. Business Development Command Centre  
15. Live Marketing and Marketing Portal  
16. Mobile Operations  
17. Secured Admin and HR  
18. Accounts and Permissions  
19. Production Environment and UAT Removal  
20. Migration Sequence  
21. Testing Strategy  
22. Deployment Gates  
23. Rollback  
24. Required Inputs and Open Business Decisions  
25. Definition of Done  
Appendices: Collection catalogue, enums, examples, source excerpts, and implementation artefacts

---

# Part I — Business and Financial Operating Model

## 1. Executive Scope and Non-Negotiable Principles

The platform must support Britium-operated delivery, branch-operated delivery, inter-office settlement, and approved third-party outsourcing while keeping customer collection, merchant settlement, branch revenue, partner cost, COD custody, commissions, and company margin separate.

The following principles are mandatory:

1. The backend is the only financial source of truth.
2. The amount written or authorized by the merchant is the customer-facing delivery collection instruction.
3. Britium’s tariff is the company revenue basis and must not overwrite the merchant-declared amount.
4. A merchant delivery shortage is recovered from merchant settlement, not from the receiver.
5. A merchant delivery excess is credited to the merchant.
6. COD custody is separate from delivery revenue and partner payable.
7. Branch settlement, merchant settlement, employee commission, and third-party settlement are separate ledgers.
8. Every tariff, contract, calculation, assignment, and settlement must use an effective-dated snapshot.
9. A provider tracking number never replaces the Britium Way ID.
10. Settled or paid records are corrected through adjustment entries, never destructive edits.
11. Missing rates, ambiguous breakdowns, missing POD, and reconciliation differences block settlement.
12. No UI mode, browser state, spreadsheet formula, or imported calculated value can grant authority or finalize finance.

## 2. Terminology and Financial Separation

| Term | Definition |
|---|---|
| `delivery_way_id` | Canonical Britium parcel/Way identifier |
| `pickup_id` | Canonical parent pickup identifier |
| Merchant-declared delivery | Delivery amount written or instructed by merchant/seller for collection from receiver |
| Britium net system delivery charge | Britium tariff after weight/CBM/other approved surcharges and applicable Commitment refund |
| `cod_amount` | Total backend-calculated amount to collect from receiver |
| Delivery difference | Merchant-declared delivery minus Britium net system delivery charge |
| Merchant final settlement | Item value plus delivery difference and approved credits less merchant charges |
| Shareable branch revenue | Delivery revenue eligible for branch 55/45 allocation |
| Partner payable | Approved third-party service cost owed by Britium |
| COD custody | Gross customer money physically or electronically held by a branch/provider |
| Fulfillment margin | Britium recognized delivery revenue less partner/transport costs and company-owned charges/credits |
| Settlement batch | Versioned group of eligible parcel financial snapshots approved and paid together |

### 2.1 Required independent value groups

The data model must never collapse these into one field:

- Customer item price.
- Merchant-declared delivery charge.
- Customer total collection.
- Britium base tariff.
- Britium surcharges and refunds.
- Britium net delivery revenue.
- Merchant delivery difference.
- Merchant final settlement.
- Branch allocated revenue and management fee.
- Highway transport cost.
- Third-party last-mile cost.
- Third-party COD fee.
- Partner discount and rebate.
- Employee referral commission.
- COD amount held, remitted, refunded, short, or over.

## 3. Customer Collection and Delivery-Charge Methods

### 3.1 Customer tiers and tariff defaults

The current tariff rules used in this workstream are:

| Customer tier | Included weight | Commitment threshold | Per-Way refund |
|---|---:|---:|---:|
| Standard | 3 kg | Not applicable | 0 MMK |
| Royal | 5 kg | Not applicable | 0 MMK |
| Commitment | 5 kg | 1,500 monthly Ways | 500 MMK |

The default Britium extra-weight charge is 500 MMK per chargeable kilogram unless an effective tariff row specifies otherwise.

### 3.2 Chargeable-weight formula

```text
chargeable_weight_kg = CEILING(actual_weight_kg)
extra_kg = MAX(0, chargeable_weight_kg - included_kg)
weight_surcharge = extra_kg × extra_per_kg_mmk
```

Examples:

| Actual weight | Chargeable weight |
|---:|---:|
| 1.0 kg | 1 kg |
| 1.2 kg | 2 kg |
| 3.1 kg | 4 kg |
| 4.2 kg | 5 kg |

### 3.3 Highway Station Drop-Off Tariff Conditions

Add a distinct tariff product:

```text
service_type = HIGHWAY_STATION_DROP_OFF
tariff_product_code = YGN_HIGHWAY_STATION_DROP_OFF
```

The system must use a controlled station code rather than a free-text station name. The active base-rate matrix is:

| Station code | Customer-facing station name | Accepted aliases | Base rate |
|---|---|---|---:|
| `HW_DOWNTOWN` | Highway Station Drop Off (Downtown) | Downtown Highway Station, Downtown Drop Off | 4,000 MMK |
| `HW_BAYINTNAUNG` | Bayintnaung Drop Off | Bayintnaung Highway Station, Bayintnaung Bus Station | 4,000 MMK |
| `HW_DAGON_THIRI` | Hlaing Thar Yar - Dagon Thiri Highway Station Drop Off | Dagon Thiri, Dagon Ayar, Hlaing Thar Yar Highway Station | 4,000 MMK |
| `HW_AUNG_MINGALAR` | North Okkalapa - Aung Mingalar Highway Station Drop Off | Aung Mingalar, Aung Mingalar Highway, North Okkalapa Highway Station | 3,000 MMK |
| `HW_PARAMI` | Parami Highway Station Drop Off | Parami Bus Compound, Parami Highway Station | 3,000 MMK |

#### 3.3.1 Surcharge calculation

The base rate changes by station, but all surcharge and customer-tier rules remain the same as the active Britium tariff master:

```text
chargeable_weight_kg = CEILING(actual_weight_kg)
extra_kg = MAX(0, chargeable_weight_kg - included_kg)
weight_surcharge = extra_kg x extra_per_kg_mmk

gross_highway_dropoff_charge
= station_base_rate
+ weight_surcharge
+ cbm_surcharge
+ other_approved_surcharge

net_highway_dropoff_charge
= MAX(0, gross_highway_dropoff_charge - applicable_commitment_refund)
```

Unless a later effective-dated rate overrides it:

- Standard includes 3 kg.
- Royal includes 5 kg.
- Commitment includes 5 kg.
- Extra weight is 500 MMK per chargeable kilogram.
- The existing Commitment qualification and refund rule continues to apply.
- CBM and other surcharges use the same approval, ownership, and audit rules as other Britium delivery products.

#### 3.3.2 Collection and merchant settlement

The station tariff is Britium's internal system delivery charge for this service product. Customer collection still follows the selected amount-entry type and merchant-declared amount. Therefore:

```text
delivery_difference
= effective_merchant_declared_delivery_charge
- net_highway_dropoff_charge
```

A customer must not be charged an unapproved difference merely because the merchant declared less than the station tariff. Shortages are deducted from merchant settlement and excess amounts are credited to the merchant under the existing rules.

#### 3.3.3 Data Entry and routing requirements

For `HIGHWAY_STATION_DROP_OFF`, Data Entry must require:

- Highway station code.
- Parcel weight and CBM, when applicable.
- Merchant collection instruction.
- Handover date and station acceptance status.
- Manifest or handover reference when the parcel continues by highway carrier.

The backend must resolve the station base rate from an effective-dated tariff row and must reject an unknown station code with:

```text
validation_status = ERROR
exception_code = HIGHWAY_STATION_RATE_NOT_FOUND
```

The printed waybill and station manifest must show the selected station name and the backend-calculated total amount to collect.

#### 3.3.4 Financial separation

The station customer tariff is not automatically the cost paid to a bus operator, station, branch, or third party. Any highway transportation, handling, loading, unloading, or provider fee must be recorded separately as a line-haul or partner cost.

The system must preserve these independent values:

```text
customer_facing_delivery_charge
britium_station_tariff
highway_transport_cost
station_or_provider_handling_cost
merchant_settlement
company_fulfillment_margin
```

Historical Ways retain the station-rate snapshot applied at creation. Later station-rate changes must not recalculate settled Ways.

### 3.4 Supported amount-entry types

| Code | Business use | Customer collection formula |
|---|---|---|
| `ITEM_PRICE_PLUS_DECLARED_DELIVERY` | Item and delivery stated separately | Item price + declared delivery + customer-payable additions |
| `TOTAL_AMOUNT_INCLUDING_DELIVERY` | One total stated including delivery | Merchant-stated total |
| `DELIVERY_CHARGE_ONLY` | No item COD; collect delivery only | Declared delivery + customer-payable additions |
| `EXACT_COLLECTION_AMOUNT` | Exact total with no reliable breakdown | Merchant-stated total; settlement blocked until breakdown |
| `ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT` | Receiver pays item only; merchant pays delivery | Item price + customer-payable additions |

### 3.5 Existing-field meaning

- `delivery_charges` must store the **merchant-declared customer-facing delivery charge**.
- `cod_amount` must store the **backend-calculated total amount to collect from the receiver**.
- `net_system_delivery_charge` must store Britium’s internal delivery entitlement.
- These values must not overwrite one another.

### 3.6 Collection formulas

#### Item price plus declared delivery

```text
customer_total_collection
= item_price
+ merchant_declared_delivery_charge
+ additional_customer_charge
```

#### Total amount including delivery

```text
customer_total_collection = merchant_stated_total_amount

effective_declared_delivery_charge
= merchant_stated_total_amount
- item_price
- additional_customer_charge
```

The derived delivery component must not be negative.

#### Delivery charge only

```text
customer_total_collection
= merchant_declared_delivery_charge
+ additional_customer_charge
```

#### Exact collection

```text
customer_total_collection = merchant_stated_total_amount
settlement_direction = BREAKDOWN_REQUIRED
```

#### Item price only; merchant pays delivery

```text
customer_total_collection = item_price + additional_customer_charge
effective_declared_delivery_charge = 0
```

### 3.7 Waybill presentation

The most prominent waybill value must be:

```text
TOTAL TO COLLECT FROM RECEIVER: {cod_amount} MMK
```

The customer-facing waybill may show item price, declared delivery, additional customer charge, total collection, payment method, and whether delivery is included. It must not show internal tariff difference, merchant deduction/credit, branch share, partner cost, company margin, Commitment refund, or employee commission.

## 4. Financial V2 Data Entry and Backend Calculation

### 4.1 Target design

Rebuild the production Data Entry screen around the authoritative Financial V2 contract. The frontend must not maintain a separate legacy field definition.

Recommended page sections:

1. Parcel Identity
2. Recipient & Address
3. Collection Instructions
4. Weight & Tariff
5. Merchant Settlement
6. Validation
7. Photo Evidence
8. Audit Information

### 4.2 Field ownership

#### Editable operational inputs

- Customer and merchant identity selection.
- Status and environment, when permitted.
- Recipient name and phone.
- Township and complete delivery address.
- Service type and highway station code when `HIGHWAY_STATION_DROP_OFF` is selected.
- Item price.
- Merchant-declared delivery charge.
- Weight.
- Amount-entry type.
- Merchant-stated total amount.
- Additional customer charge.
- CBM surcharge.
- Other approved surcharge.
- Merchant-payable charges.
- Other merchant credits.
- Remarks.

#### Server-controlled values

- Way ID.
- Pickup ID.
- Customer tier.
- Monthly ways.
- COD/customer collection amount.
- Tariff zone and zone code.
- Tariff product code, highway station code/name, and station-rate snapshot when applicable.
- Base tariff and included kilograms.
- Extra weight and weight surcharge.
- Gross and net system delivery charge.
- Commitment refund.
- Effective declared delivery charge.
- Delivery difference.
- Settlement direction.
- Merchant settlement adjustment.
- Final merchant settlement amount.
- Validation status and message.
- Calculation version and timestamp.
- Entered by and authorized by.

### 4.3 Canonical financial fields

Use explicit fields rather than overloading legacy names:

```text
service_type
highway_station_code
highway_station_name
tariff_product_code
item_price
merchant_declared_delivery_charge
customer_total_collect_amount
amount_entry_type
merchant_stated_total_amount
additional_customer_charge
cbm_surcharge
other_surcharge
merchant_payable_charges
other_merchant_credits
base_tariff
included_kg
extra_per_kg
chargeable_weight_kg
extra_kg
weight_surcharge
gross_system_delivery_charge
commitment_refund
net_system_delivery_charge
effective_declared_delivery_charge
delivery_difference
settlement_direction
merchant_final_settlement_amount
validation_status
validation_message
calculation_version
calculated_at
```

Maintain compatibility views for legacy columns such as `delivery_fee_os`, `deli_fee_os`, `final_cod`, `finance_deli`, and `finance_cod` until all downstream modules are migrated.

### 4.4 Amount-entry types

```text
ITEM_PRICE_PLUS_DECLARED_DELIVERY
TOTAL_AMOUNT_INCLUDING_DELIVERY
DELIVERY_CHARGE_ONLY
EXACT_COLLECTION_AMOUNT
ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT
```

### 4.5 Backend calculation rules

```text
chargeable_weight = ceil(max(actual_weight, 0))
extra_kg = max(0, chargeable_weight - included_kg)
weight_surcharge = extra_kg * extra_per_kg
gross_system_delivery_charge = base_tariff + weight_surcharge + cbm_surcharge + other_surcharge
net_system_delivery_charge = max(0, gross_system_delivery_charge - commitment_refund)
delivery_difference = effective_declared_delivery_charge - net_system_delivery_charge
merchant_final_settlement_amount = item_price + delivery_difference + other_merchant_credits - merchant_payable_charges
```

Customer collection must follow the selected amount-entry type. A merchant-declared delivery shortage must never be added to the receiver’s collection. It is recovered from merchant settlement.

### 4.6 Required RPCs

#### `be_data_entry_financial_v2_schema()`

Returns the authoritative field list, section, label, data type, editability, required rule, dropdown source, and ordinal position. The UI and spreadsheet import must use this metadata.

#### `be_data_entry_financial_v2_snapshot(p_pickup_id text)`

Returns pickup identity, parcel rows, proof evidence, tariff options, amount-entry options, and permissions.

#### `be_data_entry_financial_v2_calculate(p_payload jsonb)`

Accepts raw operational inputs only and returns all server calculations and validation messages.

#### `be_data_entry_financial_v2_save(p_payload jsonb, p_request_id text)`

Must:

1. Lock or resolve the pickup context.
2. Generate or preserve canonical Way ID server-side.
3. Resolve merchant and customer tier.
4. Load the active tariff.
5. Calculate financial values.
6. Store a tariff/calculation snapshot.
7. Save proof/audit references.
8. Return the stored row.

#### `be_data_entry_financial_v2_import(p_batch jsonb)`

Must ignore all imported calculated values and recalculate them. Imported calculated columns may be compared for warnings only.

#### `be_data_entry_financial_v2_create_waybill(p_pickup_id text, p_way_ids text[], p_request_id text)`

Must print the backend-stored customer collection amount and must not expose internal merchant settlement differences.

### 4.7 Frontend changes

- Replace editable Way ID with a read-only server value.
- Replace legacy 15-column labels with the Financial V2 sectioned form and full-width sheet view.
- Make merchant-declared delivery editable where the selected amount type requires it.
- Display company tariff and settlement fields as read-only.
- Remove local hardcoded tariff authority.
- Remove direct table upsert fallbacks for financial records.
- Show server validation inline and block waybill creation for `ERROR` or unresolved `BREAKDOWN_REQUIRED` records.
- Preserve photo review and unavailable-image acknowledgement with audit metadata.

### 4.8 Schema-version discrepancy

The issue note references a 50-column workbook, while the currently available updated workbook contains 47 headers. Before migration, set one authoritative version identifier, for example:

```text
FINANCIAL_V2_SCHEMA_2026_07_31
```

The backend schema RPC and downloadable workbook must return the same version and field count. Deployment must fail validation when they differ.

### 4.9 Acceptance criteria

- Backend and workbook schema versions match.
- The browser cannot override calculated fields.
- Saving the same request twice does not duplicate a parcel.
- Way ID and Pickup ID merchant lineage is valid before save.
- Imported calculated values are ignored and recalculated.
- Exact collection without a breakdown is deliverable only according to policy but not settlement-eligible.
- Historical tariff values remain stable after tariff-master changes.

## 5. Merchant Settlement Rules

### 5.1 Delivery difference

```text
delivery_difference
= effective_declared_delivery_charge
- net_system_delivery_charge
```

| Result | Direction | Treatment |
|---:|---|---|
| Positive | `CREDIT_TO_MERCHANT` | Excess delivery collection is payable to merchant |
| Negative | `DEDUCT_FROM_MERCHANT` | Delivery shortfall is deducted from merchant settlement |
| Zero | `NO_ADJUSTMENT` | No delivery settlement adjustment |
| Unknown breakdown | `BREAKDOWN_REQUIRED` | Settlement is blocked |

### 5.2 Merchant final settlement

```text
merchant_final_settlement_amount
= item_price
+ delivery_difference
+ other_merchant_credits
- merchant_payable_charges
```

A negative merchant settlement must remain negative and become a merchant receivable or carry-forward balance. It must not be silently changed to zero.

### 5.3 Examples

| Scenario | Item | Declared delivery | Britium charge | Customer collects | Merchant settlement |
|---|---:|---:|---:|---:|---:|
| Merchant charged more | 25,000 | 6,000 | 4,500 | 31,000 | 26,500 |
| Merchant charged less | 25,000 | 3,000 | 4,500 | 28,000 | 23,500 |
| Equal delivery | 25,000 | 4,500 | 4,500 | 29,500 | 25,000 |
| Merchant pays delivery | 25,000 | 0 | 4,500 | 25,000 | 20,500 |

### 5.4 Reconciliation

For the normal merchant-owned item and delivery-difference model:

```text
customer_total_collection
= merchant_final_settlement_amount
+ Britium_net_system_delivery_charge
+ company_owned_additional_customer_charges
- merchant_credits_not_collected_from_customer
+ merchant_charges_not_collected_from_customer
```

The backend must produce an explicit reconciliation result and block settlement for any unexplained difference.

## 6. Financial Settlement Screen

### 6.1 User groups

The screen supports:

- Internal Finance Team.
- Merchant/Online Seller portal users.

Both use the same stored parcel financial snapshots. Merchants can access only their own records and cannot see partner costs, internal notes, branch cash positions, company margin, risk flags, or other merchants.

### 6.2 Finance navigation

- Overview.
- Pending Settlement.
- Settlement Batches.
- Payments.
- Exceptions.
- Disputes.
- Partner Settlements.
- Branch Reconciliation.
- COD Custody.
- Audit Log.

Merchant navigation:

- Settlement Summary.
- Statements.
- Payments.
- Parcel Details.
- Disputes.

### 6.3 Finance KPI cards

| KPI | Calculation |
|---|---|
| Customer Collection | Sum of `cod_amount` |
| Company Delivery Revenue | Sum of `net_system_delivery_charge` |
| Merchant Payable | Sum of eligible `merchant_final_settlement_amount` |
| Delivery Excess Credit | Sum of positive delivery differences |
| Delivery Shortfall | Absolute sum of negative delivery differences |
| Requires Review | Count of review/error/breakdown-required parcels |
| Approved but Unpaid | Approved batch net payable with unpaid status |
| Paid Settlements | Paid batch totals |
| Partner Payable | Approved third-party settlement payable |
| Branch COD Outstanding | Confirmed branch custody less remitted/approved adjustments |

### 6.4 Pending-settlement parcel table

Required columns:

- Select.
- Waybill/Way ID.
- Delivered date.
- Merchant and merchant code.
- Receiver and destination.
- Customer tier and amount-entry type.
- Item price.
- Merchant-declared delivery.
- Customer total collection.
- Britium net delivery charge.
- Delivery difference.
- Settlement direction.
- Other merchant credits/charges.
- Final merchant settlement.
- Fulfillment mode, branch, and provider.
- Validation and eligibility.
- Actions.

A parcel is eligible only when delivered, validation is `OK`, lineage is valid, no breakdown is required, no financial hold exists, and it is not already batched or settled.

### 6.5 Batch workflow

Statuses:

```text
DRAFT
UNDER_REVIEW
PENDING_APPROVAL
APPROVED
PAYMENT_PROCESSING
PARTIALLY_PAID
PAID
REJECTED
CANCELLED
REOPENED
```

Normal workflow:

```text
DRAFT → UNDER_REVIEW → PENDING_APPROVAL → APPROVED → PAYMENT_PROCESSING → PAID
```

The creator cannot approve their own batch when maker-checker is enabled. Paid batches are corrected through adjustment batches.

### 6.6 Batch calculation

```text
parcel_settlement_total
= SUM(merchant_final_settlement_amount)

batch_net_payable
= parcel_settlement_total
+ batch_level_credits
- batch_level_deductions
- advance_recovery
- withholding_tax
```

A negative batch creates a merchant receivable/carry-forward balance.

### 6.7 Exact-collection resolution

An authorized employee must enter confirmed item price, confirmed delivery charge, confirmed additional customer charge, reason, and evidence. The following must reconcile:

```text
confirmed_item_price
+ confirmed_delivery_charge
+ confirmed_additional_customer_charge
= exact_collection_amount
```

After approval, the backend recalculates and releases settlement eligibility.

### 6.8 Payment controls

Support scheduled, processing, partial, paid, failed, and reversed payments. Each payment transaction is immutable and separate. Outstanding amount is:

```text
outstanding_amount = batch_net_payable - total_confirmed_paid_amount
```

### 6.9 Merchant statements

Statements must show batch reference, period, parcel count, item value, delivery collected, Britium delivery charge, excess credit, shortfall deduction, other credits/deductions, tax, final settlement, amount paid, outstanding amount, and parcel-level breakdown.

### 6.10 Disputes and adjustments

Supported dispute categories include missing parcel, incorrect item price, incorrect delivery amount, incorrect tariff/weight surcharge, missing excess credit, incorrect shortfall deduction, missing payment, and other settlement issues.

Paid records must use adjustment types such as delivery-excess correction, delivery-shortfall correction, item-price correction, surcharge correction, other credit/deduction, and payment reversal.

### 6.11 Recommended APIs

```text
GET  /api/finance/settlements/dashboard
GET  /api/finance/settlements/pending-parcels
POST /api/finance/settlement-batches
POST /api/finance/settlement-batches/{batchId}/submit
POST /api/finance/settlement-batches/{batchId}/approve
POST /api/finance/settlement-batches/{batchId}/reject
POST /api/finance/settlement-batches/{batchId}/payments
POST /api/finance/parcels/{parcelId}/resolve-breakdown
GET  /api/merchant/settlements
GET  /api/merchant/settlements/{batchId}/statement
POST /api/merchant/settlement-disputes
```

## 7. Merchant Referral Commission

### Business rule

- Operation type: `MERCHANT_REFERRAL`
- Commission role: `MERCHANT_REFERRER`
- Unit type: `WAY`
- Rate: `100 MMK` per eligible way
- Earning event: one successfully completed delivery way
- Failed, cancelled, pending, or incomplete delivery ways do not earn the commission.
- The employee must have an employment eligibility period covering the delivery completion date.
- The merchant-to-referrer assignment must cover the delivery completion date.
- The merchant naturally stops generating commission when it stops generating completed delivery ways.
- The commission is a company workforce expense and is not deducted from the merchant settlement.

### Eligibility formula

```text
Eligible Referral Commission
= Completed Delivery Ways
  x 100 MMK
```

A way is eligible only when all conditions are true:

```text
Delivery status is DELIVERED, DROP_OFF, or COMPLETED
AND delivery completion date is the commission work date
AND merchant has an effective referral assignment
AND referrer has an employment period covering that date
AND no commission event already exists for the same way and referrer
```

### Required records

#### Employee eligibility period

The HR/workforce integration must maintain:

- employee ID
- employee email
- employee name
- employed-from date
- employed-to date
- eligibility status

For an active employee, `employed_to` remains null. On resignation or termination, set it to the final eligible work date. Rehired employees should receive a new employment-period row.

#### Merchant referral assignment

Finance or an authorized administrator must register:

- merchant ID
- merchant code
- merchant name
- referrer employee ID
- referrer email
- referrer name
- effective-from date
- optional effective-to date

Only one referral assignment may cover a merchant on any particular date.

### Settlement handling

The referral commission is included in the employee/workforce commission batch:

```text
Employee Commission Payable
= Pickup Commission
+ Delivery Commission
+ Highway Drop-off Commission
+ Merchant Referral Commission
```

It must not change:

- customer COD collection
- merchant-declared delivery charge
- company delivery tariff
- delivery difference
- merchant final settlement amount

### Screen changes

The Workforce Commission screen now includes:

- Referral Commission KPI
- Referral Ways KPI
- Eligible Referrers KPI
- Merchant Referral commission filter
- Merchant names in the earnings ledger
- CSV export
- Duplicate-row protection when API responses overlap

### Recommended backend API additions

```text
GET  /api/finance/merchant-referrals
POST /api/finance/merchant-referrals
POST /api/finance/merchant-referrals/{assignmentId}/end
GET  /api/finance/commissions/merchant-referral-details
```

The existing commission settlement snapshot can continue returning all operation types, including `MERCHANT_REFERRAL`.

### Acceptance tests

#### Active employee and active merchant assignment

- Merchant completed ways: 25
- Rate: 100 MMK
- Expected referral commission: 2,500 MMK

#### Employee left during the month

- Employment final eligible date: July 15
- Merchant ways completed July 1-15: 12
- Merchant ways completed July 16-31: 18
- Expected eligible ways: 12
- Expected commission: 1,200 MMK

#### Merchant stopped using the service

- Merchant has no completed delivery ways after July 10
- Expected commission after July 10: 0 MMK

#### No referral assignment

- Merchant completed 50 delivery ways
- No effective assignment exists
- Expected referral commission: 0 MMK

#### Cancelled or failed delivery

- Created ways: 20
- Successfully completed ways: 14
- Expected eligible ways: 14
- Expected commission: 1,400 MMK

#### Duplicate rebuild

- Run commission rebuild twice for the same date
- Expected: one referral event per way and referrer, with no duplicate commission

#### Historical rebuild after employee departure

- Delivery date falls inside the employee employment period
- Rebuild occurs after the employee has left
- Expected: the historical commission remains eligible because eligibility is checked against the delivery date, not the current date

## 8. Network Fulfillment, Third-Party Outsourcing, Branch Monitoring, and Settlement

### 8.1 Scope and operating model

Britium must support parcels that are fulfilled through one of four execution models:

```text
BRITIUM_DIRECT
BRANCH_DIRECT
THIRD_PARTY_OUTSOURCED
BRANCH_THIRD_PARTY
```

Current operating relationships supplied for configuration are:

- `ROYAL_EXPRESS` — Royal Express.
- `DK_DELIVERY` — DK Delivery.
- `ARLU_POST` — Arlu Post.
- `NINJA_VAN` — Ninja Van.
- `SAFE_DELIVERY` — Safe Delivery Services.
- `BRITIUM_NPT_BRANCH` — Britium Nay Pyi Taw branch.
- `BRITIUM_MDY_BRANCH` — Britium Mandalay branch or managing office, even when physical delivery is executed by DK Delivery.

Current routing policy supplied by the business is:

- Mandalay parcels are normally executed by DK Delivery.
- Nay Pyi Taw parcels are managed by the Nay Pyi Taw branch.
- Destinations outside Britium's direct reach are mostly assigned to Royal Express.
- Arlu Post, Ninja Van, and Safe Delivery Services may be selected as alternatives.

These relationships must be effective-dated configuration, not hardcoded React or SQL conditions. Finance and Operations must be able to change the preferred provider, fallback priority, active dates, service level, and settlement owner without a code deployment.

### 8.2 Mandatory financial separation

The system must maintain five separate concepts:

1. **Customer-facing delivery amount** — the amount authorized by the merchant and collected from the receiver.
2. **Britium system delivery charge** — Britium's tariff-based delivery revenue used in merchant settlement.
3. **Merchant settlement** — item value plus merchant delivery credit or deduction under the Financial V2 rules.
4. **Execution provider cost** — the amount payable to an outsourced provider or allocated to a branch.
5. **COD custody position** — cash or cashless funds collected by a branch or partner and still due to Britium.

A third-party cost must never replace `net_system_delivery_charge` and must never alter the merchant delivery difference calculation.

```text
merchant_delivery_difference
  = effective_declared_delivery_charge
  - net_system_delivery_charge
```

The outsourced provider cost is a company expense calculated separately:

```text
outsourced_delivery_margin
  = net_system_delivery_charge
  + company_owned_additional_charges
  - approved_partner_service_payable
  - other_outsourced_fulfillment_costs
```

A negative outsourced margin is valid and must be reported. It must not be silently transferred to the receiver or merchant unless a separately approved commercial rule explicitly authorizes that charge.

### 8.3 Coverage master and routing ownership

The attached township/tariff list must seed a coverage master, but the existence of a tariff row must not automatically mean that Britium's own riders directly serve that location.

Create:

```sql
create table public.be_service_coverage_master (
  coverage_id uuid primary key default gen_random_uuid(),
  township_code text,
  township_name text not null,
  zone_code text not null,
  customer_tariff_available boolean not null default false,
  britium_direct_reachable boolean not null default false,
  managing_branch_code text,
  default_fulfillment_mode text not null,
  default_provider_id uuid,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Allowed `default_fulfillment_mode` values:

```text
BRITIUM_DIRECT
BRANCH_DIRECT
THIRD_PARTY_OUTSOURCED
BRANCH_THIRD_PARTY
MANUAL_ROUTING_REQUIRED
```

Create partner-specific coverage:

```sql
create table public.be_provider_coverage_rules (
  rule_id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  township_code text,
  township_name text not null,
  service_code text not null,
  priority integer not null,
  cutoff_time time,
  expected_delivery_days integer,
  max_weight_kg numeric,
  max_cbm numeric,
  cod_supported boolean not null default true,
  return_supported boolean not null default true,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE'
);
```

Routing must evaluate:

1. Destination and serviceability.
2. Britium direct capacity.
3. Managing branch.
4. Preferred provider.
5. Provider weight, CBM, COD, and service constraints.
6. Contract status.
7. Cutoff time.
8. Historical SLA and suspension status.
9. Fallback priority.
10. Manual exception when no valid provider is available.

The route engine must return the selected route and the reasons for selection. It must not silently fall back to an unrelated provider.

### 8.4 Fulfillment provider master

Create one provider master for branches and external delivery companies:

```sql
create table public.be_fulfillment_providers (
  provider_id uuid primary key default gen_random_uuid(),
  provider_code text not null unique,
  provider_name text not null,
  provider_type text not null,
  managing_branch_code text,
  settlement_method text not null,
  cod_remittance_method text not null,
  integration_method text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  bank_account_reference text,
  contract_start_date date,
  contract_end_date date,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Allowed `provider_type` values:

```text
INTERNAL_FLEET
BRANCH
THIRD_PARTY
```

Allowed `integration_method` values:

```text
API_WEBHOOK
API_POLLING
CSV_UPLOAD
PARTNER_PORTAL
MANUAL_WITH_EVIDENCE
```

Allowed `cod_remittance_method` values:

```text
GROSS_REMITTANCE
NETTED_WITH_SERVICE_FEES
NO_COD_COLLECTION
BRANCH_CASH_HANDOVER
```

### 8.5 Parcel fulfillment fields

Add the following fields to the canonical parcel/Way transaction:

```sql
fulfillment_mode text;
managing_branch_code text;
executing_provider_id uuid;
executing_provider_code text;
provider_service_code text;
provider_tracking_id text;
provider_reference_2 text;
outsource_assignment_id uuid;
handover_manifest_id uuid;
handover_status text;
handover_at timestamptz;
provider_accepted_at timestamptz;
expected_delivery_at timestamptz;
provider_delivered_at timestamptz;
provider_last_event_at timestamptz;
provider_last_status text;
pod_status text;
cod_custodian_type text;
cod_custodian_id text;
partner_tariff_snapshot jsonb;
partner_cost_calculation_version text;
partner_service_payable_mmk bigint;
partner_cod_collected_mmk bigint;
partner_cod_remitted_mmk bigint;
partner_settlement_status text;
branch_reconciliation_status text;
```

`delivery_way_id`, `pickup_id`, `merchant_code`, and Britium customer financial fields remain canonical Britium values. A partner tracking number is an external reference and must never replace the Britium Way ID.

### 8.6 Assignment and chain of custody

A parcel assigned outside Britium's direct fleet must have a recorded chain of custody.

Required operational lifecycle:

```text
ROUTING_REQUIRED
ROUTE_SELECTED
ASSIGNED_TO_BRANCH
ASSIGNED_TO_PROVIDER
HANDOVER_PENDING
MANIFESTED
HANDED_OVER
PROVIDER_ACCEPTED
IN_TRANSIT
AT_DESTINATION_HUB
OUT_FOR_DELIVERY
DELIVERED
DELIVERY_FAILED
RETURN_REQUESTED
RETURN_IN_TRANSIT
RETURNED_TO_BRITIUM
LOST
DAMAGED
CANCELLED
```

Financial status must be separate:

```text
NOT_READY
COD_PENDING
COD_RECEIVED_BY_PROVIDER
COD_PARTIALLY_REMITTED
COD_REMITTED
PARTNER_INVOICE_PENDING
PARTNER_SETTLEMENT_DRAFT
PARTNER_SETTLEMENT_APPROVED
PARTNER_SETTLED
DISPUTED
```

Each handover manifest must include:

- Manifest number.
- Origin branch or hub.
- Destination branch/provider.
- Provider vehicle or counter reference where applicable.
- Handover employee.
- Receiving person.
- Parcel count.
- Total COD expected.
- Total declared value.
- Total weight and CBM.
- Seal or bag reference.
- Handover timestamp.
- Receiver acceptance timestamp.
- Missing, extra, damaged, or rejected parcels.
- Supporting photographs or signed document.

The receiving branch or partner must acknowledge each parcel. A manifest-level acceptance must not silently mark missing parcel lines as accepted.

### 8.7 Tracking integration and event normalization

Create a normalized provider event table:

```sql
create table public.be_fulfillment_tracking_events (
  event_id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  provider_id uuid not null,
  provider_tracking_id text,
  provider_event_id text,
  raw_status_code text,
  normalized_status text not null,
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  location_text text,
  latitude numeric,
  longitude numeric,
  description text,
  proof_reference text,
  raw_payload jsonb,
  source_method text not null,
  idempotency_key text not null unique
);
```

Create status mappings per provider:

```sql
create table public.be_provider_status_mapping (
  provider_id uuid not null,
  raw_status_code text not null,
  normalized_status text not null,
  is_terminal boolean not null default false,
  requires_pod boolean not null default false,
  primary key (provider_id, raw_status_code)
);
```

Requirements:

- API/webhook events must be idempotent.
- Events may arrive out of order; the system must preserve all events and calculate the current status using event time plus terminal-state rules.
- Manual updates require a reason and supporting evidence.
- A provider event must never modify merchant, Way, Pickup, item price, or COD instruction fields.
- Delivered status requires either accepted provider POD or an authorized exception.

### 8.8 Network Fulfillment and Outsource Control Screen

Create an internal screen:

```text
Network Fulfillment & Outsource Control
```

Recommended route:

```text
/network-fulfillment
```

Required tabs:

```text
Overview
Routing Queue
Branch Handovers
Partner Handovers
In Transit
Delivery Exceptions
Returns
COD Handover
Partner Settlements
Branch Reconciliation
SLA Performance
Coverage & Contracts
Audit Log
```

Required KPI cards:

- Britium-direct ways.
- Branch-direct ways.
- Outsourced ways.
- Branch-third-party ways.
- Ways by Royal Express.
- Ways by DK Delivery.
- Ways by Arlu Post.
- Ways by Ninja Van.
- Ways by Safe Delivery Services.
- Unaccepted handovers.
- No tracking update beyond configured hours.
- SLA overdue.
- Failed deliveries.
- Returns in transit.
- Missing POD.
- COD held by partners.
- COD held by branches.
- Partner service payable.
- Outstanding partner remittance.
- Branch cash outstanding.
- Outsourced gross margin.
- Open disputes.

Required table columns:

```text
Way ID
Pickup ID
Merchant
Destination
Managing Branch
Execution Mode
Provider
Partner Tracking ID
Handover Status
Last Tracking Status
Last Update
Expected Delivery
POD Status
COD Amount
COD Custodian
COD Remitted
Partner Cost
Financial Status
Exception
Actions
```

### 8.9 SLA and exception monitoring

Create automated exception codes:

```text
NO_PROVIDER_AVAILABLE
PROVIDER_ASSIGNMENT_REJECTED
HANDOVER_NOT_ACCEPTED
MANIFEST_PARCEL_MISMATCH
NO_TRACKING_UPDATE
SLA_AT_RISK
SLA_BREACHED
DELIVERY_FAILED
MAX_ATTEMPTS_REACHED
POD_MISSING
POD_REJECTED
COD_NOT_REMITTED
COD_REMITTANCE_SHORT
COD_REMITTANCE_OVER
PARTNER_RATE_NOT_FOUND
PARTNER_INVOICE_MISMATCH
PARTNER_DUPLICATE_CHARGE
RETURN_OVERDUE
PARCEL_LOST
PARCEL_DAMAGED
BRANCH_CASH_NOT_HANDED_OVER
BRANCH_RECONCILIATION_MISMATCH
```

Each exception must have:

- Owner.
- Responsible provider or branch.
- Opened time.
- Severity.
- SLA deadline.
- Evidence.
- Resolution action.
- Resolution approval.
- Financial impact.
- Audit history.

### 8.10 Proof of delivery

The system must store provider POD separately from Britium internal proof.

Supported POD components:

- Receiver name.
- Receiver phone confirmation where permitted.
- Signature.
- Parcel photograph.
- Delivery-location photograph.
- GPS coordinates.
- Delivery timestamp.
- Partner POD document.
- Provider delivery agent reference.
- Exception reason when signature or photo is unavailable.

POD approval statuses:

```text
PENDING
RECEIVED
VALIDATED
REJECTED
WAIVED_WITH_AUTHORIZATION
```

Only validated or authorized POD may make a parcel financially settlement-eligible.

### 8.11 COD custody and remittance

The provider or branch must receive only the backend-calculated `cod_amount` as the receiver collection instruction.

Required COD custody values:

```text
BRITIUM_RIDER
BRITIUM_BRANCH
THIRD_PARTY_PROVIDER
NO_COD
```

Store every handover:

```sql
create table public.be_cod_custody_events (
  custody_event_id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  event_type text not null,
  from_custodian_type text,
  from_custodian_id text,
  to_custodian_type text,
  to_custodian_id text,
  amount_mmk bigint not null,
  payment_method text not null,
  reference_no text,
  evidence_reference text,
  event_at timestamptz not null,
  recorded_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now()
);
```

COD event types:

```text
CUSTOMER_COLLECTED
BRANCH_RECEIVED
PARTNER_RECEIVED
BANK_DEPOSITED
REMITTED_TO_BRITIUM
REFUNDED_TO_CUSTOMER
SHORTAGE_RECORDED
OVERAGE_RECORDED
ADJUSTMENT_APPROVED
```

The system must reconcile:

```text
expected_cod
= backend cod_amount for delivered COD parcels
```

```text
cod_outstanding_with_provider
= provider_collected
- provider_remitted
- approved_customer_refunds
- approved_cod_adjustments
```

A service-fee netting arrangement must not hide COD custody. Gross COD collected and service payable must always be stored separately, even when only the net amount is transferred.

### 8.12 Partner tariff and contract master

Partner pricing must be separate from Britium's customer tariff master.

Create an effective-dated partner tariff master supporting:

- Provider.
- Origin.
- Destination.
- Service type.
- Base fee.
- Included weight.
- Extra charge per kilogram.
- CBM charge.
- Remote-area surcharge.
- COD collection fee.
- Percentage COD fee where contractually applicable.
- Redelivery charge.
- Return charge.
- Handover or pickup charge.
- Insurance charge.
- Fuel surcharge.
- Tax.
- Volume discount.
- SLA service credit or penalty.
- Minimum monthly commitment.
- Currency.
- Effective dates.
- Approval status.

Every outsourced Way must store a partner tariff snapshot. Historical settlement must not be recalculated from the latest partner tariff.

### 8.13 Partner service payable calculation

Calculate the provider cost independently for each Way:

```text
partner_gross_service_charge
  = partner_base_fee
  + partner_weight_surcharge
  + partner_cbm_surcharge
  + partner_remote_surcharge
  + partner_cod_fee
  + partner_redelivery_charge
  + partner_return_charge
  + partner_other_approved_charge
```

```text
partner_service_payable
  = partner_gross_service_charge
  - partner_discount
  - partner_sla_credit
  - partner_penalty
```

The payable must be zero or positive unless a contract supports a net credit. Any negative result requires Finance review.

Charges not supported by the tariff snapshot or approved evidence must be rejected or placed in dispute.

### 8.14 Third-party settlement methods

Support two settlement methods.

#### Gross remittance

The partner remits all customer collections to Britium. Britium pays the approved provider invoice separately.

```text
cash_due_from_partner
  = partner_cod_collected
  - customer_refunds
  - prior_cod_remittances
  - approved_cod_adjustments
```

```text
cash_payable_to_partner
  = approved_partner_service_payable
  - prior_service_payments
```

#### Netted settlement

The partner remits customer collections net of approved service charges.

For control purposes, record both gross amounts:

```text
partner_net_position
  = partner_cod_collected
  - approved_partner_service_payable
  - customer_refunds
  - prior_net_remittances
  - approved_adjustments
```

Interpretation:

- Positive: partner still owes Britium.
- Zero: fully reconciled.
- Negative: Britium owes the partner, subject to approval.

A settlement batch must not mix providers, currencies, or incompatible settlement methods.

### 8.15 Partner settlement workflow

Required statuses:

```text
DRAFT
PARTNER_STATEMENT_RECEIVED
UNDER_REVIEW
DISPUTED
PENDING_APPROVAL
APPROVED
REMITTANCE_PENDING
PAYMENT_PENDING
PARTIALLY_SETTLED
SETTLED
REJECTED
REOPENED
```

Required batch totals:

- Delivered eligible ways.
- Returned ways.
- Lost/damaged ways.
- Customer COD collected.
- Customer refunds.
- Partner base fees.
- Weight/CBM/remote surcharges.
- COD fees.
- Redelivery and return fees.
- Discounts.
- SLA credits and penalties.
- Approved partner service payable.
- COD remitted.
- Net amount due from provider.
- Net amount due to provider.
- Disputed amount.
- Outstanding amount.

Required controls:

- Maker-checker approval.
- Provider invoice attachment.
- Manifest reconciliation.
- Way-level POD validation.
- Duplicate charge detection.
- Rate-snapshot comparison.
- COD remittance evidence.
- Payment/remittance reference.
- Reopening through adjustment entries only.

### 8.16 Branch reconciliation

Branches are internal operational units, not merchants. Branch reconciliation must be separate from merchant settlement and external partner settlement.

Create branch reconciliation batches with:

- Branch code.
- Period.
- Ways received.
- Ways directly delivered.
- Ways outsourced locally.
- COD collected by branch.
- COD received from local partners.
- COD deposited or transferred to headquarters.
- Approved customer refunds.
- Approved branch cash expenses.
- Partner fees paid by branch.
- Partner fees payable by headquarters.
- Internal cost allocation.
- Cash shortage or overage.
- Outstanding branch balance.

Core calculation:

```text
branch_cash_accountability
  = branch_customer_collections
  + partner_cod_received_by_branch
  - approved_customer_refunds
  - approved_cash_adjustments
```

```text
branch_cash_outstanding_to_head_office
  = branch_cash_accountability
  - bank_deposits
  - transfers_to_head_office
  - approved_branch_cash_expenses
```

Do not deduct branch operating costs from merchant settlement unless the merchant contract independently authorizes such a charge.

When a branch assigns a parcel to a third party, store both:

```text
managing_branch = branch code
executing_provider = external provider
fulfillment_mode = BRANCH_THIRD_PARTY
```

The partner settlement owner must be configurable as either headquarters or branch. A Way must never be paid twice by both offices.

### 8.17 Accounting and reconciliation entries

Recommended ledger transaction types:

```text
CUSTOMER_COLLECTION_RECEIVABLE
CUSTOMER_COLLECTION_RECEIVED
MERCHANT_PAYABLE
BRITIUM_DELIVERY_REVENUE
OUTSOURCED_DELIVERY_EXPENSE
PARTNER_PAYABLE
PARTNER_COD_RECEIVABLE
PARTNER_COD_REMITTANCE
BRANCH_CASH_RECEIVABLE
BRANCH_CASH_TRANSFER
BRANCH_EXPENSE
SLA_CREDIT
LOSS_OR_DAMAGE_CLAIM
SETTLEMENT_ADJUSTMENT
```

Example:

```text
Customer collection                 31,000 MMK
Merchant settlement                 26,500 MMK
Britium delivery revenue             4,500 MMK
Approved partner delivery cost       5,000 MMK
```

Customer/merchant reconciliation remains:

```text
31,000 = 26,500 + 4,500
```

Britium fulfillment margin is:

```text
4,500 - 5,000 = (500) MMK
```

The negative 500 MMK is a company margin result. It must not alter the receiver collection or merchant settlement after the parcel was accepted under the approved tariff and instruction.

### 8.18 Required backend services and RPCs

Recommended versioned interfaces:

```text
be_network_fulfillment_snapshot_v55
be_network_fulfillment_route_quote_v55
be_network_fulfillment_assign_v55
be_network_fulfillment_reassign_v55
be_network_manifest_create_v55
be_network_manifest_accept_v55
be_network_tracking_event_ingest_v55
be_network_tracking_sync_v55
be_network_pod_submit_v55
be_network_pod_review_v55
be_network_exception_resolve_v55
be_network_cod_handover_v55
be_partner_tariff_quote_v55
be_partner_settlement_create_v55
be_partner_settlement_submit_v55
be_partner_settlement_approve_v55
be_partner_settlement_record_remittance_v55
be_partner_settlement_record_payment_v55
be_branch_reconciliation_create_v55
be_branch_reconciliation_submit_v55
be_branch_reconciliation_approve_v55
be_branch_reconciliation_record_transfer_v55
```

Each response must include:

- Build/version.
- Actor.
- Provider/branch.
- Effective tariff version.
- Calculated values.
- Validation errors.
- Warnings.
- Idempotency result.
- Audit event ID.

### 8.19 Required changes to existing screens

#### Data Entry

After destination selection, display a backend routing preview:

- Britium reachability.
- Managing branch.
- Proposed execution mode.
- Proposed provider.
- Expected delivery date.
- Whether partner COD is supported.

The Data Entry employee must not manually type partner tariffs.

#### Waybill

Print:

- Britium Way ID.
- Receiver collection amount.
- Destination.
- Service instruction.
- Partner barcode/reference only when assigned.

Do not print internal partner cost, merchant settlement, or margin.

#### Final Synchronization

Add:

- Fulfillment mode.
- Managing branch.
- Executing provider.
- Provider tracking ID.
- Partner delivered timestamp.
- POD status.
- COD remittance status.

Provider-delivered status alone must not certify the financial record when POD or COD reconciliation is still required.

#### Financial Settlement

Add tabs:

```text
Merchant Settlements
Partner Settlements
Branch Reconciliation
COD Custody
Network Financial Exceptions
```

Merchant, partner, and branch batches must remain separate financial entities.

#### Merchant Portal

Show the parcel's tracking timeline and delivery outcome using Britium-neutral wording. Do not expose partner tariff, partner invoice, branch cash, or internal provider-performance notes.

#### Optional Partner Portal

A partner may access only its assigned parcels, manifests, POD submissions, COD statements, invoices, disputes, and payment status.

### 8.20 Role and permission requirements

Recommended permissions:

```text
network.route.view
network.route.assign
network.manifest.create
network.manifest.accept
network.tracking.manage
network.pod.review
network.exception.resolve
network.coverage.manage
network.contract.manage
finance.partner_settlement.create
finance.partner_settlement.review
finance.partner_settlement.approve
finance.partner_settlement.pay
finance.branch_reconciliation.create
finance.branch_reconciliation.approve
finance.cod_custody.review
partner.portal.access
branch.network.manage
```

A provider user must be restricted to its own `provider_id`. A branch user must be restricted to the assigned branch unless explicitly granted cross-branch authority.

### 8.21 Routing examples

#### Mandalay

Current default policy:

```text
managing_branch = MDY
fulfillment_mode = BRANCH_THIRD_PARTY
executing_provider = DK_DELIVERY
```

This is a configurable current rule, not a hardcoded permanent rule.

#### Nay Pyi Taw

Current default policy:

```text
managing_branch = NPT
fulfillment_mode = BRANCH_DIRECT
executing_provider = BRITIUM_NPT_BRANCH
```

When the branch outsources a specific township or capacity overflow:

```text
managing_branch = NPT
fulfillment_mode = BRANCH_THIRD_PARTY
executing_provider = configured provider
```

#### Other non-direct destinations

Current configurable preference:

```text
1. ROYAL_EXPRESS
2. ARLU_POST / NINJA_VAN / SAFE_DELIVERY according to coverage and contract
3. MANUAL_ROUTING_REQUIRED when no provider is valid
```

The order between fallback providers must be configured by destination and service type rather than globally assumed.

### 8.22 Acceptance criteria

- Every non-direct Way has one managing branch and one executing provider.
- Every external handover has a manifest and line-level acceptance.
- Britium Way ID remains canonical across all providers.
- Partner tracking events are deduplicated and auditable.
- A delivered outsourced Way has validated POD or an authorized waiver.
- COD custody can be identified at any time.
- Customer collection, merchant settlement, Britium revenue, provider cost, and branch cash remain separate.
- Partner settlement uses stored contract/tariff snapshots.
- A provider invoice cannot charge the same Way twice.
- A branch and headquarters cannot both pay the same partner charge.
- Mandalay can default to DK Delivery through configuration.
- Nay Pyi Taw can be monitored as a branch-managed flow.
- Royal Express, Arlu Post, Ninja Van, and Safe Delivery Services can be configured by destination, priority, and effective date.
- Out-of-reach parcels without a valid route are blocked and shown in the routing queue.
- Partner and branch financial totals reconcile to Way-level records and COD custody events.

## 9. Naypyitaw Branch ↔ Head Office Settlement

**Active scope:** Naypyitaw (`NPT`) only. Mandalay and partner settlements use their own contracts and must not inherit this rule.

**Business-rule interpretation requiring approval:** The phrase “every branch pays 10% gross revenue management fee to Head Office” is implemented as 10% of the branch’s allocated 55% or 45% gross share. If management intends 10% of total delivery revenue instead, the rule version must be changed before activation.

### 9.1 Objective

Replace the current per-shipment finance-lock behavior with a backend-authoritative Branch ↔ Head Office settlement workflow that separately controls:

1. Customer COD custody and remittance.
2. Merchant payable amounts.
3. Delivery-fee revenue sharing.
4. Head Office management fees.
5. Branch penalties and approved adjustments.
6. Prepaid delivery-fee settlement.
7. Settlement batches, approval, payment and audit history.

The initial production release applies only to Naypyitaw branch transactions.

### 9.2 Current Business Rules

For an eligible inter-office delivery charge `D`:

- Highway drop-off / sender-side gross share: `55% × D`.
- Receiver / last-mile-side gross share: `45% × D`.
- Every branch pays Head Office a management fee equal to `10%` of that branch's allocated gross share.
- Head Office does not charge itself a management fee when Head Office performs one side of the movement.
- Cargo damage, loss, wrong handoff and other approved penalties are deducted from the responsible branch.

#### 9.2.1 Entity-aware management-fee rule

For each operational side:

```text
management_fee =
  allocated_gross_share × 10%
  when the operational party is a BRANCH

management_fee = 0
  when the operational party is HEAD_OFFICE
```

This prevents Head Office from paying a fee to itself.

#### 9.2.2 Branch net share

```text
branch_net_share =
  branch_gross_share
  - branch_management_fee
  - approved_penalties
  - approved_deductions
  + approved_credits
```

#### 9.2.3 Head Office settlement revenue

```text
head_office_settlement_revenue =
  head_office_operational_share
  + management_fees_from_branches
  + approved_penalties_payable_to_head_office
  - approved_head_office_credits_to_branch
```

### 9.3 Naypyitaw Route Scenarios

#### 9.3.1 Head Office sends; Naypyitaw performs last mile

```text
sender_party_type      = HEAD_OFFICE
sender_party_code      = YGN-HQ
receiver_party_type    = BRANCH
receiver_party_code    = NPT
```

For delivery charge `D`:

```text
HQ sender gross share       = 55% × D
NPT last-mile gross share   = 45% × D
NPT management fee          = 10% × NPT gross share
NPT net operational share   = 90% × NPT gross share
HQ total before adjustments = HQ sender share + NPT management fee
```

Example for `D = 6,000 MMK`:

```text
HQ sender gross share       = 3,300
NPT last-mile gross share   = 2,700
NPT management fee          =   270
NPT net share               = 2,430
HQ settlement revenue       = 3,570
Total                       = 6,000
```

#### 9.3.2 Naypyitaw sends; Head Office performs last mile

```text
sender_party_type      = BRANCH
sender_party_code      = NPT
receiver_party_type    = HEAD_OFFICE
receiver_party_code    = YGN-HQ
```

For delivery charge `D`:

```text
NPT sender gross share      = 55% × D
HQ last-mile gross share    = 45% × D
NPT management fee          = 10% × NPT gross share
NPT net operational share   = 90% × NPT gross share
HQ total before adjustments = HQ last-mile share + NPT management fee
```

Example for `D = 6,000 MMK`:

```text
NPT sender gross share      = 3,300
HQ last-mile gross share    = 2,700
NPT management fee          =   330
NPT net share               = 2,970
HQ settlement revenue       = 3,030
Total                       = 6,000
```

#### 9.3.3 Future branch-to-branch scenario

When two non-HQ branches participate, both branch shares incur the 10% management fee.

For delivery charge `D`:

```text
sender branch net     = 55% × D × 90%
receiver branch net   = 45% × D × 90%
HQ management fee     = 10% × (55% × D) + 10% × (45% × D)
                      = 10% × D
```

This rule must be available in the engine but disabled from production selection until another branch settlement agreement is approved.

### 9.4 Revenue Basis

The 55/45 split must use the approved **branch-shareable delivery revenue**, not the full receiver collection and not the item price.

Recommended field:

```text
shareable_delivery_revenue_mmk
```

Default calculation:

```text
shareable_delivery_revenue_mmk =
  net_system_delivery_charge
  + branch_shareable_surcharges
```

The following must be explicitly configured as shareable or non-shareable:

- Extra-weight surcharge.
- CBM surcharge.
- Remote-area surcharge.
- Redelivery charge.
- Return charge.
- Handling charge.
- Insurance.
- Merchant-declared delivery excess.
- Company-owned additional customer charge.

Until configuration is approved, only `net_system_delivery_charge` is shareable.

Merchant-declared delivery excess or shortfall remains part of merchant settlement and must not automatically enter the branch 55/45 revenue split.

### 9.5 COD Settlement

COD settlement and delivery-revenue sharing are separate calculations.

#### 9.5.1 Gross COD custody

Store:

```text
customer_total_collected
item_price_component
merchant_delivery_component
additional_customer_charge
cod_custody_holder
cod_collected_at
cod_remitted_amount
cod_remitted_at
cod_remittance_reference
cod_shortage
cod_overage
```

#### 9.5.2 Merchant payable

Use the existing backend merchant-settlement result:

```text
merchant_final_settlement_amount
```

The branch share must never be deducted from the merchant’s item amount.

#### 9.5.3 COD remittance requirement

A branch settlement batch cannot be finalized unless:

```text
branch_recorded_customer_collection
= head_office_confirmed_remittance
+ approved_refunds
+ approved_shortages
- approved_overages
```

Any difference opens `COD_REMITTANCE_MISMATCH`.

#### 9.5.4 Netting policy

Phase 1 should use gross accounting:

- Branch remits the full COD/customer collection owed to Head Office.
- Head Office separately pays the approved branch net revenue share.

Do not silently net branch revenue against COD remittance.

If net settlement is introduced later, it must be an explicit batch-level method with separate gross ledger entries.

### 9.6 Prepaid Settlement

For prepaid parcels:

```text
customer_total_collected_at_delivery = 0
```

The delivery fee remains eligible for the 55/45 split when:

- The parcel is delivered.
- The fee was successfully collected or recognized by Britium.
- The parcel has valid route-side assignments.
- No financial hold is open.

The settlement screen must show:

- Prepaid delivery revenue.
- Sender gross share.
- Receiver gross share.
- Branch management fee.
- Branch net share.
- Penalties and adjustments.
- Final Head Office payable or receivable.

### 9.7 Penalties

Supported penalty types:

```text
CARGO_DAMAGE
CARGO_LOSS
WRONG_HANDOFF
MISSING_POD
LATE_COD_REMITTANCE
COD_SHORTAGE
UNAUTHORIZED_CHARGE
SLA_BREACH
RETURN_PROCESS_FAILURE
OTHER
```

Each penalty requires:

- Responsible party.
- Way ID.
- Settlement batch or period.
- Penalty type.
- Claimed amount.
- Approved amount.
- Reason.
- Evidence.
- Requested by.
- Approved by.
- Dispute status.
- Effective date.

A penalty must not overwrite the original shipment or revenue-share calculation. It must be a separate ledger adjustment.

### 9.8 Settlement Eligibility

A parcel is eligible only when:

```text
branch_code = NPT
parcel_status = DELIVERED
financial_validation_status = OK
lineage_valid = true
shareable_delivery_revenue_mmk is not null
sender_party_code is not null
receiver_party_code is not null
pod_status = VERIFIED
financial_hold = false
branch_settlement_batch_id is null
```

For COD parcels also require:

```text
cod_custody_status in (
  BRANCH_CONFIRMED,
  REMITTED_TO_HQ,
  HQ_CONFIRMED
)
```

### 9.9 Settlement Batch

Create one batch per branch and settlement period.

Recommended batch number:

```text
NPT-SET-YYYYMMDD-####
```

Statuses:

```text
DRAFT
UNDER_REVIEW
PENDING_BRANCH_CONFIRMATION
PENDING_HQ_APPROVAL
APPROVED
PAYMENT_PROCESSING
PARTIALLY_SETTLED
SETTLED
DISPUTED
REJECTED
CANCELLED
REOPENED
```

Batch totals:

```text
total_parcels
total_cod_collected
total_cod_remitted
total_prepaid_revenue
total_shareable_delivery_revenue
sender_gross_share
receiver_gross_share
branch_gross_share
branch_management_fee
branch_penalties
branch_credits
branch_deductions
branch_net_share
hq_operational_share
hq_management_fee_revenue
hq_net_receivable_or_payable
```

### 9.10 Settlement Direction

From Head Office’s perspective:

```text
if branch_net_share > branch_cash_due_to_hq_adjustments:
  settlement_direction = HQ_PAYS_BRANCH

if branch_net_share < branch_cash_due_to_hq_adjustments:
  settlement_direction = BRANCH_PAYS_HQ

if equal:
  settlement_direction = NO_NET_PAYMENT
```

Gross COD remittance must still remain visible independently from this net direction.

### 9.11 Required Database Models

#### 9.11.1 Rule master

```text
be_branch_settlement_rule_master
```

Fields:

```text
rule_id
rule_code
branch_code
origin_party_type
origin_party_code
destination_party_type
destination_party_code
sender_share_percent
receiver_share_percent
branch_management_fee_percent
share_extra_weight
share_cbm
share_other_surcharge
effective_from
effective_to
status
version
approved_by
approved_at
```

Seed only:

```text
rule_code = NPT_INTEROFFICE_55_45_MGMT10_V1
branch_code = NPT
sender_share_percent = 55
receiver_share_percent = 45
branch_management_fee_percent = 10
status = ACTIVE
```

#### 9.11.2 Parcel calculation snapshot

```text
be_branch_settlement_parcel_snapshot
```

Fields:

```text
way_id
branch_code
rule_id
rule_version
shareable_delivery_revenue_mmk
sender_party_type
sender_party_code
receiver_party_type
receiver_party_code
sender_gross_share
receiver_gross_share
sender_management_fee
receiver_management_fee
branch_gross_share
branch_management_fee
branch_net_share_before_adjustments
calculated_at
```

#### 9.11.3 Batch and lines

```text
be_branch_settlement_batches
be_branch_settlement_batch_lines
be_branch_settlement_adjustments
be_branch_cod_remittances
be_branch_settlement_payments
```

### 9.12 Required RPCs

```text
be_branch_settlement_snapshot_v1
be_branch_settlement_calculate_parcel_v1
be_branch_settlement_create_batch_v1
be_branch_settlement_add_parcels_v1
be_branch_settlement_remove_parcel_v1
be_branch_settlement_submit_v1
be_branch_settlement_branch_confirm_v1
be_branch_settlement_hq_approve_v1
be_branch_settlement_reject_v1
be_branch_settlement_record_cod_remittance_v1
be_branch_settlement_confirm_cod_remittance_v1
be_branch_settlement_add_adjustment_v1
be_branch_settlement_record_payment_v1
be_branch_settlement_reopen_v1
```

All mutations must be security-definer RPCs with authenticated role checks, branch scope, maker-checker controls and audit logging.

### 9.13 Screen Requirements

Replace the current basic COD and Finance tabs with a dedicated screen:

```text
Branch ↔ Head Office Settlement
```

Phase 1 branch selector must be fixed to:

```text
Naypyitaw Branch (NPT)
```

Do not allow Mandalay or other branches to create settlement batches until an active rule exists.

Tabs:

- Overview
- Eligible Parcels
- COD Remittance
- Prepaid Revenue
- Settlement Batches
- Penalties & Adjustments
- Payments
- Disputes
- Audit Log
- Rule Configuration — HQ only

KPIs:

- Delivered eligible ways
- Total COD collected
- COD remitted
- COD outstanding
- Shareable delivery revenue
- NPT gross share
- NPT management fee
- NPT penalties
- NPT net payable
- Head Office revenue
- Open exceptions

Parcel table columns:

- Way ID
- Delivery date
- Payment type
- Direction
- Sender side
- Last-mile side
- Customer collection
- Shareable delivery revenue
- Sender 55% share
- Receiver 45% share
- NPT gross share
- NPT management fee
- Penalty
- NPT net share
- COD custody status
- Settlement status

### 9.14 Current Page Changes

The existing page currently:

- Loads shipments directly from `branch_shipments`.
- Updates finance locks directly from the browser.
- Treats `finance_locked = 1` as settled.
- Calculates finance totals from all branch shipment rows.
- Allows branch and HQ mode to be selected from browser session state.

Required changes:

1. `finance_locked` must remain only a legacy edit-lock indicator.
2. Add a real `branch_settlement_status` and `branch_settlement_batch_id`.
3. Replace direct settlement table updates with secured RPCs.
4. Derive user mode and branch scope from authenticated backend permissions, not `sessionStorage`.
5. Do not let the browser choose HQ authority.
6. Do not calculate settlement from uncontrolled client-side sums.
7. Continue to show shipment finance fields, but source official batch values from backend snapshots.

### 9.15 Mandalay and Third-Party Rate Placeholders

Create inactive counterparties:

```text
DK_DELIVERY
ROYAL_EXPRESS
ARLU_POST
NINJA_VAN
SAFE_DELIVERY_SERVICES
```

Create draft routing defaults:

```text
Mandalay -> DK_DELIVERY
Other outsourced destinations -> ROYAL_EXPRESS
```

These records must have:

```text
configuration_status = RATE_PENDING
settlement_enabled = false
```

When no approved effective rate exists:

- Routing may show `PROPOSED_PROVIDER` only.
- The parcel must show `PARTNER_RATE_MISSING`.
- Partner payable must remain null.
- Partner settlement eligibility must be blocked.
- The system must not fall back to the Naypyitaw 55/45 branch rule.
- The system must not use Britium customer tariff as provider cost.

### 9.16 Acceptance Tests

#### Test A — HQ sends to NPT

Input:

```text
delivery revenue = 6,000
sender = YGN-HQ
last mile = NPT
penalty = 0
```

Expected:

```text
HQ sender share = 3,300
NPT gross share = 2,700
NPT management fee = 270
NPT net share = 2,430
HQ revenue = 3,570
reconciliation difference = 0
```

#### Test B — NPT sends to HQ

Input:

```text
delivery revenue = 6,000
sender = NPT
last mile = YGN-HQ
penalty = 0
```

Expected:

```text
NPT gross share = 3,300
NPT management fee = 330
NPT net share = 2,970
HQ last-mile share = 2,700
HQ revenue = 3,030
reconciliation difference = 0
```

#### Test C — NPT penalty

Input:

```text
NPT gross share = 2,700
management fee = 270
approved cargo damage penalty = 500
```

Expected:

```text
NPT net share = 1,930
```

#### Test D — COD remittance mismatch

Input:

```text
customer collection = 30,000
HQ confirmed remittance = 29,500
no approved refund or shortage
```

Expected:

```text
exception = COD_REMITTANCE_MISMATCH
batch approval blocked = true
```

#### Test E — Mandalay before DK rate activation

Input:

```text
branch = MDY
provider = DK_DELIVERY
approved provider rate = null
```

Expected:

```text
provider settlement = blocked
exception = PARTNER_RATE_MISSING
NPT 55/45 rule applied = false
```

### 9.17 Deployment Requirements

Before activation:

1. Confirm whether extra-weight and other surcharges enter the 55/45 split.
2. Confirm settlement frequency for NPT.
3. Confirm COD remittance deadline.
4. Confirm payment method and bank account ownership.
5. Approve penalty matrix and limits.
6. Backfill sender and last-mile roles for existing NPT delivered ways.
7. Reconcile a sample period manually against the new calculations.
8. Obtain Finance and Branch Manager sign-off.

Mandalay/DK Delivery and Royal Express settlement must be deployed as a later effective-dated configuration after approved rate sheets are provided.

## 10. Mandalay DK Delivery and Royal Express Settlement

**Specification version:** `OUTSOURCE_SETTLEMENT_V1_2026_07_31`  
**Applies to:** Britium Express network fulfillment, Finance, Operations, Data Entry, Final Sync and partner settlement  
**Source documents:**
- DK Delivery Service Mandalay partnership fee map
- Royal Express quotation `Q-019-05-2026`, dated 22 May 2026

---

### 10.1 Business Scope

The production system must apply the following routing priority:

1. **Yangon destinations:** Britium direct delivery, unless an authorized exception applies.
2. **Naypyitaw destinations:** Naypyitaw branch workflow and the separate Branch ↔ Head Office settlement rule.
3. **Mandalay destinations:** Britium charges the customer using the Britium Yangon-Mandalay tariff and outsources Mandalay last-mile delivery to DK Delivery Service.
4. **Other supported destinations:** Royal Express is the preferred outsourced delivery provider.
5. Alternative providers such as Arlu Post, Ninja Van and Safe Delivery Services remain inactive until their approved rate cards are entered.

The routing engine must not select Royal Express for Yangon, Mandalay or Naypyitaw under the current policy, even when the Royal Express quotation contains rates for those destinations.

All routing policies must be effective-dated configuration. They must not be hardcoded in React components or SQL functions.

---

### 10.2 Required Separation of Financial Values

The system must separately store and calculate:

1. Customer-facing delivery charge.
2. Britium recognized delivery revenue.
3. Merchant settlement.
4. Highway line-haul cost.
5. External last-mile delivery cost.
6. External COD service fee.
7. Partner discount margin.
8. Partner monthly rebate.
9. Partner penalties, credits and adjustments.
10. Final outsourced fulfillment margin.

Partner costs must never overwrite the merchant-declared delivery charge or the Britium customer tariff.

The existing merchant settlement rule remains:

```text
Merchant Delivery Difference
= Effective Merchant-Declared Delivery Charge
- Britium Net System Delivery Charge
```

Outsourced fulfillment profitability is a separate calculation.

---

### 10.3 Mandalay Fulfillment Model - DK Delivery Service

#### 10.3.1 Customer Charge

For a Mandalay parcel, Britium must charge according to its active Yangon-Mandalay tariff:

```text
Britium Customer Delivery Charge
= Mandalay Base Tariff
+ Britium Extra-Weight Surcharge
+ Britium CBM Surcharge
+ Other Approved Customer-Facing Surcharges
```

The current Mandalay base tariff is 6,000 MMK. Customer-tier included-weight and extra-weight rules continue to come from the Britium tariff master.

The DK last-mile rate must not replace the 6,000 MMK Britium customer tariff.

#### 10.3.2 Britium Cost Stack

Britium bears two principal fulfillment costs:

1. Yangon-to-Mandalay highway bus transportation.
2. DK Delivery Service last-mile delivery within Mandalay.

Calculate:

```text
Total Mandalay Fulfillment Cost
= Allocated Highway Line-Haul Cost
+ DK Base Last-Mile Fee
+ DK Weight/Size Surcharge
+ Other Approved DK Charges
+ Other Approved Handling Costs
- DK Credits
- DK Penalties
```

```text
Mandalay Fulfillment Margin
= Britium Recognized Delivery Revenue
- Total Mandalay Fulfillment Cost
```

A negative margin must be shown as a company loss. It must not automatically be charged to the merchant or receiver.

#### 10.3.3 DK Rate Bands

The DK partnership map must be converted into an approved service-area rate master.

Supported base fee bands shown in the source are:

```text
DK_INNER_AREA      2,000 MMK
DK_OUTER_AREA      2,500 MMK
DK_EXTENDED_AREA   3,000 MMK
```

The source also states an additional 500/1,000 MMK when the parcel exceeds 2 kg or the stated one-foot size condition. The exact rule that determines 500 versus 1,000 MMK is not sufficiently defined in the source and must remain configurable and unapproved until DK or Britium Finance confirms it.

Required surcharge fields:

```text
overweight_threshold_kg = 2
oversize_threshold_description = "1-foot size condition from DK quotation"
surcharge_500_rule
surcharge_1000_rule
surcharge_status = PENDING_CONFIRMATION | ACTIVE | INACTIVE
```

The backend must not guess which surcharge applies.

#### 10.3.4 DK Area Master

Create:

```text
be_partner_service_areas
```

Required fields:

```text
id
partner_code = DK_DELIVERY
area_code
area_name_en
area_name_mm
area_aliases
city = Mandalay
zone_band = INNER | OUTER | EXTENDED
base_fee_mmk = 2000 | 2500 | 3000
geo_polygon_or_boundary_reference
source_document_id
effective_from
effective_to
status
approved_by
approved_at
```

Every Mandalay parcel must resolve to one DK area row before partner settlement.

If the area cannot be resolved, set:

```text
exception_code = DK_AREA_RATE_NOT_FOUND
partner_settlement_eligible = false
```

#### 10.3.5 Highway Transportation Cost

Highway bus cost must be recorded independently from DK cost.

Create a line-haul manifest containing:

```text
manifest_id
origin = YGN
destination = MDY
bus_operator
bus_reference
sent_at
received_at
total_parcels
total_actual_weight
total_volumetric_weight
total_transport_cost_mmk
loading_cost_mmk
unloading_cost_mmk
other_cost_mmk
receipt_attachment
status
```

Supported allocation methods:

```text
EQUAL_PER_WAY
BY_ACTUAL_WEIGHT
BY_CHARGEABLE_WEIGHT
BY_VOLUMETRIC_WEIGHT
MANUAL_APPROVED
```

The selected method must be stored on the manifest.

```text
Allocated Highway Cost per Parcel
= Manifest Cost allocated using the saved allocation method
```

A settled parcel must retain its allocation snapshot even when the manifest is later corrected. Corrections must use adjustment entries.

#### 10.3.6 DK Settlement Eligibility

A DK parcel is eligible only when:

- Britium Way ID is valid.
- Mandalay routing is confirmed.
- Highway handover is confirmed.
- DK handover is accepted.
- DK area rate is resolved.
- Delivery status is completed.
- POD is verified.
- DK charge calculation is valid.
- No financial hold exists.
- The parcel is not already in a finalized partner batch.

---

### 10.4 Royal Express Fulfillment Model

#### 10.4.1 Contract Components

The Royal Express quotation contains distinct components:

1. **Normal Price:** customer-facing standard delivery rate.
2. **Discounted Rate:** Britium business-partner rate for 0.1-3 kg, reflecting a 15% discount.
3. **Next 1 Kg:** extra-weight rate by destination/zone.
4. **COD Service Fee.**
5. **Monthly completed-waybill rebate tier.**
6. Operational and compensation terms.

The backend must not store these as one amount called `commission`.

#### 10.4.2 Customer Delivery Charge

Under the stated Britium policy, Britium collects Royal Express's normal rate from the customer.

```text
Royal Customer Delivery Charge
= Royal Normal Base Rate
+ Customer Extra-Weight Charge
+ Customer-Payable Approved Surcharges
```

The customer base rate must come from the `Normal Price` column.

#### 10.4.3 Royal Partner Payable

```text
Royal Base Partner Cost
= Royal Discounted Rate for 0.1-3 kg
```

```text
Extra Weight Units
= CEILING(MAX(0, Actual Weight - 3 kg))
```

The document lists one `Next 1 Kg` rate. Until Royal confirms a separate discounted extra-kg rate, store both customer and partner extra-kg rates as separate fields and initialize them to the quoted `Next 1 Kg` amount.

```text
Royal Partner Payable Before Rebate
= Discounted Base Rate
+ Partner Extra-Weight Charge
+ Royal COD Service Fee
+ Return/Redelivery/Other Approved Charges
- SLA Credits
- Other Partner Credits
```

#### 10.4.4 Immediate Discount Margin

The 15% benefit is a contract discount, not a later commission receivable.

```text
Royal Base Discount Margin
= Normal Base Price
- Discounted Base Rate
```

Examples from the quotation:

```text
Normal 4,500 - Discounted 3,825 = 675 MMK
Normal 5,000 - Discounted 4,250 = 750 MMK
Normal 7,000 - Discounted 5,950 = 1,050 MMK
Normal 10,500 - Discounted 8,925 = 1,575 MMK
```

The system may display this as:

```text
PARTNER_DISCOUNT_MARGIN
```

Do not label it as a Royal cash commission unless Finance explicitly wants that presentation.

#### 10.4.5 COD Service Fee

Royal COD service fee:

```text
If product_amount_mmk <= 300,000:
    royal_cod_fee_mmk = 195

If product_amount_mmk > 300,000:
    royal_cod_fee_mmk = product_amount_mmk * 0.002
```

The quotation refers to `product amount`. Use the Financial V2 item-price/product-amount field, not total customer collection, unless the contract is amended.

The percentage calculation must use decimal arithmetic. The whole-MMK rounding policy must be configurable and approved before activation.

Required field:

```text
cod_fee_billing_party = BRITIUM | CUSTOMER | MERCHANT
```

Do not automatically add the Royal COD fee to customer collection until this policy is configured.

#### 10.4.6 Monthly Rebate

The quotation provides access to:

```text
1,000+ completed waybills => 5%
2,000+ completed waybills => 10%
3,000+ completed waybills => 15%
```

Use the highest achieved non-stacking tier for the calendar month.

```text
monthly_completed_ways = count of eligible Royal completed waybills
```

```text
rebate_rate =
  0%  when completed ways < 1,000
  5%  when completed ways >= 1,000 and < 2,000
  10% when completed ways >= 2,000 and < 3,000
  15% when completed ways >= 3,000
```

The quotation does not define the rebate calculation base. Therefore:

```text
rebate_basis_status = REQUIRES_CONTRACT_CONFIRMATION
```

Possible configurable bases include:

```text
DISCOUNTED_BASE_FEES
TOTAL_PARTNER_DELIVERY_FEES_EXCLUDING_COD
TOTAL_PARTNER_FEES
OTHER_CONTRACT_DEFINED_BASE
```

The system may estimate the rebate only after a basis is configured. It must not finalize or post the rebate until Royal confirms it by statement, credit note or approved reconciliation.

Store:

```text
estimated_rebate_mmk
confirmed_rebate_mmk
rebate_confirmation_reference
rebate_status = ESTIMATED | SUBMITTED | CONFIRMED | DISPUTED | POSTED
```

#### 10.4.7 Royal Net Margin

```text
Royal Outsourced Margin Before Rebate
= Customer Delivery Charge
- Royal Partner Payable Before Rebate
- Britium Handover/Transport Costs
```

```text
Royal Final Outsourced Margin
= Royal Outsourced Margin Before Rebate
+ Confirmed Monthly Rebate Allocated to the Parcel or Month
```

Do not count the 15% base discount again as a monthly rebate.

#### 10.4.8 COD Remittance

Royal states that COD transfer will occur within 2-3 days after successful delivery.

Track:

```text
delivered_at
expected_cod_remittance_from
expected_cod_remittance_to
actual_cod_remitted_at
cod_remitted_mmk
cod_remittance_reference
cod_remittance_status
```

Alert when the amount remains unremitted after the end of the configured SLA window.

Gross COD custody must remain separate from Royal delivery fees. Even when Royal remits net cash, the system must record:

```text
gross_cod_collected
partner_fees_netted
net_cash_received
```

and reconcile:

```text
Gross COD Collected
= Net Cash Received
+ Approved Netted Partner Fees
+ Approved Refunds/Adjustments
```

#### 10.4.9 Other Royal Terms to Monitor

Store operational alerts for:

- Maximum loss/damage compensation: 250,000 MMK.
- Three delivery attempts within seven days for unsuccessful delivery.
- Britium/Customer drop-off to Royal Express branches.
- Service-area and rate changes.
- Force-majeure lead-time extension.

The rate card must be versioned because the quotation states that service cities and prices may change.

---

### 10.5 Routing Precedence

Create an effective-dated routing-policy table.

```text
priority 1: YGN -> BRITIUM_DIRECT
priority 2: NPT -> NPT_BRANCH
priority 3: MDY -> DK_DELIVERY
priority 4: all other Royal-supported destinations -> ROYAL_EXPRESS
priority 5: authorized manual fallback provider
```

Royal rate rows for Yangon, Mandalay and Naypyitaw may be imported for reference, but mark:

```text
routing_eligible = false
```

under the current policy.

A manual override must require:

- Authorized Operations user.
- Override reason.
- Selected contract/rate version.
- Expected cost.
- Finance visibility.
- Audit entry.

---

### 10.6 Database Model

#### 10.6.1 Partner Contracts

```sql
be_partner_contracts
```

Fields:

```text
id
partner_code
partner_name
contract_reference
quotation_reference
source_document_id
document_issue_date
document_effective_date
system_activation_date
effective_to
status
settlement_currency
settlement_cycle
cod_remittance_sla_min_days
cod_remittance_sla_max_days
approved_by
approved_at
```

Do not infer the production activation date from the document. Royal's header and quotation date must both be preserved and Finance must approve `system_activation_date`.

#### 10.6.2 Partner Rate Cards

```sql
be_partner_rate_cards
be_partner_rate_rows
```

Rate row fields:

```text
partner_code
origin_city
destination_code
destination_name
state_division_code
zone_code
customer_normal_base_mmk
partner_discounted_base_mmk
customer_included_kg
partner_included_kg
customer_next_kg_mmk
partner_next_kg_mmk
area_band
base_fee_mmk
source_row_number
effective_from
effective_to
status
```

#### 10.6.3 COD Fee Rules

```sql
be_partner_cod_fee_rules
```

Fields:

```text
partner_code
minimum_product_amount
maximum_product_amount
fee_type = FIXED | PERCENTAGE
fee_value
rounding_policy
billing_party
status
```

#### 10.6.4 Rebate Tiers

```sql
be_partner_rebate_tiers
```

Fields:

```text
partner_code
minimum_completed_ways
maximum_completed_ways
rebate_percent
rebate_basis
confirmation_required
status
```

#### 10.6.5 Parcel Outsource Snapshot

Every outsourced parcel must store:

```text
fulfillment_mode
managing_branch_code
partner_code
partner_contract_id
partner_rate_card_id
partner_rate_row_id
partner_tracking_id
partner_handover_id
customer_delivery_charge_snapshot
partner_base_cost_snapshot
partner_extra_weight_snapshot
partner_cod_fee_snapshot
partner_other_cost_snapshot
linehaul_cost_snapshot
estimated_rebate_snapshot
confirmed_rebate_snapshot
outsourced_margin_snapshot
calculation_version
calculated_at
```

Historical parcels must never be recalculated from a newly uploaded partner rate card.

---

### 10.7 Required Backend Services and RPCs

```text
be_fulfillment_route_resolve_v55
be_partner_quote_calculate_v55
be_dk_area_rate_resolve_v55
be_linehaul_manifest_create_v55
be_linehaul_manifest_allocate_v55
be_partner_handover_create_v55
be_partner_handover_accept_v55
be_partner_tracking_event_ingest_v55
be_partner_pod_confirm_v55
be_partner_cod_remittance_record_v55
be_partner_cod_remittance_confirm_v55
be_partner_settlement_snapshot_v55
be_partner_settlement_batch_create_v55
be_partner_settlement_batch_submit_v55
be_partner_settlement_batch_approve_v55
be_partner_settlement_payment_record_v55
be_partner_rebate_estimate_v55
be_partner_rebate_confirm_v55
be_partner_adjustment_create_v55
```

All mutations must be secured, branch-scoped, audited and idempotent.

---

### 10.8 Partner Settlement Screen Changes

Add or update:

**Network Fulfillment & Partner Settlement**

Tabs:

- Overview
- Mandalay / DK Delivery
- Royal Express
- Highway Line-Haul
- COD Remittance
- Partner Settlement Batches
- Rebates and Credits
- Penalties and Disputes
- Rate Cards
- Audit Log

#### 10.8.1 DK Table Columns

```text
Britium Way ID
Mandalay Area
Britium Delivery Revenue
Highway Manifest
Allocated Highway Cost
DK Base Fee
DK Weight/Size Surcharge
Other DK Cost
Total Fulfillment Cost
Margin
POD Status
Settlement Status
```

#### 10.8.2 Royal Table Columns

```text
Britium Way ID
Royal Tracking ID
Destination
Zone
Normal Customer Rate
Discounted Partner Rate
Extra Kg
Extra-Kg Charge
COD Service Fee
Other Partner Charges
Immediate Discount Margin
Estimated Rebate
Confirmed Rebate
COD Remittance Status
Final Partner Payable
Final Margin
Settlement Status
```

---

### 10.9 Accounting Treatment

#### 10.9.1 Mandalay / DK

Recognize separately:

```text
Delivery Revenue - Mandalay
Highway Line-Haul Expense
DK Last-Mile Delivery Expense
DK Surcharge Expense
Other Fulfillment Expense
Partner Payable - DK
```

#### 10.9.2 Royal Express

Recognize separately:

```text
Delivery Revenue - Royal Customer Rate
Royal Base Delivery Expense - Discounted Rate
Royal Extra-Weight Expense
Royal COD Service Fee Expense
Royal Other Charges
Royal Rebate Receivable - only after confirmation policy permits
Partner Payable - Royal Express
COD Receivable from Royal Express
```

The 15% base-rate difference is gross margin created by discounted procurement. It is not a separate cash receivable.

---

### 10.10 Calculation Pseudocode

```ts
type ProviderCode = 'DK_DELIVERY' | 'ROYAL_EXPRESS';

interface MandalayCostInput {
  britiumRecognizedDeliveryRevenueMmk: number;
  allocatedHighwayCostMmk: number;
  dkBaseFeeMmk: number;
  dkWeightSizeSurchargeMmk: number;
  dkOtherChargesMmk: number;
  dkCreditsMmk: number;
  dkPenaltiesMmk: number;
}

function calculateMandalayMargin(input: MandalayCostInput) {
  const totalFulfillmentCostMmk =
    input.allocatedHighwayCostMmk +
    input.dkBaseFeeMmk +
    input.dkWeightSizeSurchargeMmk +
    input.dkOtherChargesMmk -
    input.dkCreditsMmk -
    input.dkPenaltiesMmk;

  return {
    totalFulfillmentCostMmk,
    marginMmk:
      input.britiumRecognizedDeliveryRevenueMmk -
      totalFulfillmentCostMmk,
  };
}
```

```ts
interface RoyalCostInput {
  actualWeightKg: number;
  normalBaseMmk: number;
  discountedBaseMmk: number;
  customerNextKgMmk: number;
  partnerNextKgMmk: number;
  productAmountMmk: number;
  customerOtherSurchargesMmk: number;
  partnerOtherChargesMmk: number;
  handoverTransportCostMmk: number;
  confirmedRebateMmk: number;
}

function calculateRoyalSettlement(input: RoyalCostInput) {
  const extraKgUnits = Math.ceil(
    Math.max(0, input.actualWeightKg - 3),
  );

  const customerExtraMmk =
    extraKgUnits * input.customerNextKgMmk;

  const partnerExtraMmk =
    extraKgUnits * input.partnerNextKgMmk;

  const codFeeUnrounded =
    input.productAmountMmk <= 300_000
      ? 195
      : input.productAmountMmk * 0.002;

  // Apply the approved contract rounding policy here.
  const royalCodFeeMmk = codFeeUnrounded;

  const customerDeliveryChargeMmk =
    input.normalBaseMmk +
    customerExtraMmk +
    input.customerOtherSurchargesMmk;

  const partnerPayableBeforeRebateMmk =
    input.discountedBaseMmk +
    partnerExtraMmk +
    royalCodFeeMmk +
    input.partnerOtherChargesMmk;

  const immediateDiscountMarginMmk =
    input.normalBaseMmk - input.discountedBaseMmk;

  const finalPartnerCostMmk =
    partnerPayableBeforeRebateMmk -
    input.confirmedRebateMmk;

  const finalMarginMmk =
    customerDeliveryChargeMmk -
    finalPartnerCostMmk -
    input.handoverTransportCostMmk;

  return {
    extraKgUnits,
    customerExtraMmk,
    partnerExtraMmk,
    royalCodFeeMmk,
    customerDeliveryChargeMmk,
    partnerPayableBeforeRebateMmk,
    immediateDiscountMarginMmk,
    finalPartnerCostMmk,
    finalMarginMmk,
  };
}
```

---

### 10.11 Acceptance Tests

#### Test 1 - Mandalay Inner DK Area

Inputs:

```text
Britium recognized delivery revenue = 6,000
DK area band = INNER
DK base = 2,000
Allocated highway cost = 1,200 test value
DK surcharge = 0
```

Expected:

```text
Total fulfillment cost = 3,200
Mandalay margin = 2,800
```

The 1,200 amount is a test fixture, not a contractual highway rate.

#### Test 2 - Mandalay Missing Highway Cost

When the highway manifest has no approved cost allocation:

```text
exception = HIGHWAY_COST_NOT_ALLOCATED
settlement_eligible = false
```

#### Test 3 - DK Unresolved Area

```text
exception = DK_AREA_RATE_NOT_FOUND
partner_payable = null
settlement_eligible = false
```

#### Test 4 - Royal Hinthada Base Parcel

From the quotation:

```text
Normal base = 4,500
Discounted base = 3,825
Weight <= 3 kg
Product amount <= 300,000
Royal COD fee = 195
```

When Britium absorbs the COD fee and there are no other costs:

```text
Customer delivery charge = 4,500
Partner payable before rebate = 4,020
Immediate base discount margin = 675
Margin after COD fee = 480
```

#### Test 5 - Royal 4 kg Parcel

```text
Normal base = 4,500
Discounted base = 3,825
Next 1 kg customer rate = 1,700
Next 1 kg partner rate = 1,700
Actual weight = 4 kg
Product amount <= 300,000
```

Expected:

```text
Extra kg units = 1
Customer delivery charge before other surcharge = 6,200
Partner payable before rebate = 5,720
Final margin before transport/rebate = 480
```

#### Test 6 - Royal COD Above 300,000

```text
Product amount = 500,000
Royal COD fee = 500,000 × 0.2% = 1,000
```

#### Test 7 - Royal Monthly Rebate Tier

```text
Completed Royal ways = 2,100
Rebate tier = 10%
```

If the rebate basis is not configured:

```text
rebate_status = REQUIRES_CONTRACT_CONFIRMATION
confirmed_rebate = null
```

#### Test 8 - Routing Exclusion

A Mandalay parcel must route to DK Delivery even though the Royal quotation contains a Mandalay row.

Expected:

```text
provider = DK_DELIVERY
routing_rule = MDY_PRIMARY_DK
```

---

### 10.12 Mandatory Business Confirmations Before Production Activation

1. Exact DK areas assigned to 2,000, 2,500 and 3,000 MMK.
2. Exact condition for DK 500 versus 1,000 MMK surcharge.
3. Highway cost allocation method and approval authority.
4. Whether Royal's 15% discount applies only to the first 3 kg or also to extra kilograms.
5. Royal monthly rebate calculation base.
6. Whether the monthly rebate is cumulative with the 15% discounted rate.
7. Whether Royal COD service fee is absorbed by Britium, charged to merchant or charged to receiver.
8. Royal percentage-fee rounding rule.
9. Approved production activation date for the quotation.
10. Return, redelivery and failed-delivery charges for both partners.
11. Taxes and withholding treatment.
12. Required invoice and credit-note documents.

Until these points are approved, affected calculations must show `REVIEW` or `RATE_CONFIGURATION_INCOMPLETE` rather than silently applying assumptions.

---

### 10.13 Definition of Done

The module is complete when:

- Mandalay customer tariffs remain Britium tariffs.
- Highway and DK costs are independently recorded and allocated.
- DK area rates and surcharge rules are versioned.
- Royal normal and discounted rates are separately stored.
- Royal COD fees are calculated by threshold.
- Monthly rebates are estimated and confirmed separately.
- Royal COD remittance is monitored against its SLA.
- Partner costs do not alter merchant settlement.
- Route precedence prevents Royal from replacing DK or Naypyitaw workflows.
- Settlement batches reconcile at Way level.
- Historical partner costs remain unchanged after future rate updates.
- All financial mutations are secured and audited.

---

# Part II — Platform Remediation and Supporting Modules

## 11. Confirmed Current-State Technical Findings

### 11.1 Final synchronization

`FinalSynchronizationV50.tsx` computes merchant codes from Way ID and Pickup ID in the browser and prevents the certify button when they differ. It does not repair canonical records. The supplied archive contains the RPC callers but not the SQL definitions for `be_final_sync_snapshot_v50`, `be_final_sync_refresh_v50`, or `be_final_sync_certify_v50`.

### 11.2 Data Entry

`DataEntryPage.tsx` still models a legacy parcel row around `parcel_sequence`, editable `way_id`, and a small set of operational fields. It performs local tariff calculations with hardcoded regional rates and sends legacy save RPC parameters. The page also directly upserts compatibility rows using `pickup_id, parcel_sequence` in one fallback path.

The available updated workbook in the workspace exposes 47 columns, while the issue note states that the authoritative Financial V2 workbook contains 50 columns. The production implementation must use the authoritative workbook/schema version as the contract and must not rely on a hardcoded frontend column count.

### 11.3 Business Development

The active `/biz-dev` route loads `BizDevPage.tsx`, which contains zero-valued KPI cards and an empty prospect register. Other Business Development pages call three different RPC names and are not the active route. These must be consolidated.

### 11.4 Marketing

`MarketingPage.tsx` reads a generic enterprise control-tower snapshot rather than a marketing-specific contract. `MarketingPortalPage.tsx` contains hardcoded leads, KPI values, and daily-focus text.

### 11.5 Mobile

The sidebar labels `/rider-app` as “Mobile Sandbox”, but the route is a real rider operational application with identity resolution, GPS, offline queueing, delivery result RPCs, support requests, and proof capture. An internal support console must be separated from the field rider application.

### 11.6 Admin/HR

`AdminHRPage.tsx` loads snapshots only. Its Add Employee and Manage controls are not connected to secured mutations. It falls back to hardcoded employee records when loading fails.

### 11.7 Accounts

`AccountsPage.tsx` is presentation-only. Create Account, Reset/Block, and Roles & Permissions controls have no data source or mutation workflow.

### 11.8 Production environment

`App.tsx` still imports and routes UAT-named pages and mounts an `EnvironmentBadge`. The implementation of `EnvironmentBadge` and the UAT pages is not included in the supplied archive, so their exact source patches require those files or repository access.

### 11.9 Outsourced delivery and branch handling

Britium uses branches and allied delivery services for destinations that are not served directly. The current business configuration identifies Royal Express, DK Delivery, Arlu Post, Ninja Van, and Safe Delivery Services as external providers; Mandalay is currently handled mainly through DK Delivery and Nay Pyi Taw is branch-managed. The existing production specification does not yet define provider routing, chain of custody, partner tracking, COD remittance, partner settlement, or branch reconciliation.

## 12. Cross-Cutting Engineering Requirements

### 12.1 Backend authority

All identity, tariff, collection, settlement, authorization, account, and workflow-state decisions must be made by the backend. Frontend calculations may be displayed as previews but must never be persisted as trusted final values.

### 12.2 RPC response envelope

New RPCs should return a consistent JSON envelope:

```ts
interface RpcEnvelope<T> {
  ok: boolean;
  build: string;
  generated_at: string;
  data?: T;
  warnings?: Array<{ code: string; message: string; field?: string }>;
  errors?: Array<{ code: string; message: string; field?: string }>;
}
```

### 12.3 Security-definer rules

Every mutation RPC must:

- Use `security definer`.
- Use `set search_path = public`.
- Resolve the actor from `auth.uid()` and the authenticated profile.
- Perform explicit role and module-permission checks.
- Reject disabled, expired, unapproved, or branch-restricted accounts.
- Write an audit event in the same transaction.
- Never trust an actor email or role supplied by the client.

### 12.4 Audit events

Create or standardize an audit table:

```sql
create table if not exists public.be_audit_events (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  action_code text not null,
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid,
  actor_employee_id text,
  branch_code text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);
```

### 12.5 Idempotency

Create, save, approve, certify, payment, resync, and account-admin actions must accept or derive an idempotency key. Duplicate requests must return the original result rather than create duplicate records.

### 12.6 No demonstration data

Production pages must not render hardcoded employees, leads, KPIs, jobs, payments, parcels, or operational events. Empty states must be explicit and must identify the actual failed or empty data source.

## 13. Canonical Way, Pickup, and Merchant Lineage

### 13.1 Canonical identity source

The canonical source for parcel lineage is the Data Entry row keyed by normalized `delivery_way_id`.

Standardize these fields:

- `delivery_way_id`: canonical parcel key.
- `pickup_id`: canonical parent pickup key.
- `merchant_code`: canonical merchant code.
- `wayplan_id`: downstream route assignment, not a lineage source.

The current schema uses both `pickup_id` and `pickup_way_id` terminology. Migration must add or standardize `pickup_id`; `pickup_way_id` may remain as a compatibility alias during the transition.

### 13.2 Shared operational-ID parser

Create one database function and one matching TypeScript helper:

```sql
create or replace function public.be_operational_id_merchant_code(p_value text)
returns text
language sql
immutable
as $$
  select case
    when array_length(regexp_split_to_array(upper(trim(coalesce(p_value,''))), '-'), 1) >= 3
    then array_to_string(
      (regexp_split_to_array(upper(trim(p_value)), '-'))[2:
        array_length(regexp_split_to_array(upper(trim(p_value)), '-'), 1)-1],
      '-'
    )
    else null
  end;
$$;
```

If the confirmed production format guarantees exactly one merchant segment, this may simplify to `split_part(value, '-', 2)`. The same rule must be used by Data Entry, Final Sync, Waybill, Dispatch, and certification.

### 13.3 Refresh logic

Replace any aggregated or arbitrary Pickup ID selection. In particular, do not use `max(pickup_id)`.

The canonical refresh query must join the source row to Data Entry by normalized Way ID:

```sql
left join public.be_data_entry_register_rows de
  on upper(trim(de.delivery_way_id)) = upper(trim(source.delivery_way_id))
```

The refreshed row must take the following values from the same `de` row:

```text
delivery_way_id = de.delivery_way_id
pickup_id       = de.pickup_id or migration-compatible pickup_way_id
merchant_code   = de.merchant_code
```

### 13.4 Server validation

For every row, calculate:

```text
way_merchant_code    = be_operational_id_merchant_code(delivery_way_id)
pickup_merchant_code = be_operational_id_merchant_code(pickup_id)
```

The row is valid only when:

```text
way_merchant_code = pickup_merchant_code = upper(merchant_code)
```

A mismatch must:

- Open or retain one `MERCHANT_CODE_MISMATCH` variance per Way ID.
- Set final sync status to `VARIANCE` or equivalent non-certifiable status.
- Prevent `READY_TO_CERTIFY`.
- Cause `be_final_sync_certify_v50` to fail server-side.
- Never replace the Pickup ID with another grouped value.

### 13.5 Required RPC behavior

#### `be_final_sync_refresh_v50(p_scope text default null)`

Return:

```json
{
  "ok": true,
  "rows_refreshed": 0,
  "variances_opened": 0,
  "variances_resolved": 0,
  "lineage_mismatch_count": 0,
  "build": "FINAL_SYNC_LINEAGE_V51"
}
```

#### `be_final_sync_snapshot_v50(p_filter text, p_limit integer)`

Every row must include:

```text
delivery_way_id
pickup_id
merchant_code
way_merchant_code
pickup_merchant_code
lineage_valid
issue_codes
check_status
certification_stale
```

#### `be_final_sync_certify_v50(...)`

Certification must re-read current canonical lineage inside the transaction. It must not rely on the snapshot or frontend guard.

### 13.6 Historical remediation

1. Run a read-only mismatch audit.
2. Backfill canonical `pickup_id` from the exact Data Entry Way ID row.
3. Refresh Final Sync.
4. Open variances for unresolved or missing Data Entry lineage.
5. Do not auto-certify repaired rows.
6. Record before/after lineage in `be_audit_events`.

### 13.7 Acceptance criteria

- One Way ID can resolve to only one canonical Pickup ID.
- A mismatch cannot be certified through UI, direct RPC, or replayed request.
- No refresh query contains `max(pickup_id)` or an equivalent arbitrary aggregate.
- Refreshing the same scope twice is idempotent.
- Valid rows remain valid and are not reassigned to another pickup.

## 14. Business Development Command Centre

### 14.1 Route consolidation

Replace the active `/biz-dev` page with one production component:

```text
src/pages/BusinessDevelopmentCommandPage.tsx
```

Remove or redirect duplicate Business Development page variants after parity testing. Do not maintain multiple pages calling different dashboard RPCs.

### 14.2 Consolidated RPC

Create:

```sql
be_business_development_command_v54(p_payload jsonb default '{}'::jsonb)
```

Request filters:

```text
period_from
period_to
branch_code
township
merchant_status
owner_employee_id
pipeline_stage
```

Response groups:

```text
summary
volume_series
merchant_segments
merchant_ranking
merchant_growth
pipeline
onboarding
marketing_attribution
customer_service
failed_deliveries
settlements
branches
townships
targets
forecast
capacity_warnings
plans_policies
```

### 14.3 Required tabs

- Executive Summary
- Merchant Growth
- Sales Pipeline
- Marketing Performance
- Customer Service
- Daily Operations
- Plans & Policies

### 14.4 Core metrics

- Daily, weekly, and monthly parcel volume.
- New merchants acquired.
- Active, dormant, and lost merchants.
- Merchant ranking and volume share.
- Pipeline count and value by stage.
- Prospect-to-merchant conversion.
- Merchant onboarding progress.
- Marketing leads and conversions.
- Complaint count and closure time.
- Failed deliveries and exception reasons.
- COD collection and settlement performance.
- Branch and township growth.
- Target versus actual.
- Forecasted volume.
- Operational capacity warnings.

### 14.5 Plans and policies

Create records with:

```text
owner_employee_id
department_code
title
description
target_date
kpi_code
target_value
current_result
status
review_note
approval_status
approved_by
approved_at
```

Mutation RPCs:

```text
be_bd_plan_create_v54
be_bd_plan_update_v54
be_bd_plan_submit_v54
be_bd_plan_approve_v54
be_bd_plan_reject_v54
```

### 14.6 Acceptance criteria

- No KPI is hardcoded.
- Every metric contains a defined source and date range.
- Merchant counts reconcile to the merchant master and parcel facts.
- Drill-down totals equal dashboard totals.
- Empty states distinguish “no records” from “RPC failed”.
- Exported reports use the same filtered dataset as the UI.

## 15. Live Marketing and Marketing Portal

### 15.1 Live Marketing purpose

Route: `/marketing`

Purpose: analytical performance dashboard based on real merchant, parcel, campaign, finance, branch, and township facts.

Create:

```text
be_live_marketing_snapshot_v54(p_payload jsonb)
```

Required content:

- Merchant ranking highest to lowest.
- Merchant volume share.
- Daily, weekly, and monthly volume.
- Sales target versus actual.
- Achievement percentage.
- Merchant acquisition trend.
- Active versus dormant percentages.
- Revenue and COD contribution.
- Branch and township breakdown.
- Fastest-growing and declining merchants.
- Campaign-attributed parcels.
- Exportable merchant performance report.

Use Recharts for supported visualizations, but tables and exports must remain available for exact values.

### 15.2 Marketing Portal purpose

Route: `/marketing-portal`

Purpose: manage the Marketing team’s plans, activities, visits, leads, campaigns, evidence, approvals, and employee performance.

Create snapshot RPC:

```text
be_marketing_portal_snapshot_v54(p_payload jsonb)
```

Create mutation RPCs:

```text
be_marketing_plan_create_v54
be_marketing_plan_update_v54
be_marketing_activity_log_v54
be_marketing_visit_record_v54
be_marketing_lead_create_v54
be_marketing_followup_update_v54
be_marketing_campaign_save_v54
be_marketing_report_submit_v54
be_marketing_manager_review_v54
```

### 15.3 Required operational fields

- Employee.
- Plan date.
- Planned activity.
- Actual activity.
- Merchant visited.
- Lead created.
- Lead source.
- Follow-up commitment and due date.
- Campaign.
- Budget.
- Target merchants.
- Daily and monthly report.
- Evidence attachments.
- Manager comments.
- Approval or rejection status.

### 15.4 Acceptance criteria

- Remove static leads and KPI values.
- Missing RPC data produces a real error state, not demo rows.
- Manager approval is server-authorized and audited.
- Overdue plans and missing reports are calculated from due dates.
- Live Marketing and Marketing Portal do not duplicate responsibilities.

## 16. Mobile Operations

### 16.1 Route separation

Do not replace the real Rider application with an internal support console.

Recommended routing:

```text
/rider-app          Field Rider application; rider-scoped access
/mobile-operations  Internal production support and monitoring console
```

Update the internal sidebar label from “Mobile Sandbox” to “Mobile Operations” and point it to `/mobile-operations`. Hide the field rider route from unrelated internal roles.

### 16.2 Snapshot RPC

Create:

```text
be_mobile_operations_snapshot_v54(p_payload jsonb)
```

Filters:

```text
workforce_code
workforce_type
branch_code
account_status
sync_status
issue_type
```

Return:

- Resolved rider/driver/helper identity.
- Linked account and PIN status.
- Assigned pickups.
- Assigned wayplans.
- Current delivery route.
- Device and browser metadata.
- GPS permission and latest location.
- Camera/photo diagnostics.
- Offline queue count and oldest event.
- Last successful synchronization.
- Failed mobile events.
- Notification status.
- Delivery proof status.
- COD handover status.
- Open support requests.
- Audit history.

### 16.3 Safe actions

Create secured actions:

```text
be_mobile_operations_create_support_v54
be_mobile_operations_safe_resync_v54
be_mobile_operations_retry_event_v54
be_mobile_operations_reset_pin_request_v54
be_mobile_operations_unlock_account_v54
```

Safe resync must replay existing canonical queued events only. It must never create fake jobs, fake deliveries, fake GPS points, or synthetic proof records.

### 16.4 Acceptance criteria

- The support console is read-mostly.
- Every mutation names the real mobile event or account affected.
- Resync is idempotent.
- Rider field actions continue using existing real RPC flows.
- No production route is called “Sandbox”.

## 17. Secured Admin and HR

### 17.1 Remove production fallback data

Remove `FALLBACK_EMPLOYEES` from production behavior. A failed snapshot must display an error and a retry action. It must not display invented employees.

### 17.2 Employee model

Standardize:

```text
employee_id
employee_code
display_name
legal_name
email
phone_primary
department_code
position_code
branch_code
employment_status
employment_start_date
employment_end_date
manager_employee_id
linked_user_id
is_active
created_at
updated_at
```

Create an employment-history table for department, branch, position, manager, and status changes.

### 17.3 Snapshot

Create or finalize:

```text
be_admin_hr_snapshot(p_payload jsonb default '{}'::jsonb)
```

Return employees, departments, positions, branches, application roles, account-link state, and permissions.

### 17.4 Mutation RPCs

```text
be_hr_employee_create_v54
be_hr_employee_update_v54
be_hr_employee_set_status_v54
be_hr_employee_transfer_department_v54
be_hr_employee_change_branch_v54
be_hr_employee_assign_position_v54
be_hr_employee_assign_app_role_v54
be_hr_employee_link_account_v54
be_hr_employee_reset_access_v54
be_hr_employee_history_v54
```

### 17.5 Authorization

- Create/edit/transfer: HR administrator or superadmin.
- App-role assignment and account linking: administrator plus account-security permission.
- Deactivation or termination: HR administrator, with reason and effective date.
- Reset access: authorized security administrator only.
- Users may not mutate their own privileged role or approval state.

### 17.6 Frontend

Connect Add Employee and Manage controls to validated forms. Show before/after confirmation for branch, department, position, active status, and application-role changes.

### 17.7 Acceptance criteria

- Every mutation creates history and audit records.
- Direct client writes to employee/security tables are denied.
- Deactivated employees cannot remain eligible for workforce commission after their employment end date.
- Linked user and employee identities are unique and traceable.
- Export uses current filters and excludes secret account data.

## 18. Accounts and Permissions

### 18.1 Trusted administration boundary

Privileged auth operations must run in a trusted server-side service or Supabase Edge Function using protected administrative credentials. The browser must never receive a service-role key.

Database RPCs may manage requests, profiles, roles, permissions, branches, expiry, and audit records, while the trusted auth-admin service creates users, sends recovery actions, or performs provider-level blocks.

### 18.2 Account states

```text
REQUESTED
PENDING_APPROVAL
ACTIVE
BLOCKED
SUSPENDED
EXPIRED
DEACTIVATED
REJECTED
```

### 18.3 Required operations

- Create account request.
- Approve or reject request.
- Create/link authenticated account.
- Reset password or PIN.
- Block/unblock.
- Activate/deactivate.
- Assign role.
- Assign granular permissions.
- Restrict branch.
- Set account expiry.
- View login history.
- View audit history.

### 18.4 APIs

Trusted server endpoints or Edge Functions:

```text
POST /account-admin/create
POST /account-admin/reset-password
POST /account-admin/reset-pin
POST /account-admin/block
POST /account-admin/unblock
```

Secured database RPCs:

```text
be_account_request_create_v54
be_account_request_review_v54
be_account_profile_update_v54
be_account_role_assign_v54
be_account_permission_assign_v54
be_account_branch_restrict_v54
be_account_expiry_set_v54
be_account_login_history_v54
be_account_audit_history_v54
```

### 18.5 Maker-checker controls

Role assignment to `superadmin`, `admin`, `finance_approver`, or equivalent privileged roles must require a second authorized approver and must not be self-approved.

### 18.6 Frontend

Replace presentation-only buttons with:

- Account registry and filters.
- Account request queue.
- Create/approve modal.
- Status action modal.
- Roles and permissions editor.
- Branch/expiry editor.
- Login and audit history drawers.

### 18.7 Acceptance criteria

- No privileged account is created directly from browser Supabase calls.
- Role and permission changes are transactional and audited.
- Blocked, inactive, expired, or unapproved users cannot access protected routes or mutation RPCs.
- Branch restrictions are enforced server-side.
- Failed auth-admin actions do not leave partially linked employee/profile records.

## 19. Production Environment and UAT Removal

### 19.1 Central environment resolver

Create one resolver:

```ts
export const APP_ENVIRONMENT =
  String(import.meta.env.VITE_APP_ENVIRONMENT || 'PRODUCTION').toUpperCase();

export const IS_PRODUCTION = APP_ENVIRONMENT === 'PRODUCTION';
```

The badge must derive from this resolver. In production it must show `BRITIUM PRODUCTION` or be hidden.

### 19.2 Route policy

In production:

- Remove or hide `/data-entry-uat`.
- Remove or hide `/warehouse-uat`.
- Rename or replace the UAT readiness page with a production readiness/health page.
- Do not import UAT-only modules into the production route registry when they are not permitted.
- Redirect retired routes to the production equivalent with an audit/log message where needed.

### 19.3 Build checks

Add a CI check after `vite build`:

```bash
if grep -R "BRITIUM GO-LIVE UAT" dist; then
  echo "UAT label found in production bundle"
  exit 1
fi
```

Also reject forbidden production sidebar labels such as `Mobile Sandbox`.

### 19.4 Acceptance criteria

- Production hostname never shows a UAT badge.
- UAT-only routes are inaccessible in production.
- Environment labels are not hardcoded in feature pages.
- Development and staging can still expose their correct environment labels.

## 20. Database and API Migration Sequence

### Phase 0 — Inventory and backups

- Export current definitions of all called RPCs.
- Export table schemas, policies, grants, triggers, and dependent views.
- Snapshot mismatch counts and financial totals.
- Record the current production build and migration version.

### Phase 1 — Canonical lineage

- Add shared ID parser.
- Standardize `pickup_id`.
- Correct final-sync refresh and certification guards.
- Audit and backfill lineage.

### Phase 2 — Financial V2

- Add canonical financial columns and compatibility views.
- Deploy calculation, save, import, and waybill RPCs.
- Deploy new Data Entry screen behind a feature flag.
- Reconcile a controlled parcel sample before full rollout.

### Phase 3 — Security

- Deploy audit model and role checks.
- Deploy Admin/HR mutations.
- Deploy trusted account-admin service and account RPCs.
- Remove broad direct-write policies from protected tables.

### Phase 4 — Network fulfillment and outsourced settlement

- Deploy provider, branch, coverage, partner tariff, and status-mapping masters.
- Seed the attached township list as coverage candidates and explicitly classify direct, branch, and outsourced reachability.
- Deploy routing, assignment, manifest, tracking, POD, COD custody, partner settlement, and branch reconciliation RPCs.
- Configure Mandalay-to-DK and Nay Pyi Taw branch-managed rules with effective dates.
- Pilot one provider and one branch before enabling all providers.

### Phase 5 — Operational support and environment

- Add Mobile Operations route and console.
- Separate rider field route.
- Remove UAT presentation and routes from production.

### Phase 6 — Growth dashboards

- Deploy consolidated BD RPC and page.
- Deploy Live Marketing analytics.
- Deploy Marketing Portal workflows.
- Remove static and duplicate pages after validation.

## 21. Testing Strategy

### 21.1 Database tests

- Canonical ID parser tests.
- Lineage mismatch tests.
- Certification rejection tests.
- Financial calculation tests for all amount-entry types.
- Tariff snapshot persistence tests.
- Highway station code/alias resolution and effective-date tests.
- Highway station base-rate tests for Downtown, Bayintnaung, Dagon Thiri, Aung Mingalar, and Parami.
- Highway station surcharge tests using Standard, Royal, and Commitment included-weight rules.
- Rejection tests for free-text or unknown highway stations.
- Idempotency tests.
- Role, branch, expiry, inactive-account, and self-escalation tests.
- Audit atomicity tests.
- Coverage and routing-priority tests.
- Provider tariff snapshot tests.
- Partner tracking event idempotency and out-of-order event tests.
- Manifest parcel-count and acceptance tests.
- COD custody and remittance tests for gross and netted settlement methods.
- Duplicate partner charge and double-payment prevention tests.
- Branch cash reconciliation tests.

### 21.2 Frontend tests

- Active route renders intended page.
- No static demo values appear after RPC failure.
- Read-only server fields cannot be edited.
- Server validation is displayed correctly.
- Mobile Operations and Rider App have distinct role-aware routes.
- Production environment hides UAT routes and text.
- Network Fulfillment shows the managing branch and executing provider separately.
- Partner users cannot access another provider's parcels or rates.
- Merchant users cannot see internal partner costs or branch reconciliation data.

### 21.3 Reconciliation tests

- Final Sync row count equals canonical Data Entry Way count within defined status scope.
- Merchant, branch, township, COD, and settlement drill-down totals equal dashboard totals.
- Data Entry customer collection reconciles to merchant settlement plus company-owned charges.
- Outsourced Ways reconcile customer COD, merchant settlement, Britium revenue, partner expense, and partner remittance.
- Branch COD received reconciles to bank deposits, headquarters transfers, approved expenses, and outstanding cash.
- Partner settlement totals reconcile to approved Way-level tariff snapshots and POD eligibility.

### 21.4 Production smoke tests

- Create and save one Financial V2 parcel.
- Create one Highway Station Drop-Off parcel for each configured station and verify its base rate.
- Verify a 4.2 kg Standard parcel adds two extra kilograms at the active extra-kilogram rate.
- Generate its waybill.
- Refresh Final Sync and verify canonical pickup lineage.
- Attempt certification with a forced mismatch and confirm server rejection.
- Create/update an employee through HR.
- Create and approve a non-privileged account request.
- Load BD, Marketing, Mobile Operations, and Accounts with real empty/error states.
- Route one Mandalay Way to DK Delivery, record manifest acceptance, delivery event, POD, COD remittance, and partner settlement.
- Route one Nay Pyi Taw Way through branch handling and complete branch cash reconciliation.
- Force a provider invoice mismatch and confirm settlement is blocked.

## 22. Deployment Gates

Deployment is blocked when any of the following is true:

- Critical RPC SQL definitions have not been exported and reviewed.
- Backend and workbook Financial V2 schema versions differ.
- Any canonical-lineage mismatch can reach certification.
- The browser can persist trusted financial outputs.
- Admin or Accounts pages can directly write protected security tables.
- Production bundle contains the UAT brand label or Mobile Sandbox label.
- Static leads, employees, or KPI values remain in active production pages.
- A non-direct Way can proceed without a managing branch, executing provider, or handover record.
- Partner settlement can be approved without tariff snapshot, POD eligibility, and COD reconciliation.
- The same partner service charge can be paid by both branch and headquarters.
- Gross COD and partner service fees are stored only as one net value.
- A Highway Station Drop-Off Way can be saved with a free-text, unknown, inactive, or non-effective station rate.

## 23. Rollback

- Keep pre-migration RPC definitions in versioned migration files.
- Use compatibility views and wrappers rather than destructive column removal during first release.
- Feature-flag the Financial V2 page and new dashboards.
- Do not roll back canonical repaired data by restoring arbitrary pickup aggregates.
- Reverse security changes only through reviewed migrations; never re-enable unrestricted direct client writes as a temporary fix.
- Preserve partner tracking events, manifest acknowledgements, POD, COD custody, and settlement audit records during rollback.
- Disable new routing rules through effective dates or feature flags rather than deleting historical provider assignments.

## 24. Required Inputs Before an Exact Production Patch

The supplied archive is sufficient for this implementation specification but not for a safe exact patch. The following definitions/files are called or imported but not included:

- SQL bodies for `be_final_sync_snapshot_v50`, `be_final_sync_refresh_v50`, and `be_final_sync_certify_v50`.
- SQL bodies for the Data Entry calculate/save/waybill RPCs used by `DataEntryPage.tsx`.
- SQL bodies for Business Development and `be_admin_hr_snapshot` RPCs.
- `EnvironmentBadge.tsx`.
- UAT page source files.
- The authoritative workbook referred to as the 50-column Financial V2 contract.
- The complete generated Supabase TypeScript types file.
- Signed or approved rate cards and settlement methods for Royal Express, DK Delivery, Arlu Post, Ninja Van, and Safe Delivery Services.
- Confirmed direct-reach, branch-reach, and partner-reach classifications for every township in the attached list.
- Provider API/webhook specifications, CSV formats, status codes, and POD formats where integrations exist.
- Branch COD handover, cash-expense, and partner-payment ownership policies for Mandalay and Nay Pyi Taw.
- SLA, redelivery, return, loss/damage, tax, and dispute terms for every provider contract.

Before code patching, export these definitions from the active production database/repository and compare their signatures with the frontend callers.

## 25. Definition of Done

The integrated program is complete only when all of the following are true:

1. Customer collection, Britium tariff, merchant settlement, branch share, provider cost, COD custody, employee commission, and company margin are separate and reconciled.
2. The backend recalculates and snapshots every financial result.
3. Financial V2 Data Entry, import, waybill, settlement, and adjustment workflows share one versioned contract.
4. Merchant-declared delivery excess/shortfall is handled only through merchant settlement.
5. Naypyitaw’s active branch rule is versioned, approved, and batch-settled.
6. Highway Station Drop-Off parcels use the approved station matrix (4,000 MMK for Downtown, Bayintnaung, and Dagon Thiri; 3,000 MMK for Aung Mingalar and Parami) plus the standard Britium surcharges.
7. Mandalay parcels use the Britium 6,000 MMK customer tariff plus approved Britium surcharges, while highway and DK costs are recorded separately.
8. Royal Express customer rates, discounted partner rates, COD fees, and monthly rebates are separate components and are not double-counted.
9. Missing or ambiguous provider rates block partner settlement.
10. COD custody and remittance reconcile at Way, manifest, batch, and accounting levels.
11. Referral commission is generated once per eligible completed Way only while both employment and referral assignment are effective.
12. Canonical Way/Pickup/merchant lineage is enforced server-side.
13. Business Development, Marketing, Mobile Operations, Admin/HR, and Accounts use live secured data and real mutations.
14. Production contains no UAT-only route, sandbox label, hardcoded operational data, or browser-selectable privilege mode.
15. All workflows pass database, API, UI, security, reconciliation, migration, rollback, and production smoke tests.

---

# Part III — Open Business Decisions and Activation Checklist

## 26. Mandatory Confirmations Before Production Activation

| Decision | Current status | Blocking effect |
|---|---|---|
| Authoritative Financial V2 field count and schema version (47 vs 50 observed) | Pending | Blocks import and Data Entry activation |
| NPT management fee basis | Proposed: 10% of branch allocated share | Blocks NPT financial activation without approval |
| Which Britium surcharges are branch-shareable | Pending | Defaults to net system delivery charge only |
| DK area-to-band mapping from diagram | Must be transcribed and approved | Blocks unresolved DK areas |
| DK 500 vs 1,000 MMK surcharge conditions | Ambiguous in source | Blocks automatic surcharge calculation |
| Highway bus allocation method | Pending Finance approval | Blocks Mandalay partner batch finalization |
| Royal COD fee billing owner | Pending | Fee must not be added to customer automatically |
| Royal monthly rebate calculation base | Not stated in quotation | Rebate remains estimated, not posted |
| Royal quotation effective-date interpretation | Quotation dated May 2026; form displays effective 1 Jan 2025 | Requires contract-owner confirmation |
| Provider tax/withholding treatment | Pending | Blocks final payable/tax entries |
| Exact eligible delivery statuses for referral commission | Proposed delivered/drop-off/completed | Requires HR/Finance approval |
| Future branch-to-branch settlement | Engine-ready, disabled | Cannot be selected until contract approved |
| Highway station tariff effective-from date | Rates confirmed; production effective date to be configured | Prevents retroactive rate application |

## 27. Activation Checklist

- Approved tariff and partner-contract imports completed.
- Effective dates and version IDs confirmed.
- Historical snapshots and compatibility views deployed.
- Actor, role, branch, and maker-checker permissions tested.
- Settlement opening balances reconciled.
- COD custody owners assigned.
- Partner tracking/status maps configured.
- POD rules configured.
- Missing-rate and missing-breakdown blocks tested.
- Finance, Operations, Branch, and Merchant UAT completed in non-production.
- Production bundle scanned for UAT/demo/sandbox content.
- Rollback scripts and backups verified.

---

# Appendix A — Delivery Collection Method Catalogue

| No. | Collection method |
|---:|---|
| 1 | Delivery Charge Only |
| 2 | Delivery Charge + Extra Weight |
| 3 | Delivery Charge + Extra Volume |
| 4 | Delivery Charge + Extra Weight/Volume |
| 5 | COD Item Price Only |
| 6 | COD Item Price + Delivery Charge |
| 7 | COD Item Price + Delivery + Extra KG |
| 8 | COD Item Price + Delivery + Extra CBM |
| 9 | COD Item Price + All Delivery Surcharges |
| 10 | Fixed Total Amount, Delivery Included |
| 11 | Fixed Total Amount, Delivery Excluded |
| 12 | Customer-Specified Total Amount |
| 13 | Partial Prepayment + Balance COD |
| 14 | Deposit Collection |
| 15 | Remaining Item Balance Only |
| 16 | Remaining Balance + Delivery |
| 17 | Remaining Balance + Delivery + Surcharges |
| 18 | Merchant Pays Delivery |
| 19 | Customer Pays Delivery |
| 20 | Shared Delivery Charge |
| 21 | Free Delivery |
| 22 | Conditional Free Delivery |
| 23 | Surcharge Only |
| 24 | Re-delivery Charge |
| 25 | Return or Exchange Charge |
| 26 | Cash COD Collection |
| 27 | Cashless COD Collection |
| 28 | Pay at Pickup |
| 29 | Exact Collection - No Additional Charges |
| 30 | Exact Collection + Approved Surcharges |

These business descriptions map into the five canonical backend amount-entry types plus explicit ownership and surcharge fields. The system should avoid creating 30 separate calculation engines.

# Appendix B — Core Enums

```text
CustomerTier:
STANDARD | ROYAL | COMMITMENT

AmountEntryType:
ITEM_PRICE_PLUS_DECLARED_DELIVERY
TOTAL_AMOUNT_INCLUDING_DELIVERY
DELIVERY_CHARGE_ONLY
EXACT_COLLECTION_AMOUNT
ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT

SettlementDirection:
CREDIT_TO_MERCHANT
DEDUCT_FROM_MERCHANT
NO_ADJUSTMENT
BREAKDOWN_REQUIRED

FulfillmentMode:
BRITIUM_DIRECT
BRANCH_DIRECT
THIRD_PARTY_OUTSOURCED
BRANCH_THIRD_PARTY

PartnerCodes:
DK_DELIVERY
ROYAL_EXPRESS
ARLU_POST
NINJA_VAN
SAFE_DELIVERY_SERVICES

ValidationStatus:
OK | REVIEW | ERROR
```

# Appendix C — Accounting Event Catalogue

```text
CUSTOMER_COLLECTION
MERCHANT_ITEM_PAYABLE
MERCHANT_DELIVERY_EXCESS_CREDIT
MERCHANT_DELIVERY_SHORTFALL_DEBIT
BRITIUM_DELIVERY_REVENUE
BRANCH_GROSS_SHARE
BRANCH_MANAGEMENT_FEE
BRANCH_PENALTY
HIGHWAY_TRANSPORT_COST
PARTNER_LAST_MILE_COST
PARTNER_COD_FEE
PARTNER_DISCOUNT_MARGIN
PARTNER_REBATE_ACCRUAL
PARTNER_REBATE_CONFIRMED
PARTNER_COD_RECEIPT
PARTNER_COD_REMITTANCE
EMPLOYEE_REFERRAL_COMMISSION
PAYMENT
PAYMENT_REVERSAL
ADJUSTMENT
```

# Appendix D — Source Excerpts and Rate-Card Import Notes

## D.1 DK Delivery

The supplied single-page diagram contains Mandalay-area rate bands of 2,000, 2,500, and 3,000 MMK. It also contains a note indicating an additional 500/1,000 MMK charge where the parcel exceeds the stated 2 kg or one-foot-size condition. The exact 500-versus-1,000 decision is not defined clearly enough for automatic implementation and remains pending confirmation.

## D.2 Royal Express

Quotation reference `Q-019-05-2026`, dated 22 May 2026, provides:

- A 15% discount on standard rates.
- Partner rates for 0.1-3 kg.
- A next-1-kg charge by route/zone.
- COD fee of 195 MMK up to 300,000 MMK product amount.
- COD fee of 0.2% above 300,000 MMK.
- Monthly rebate access of 5%, 10%, and 15% for 1,000+, 2,000+, and 3,000+ completed Waybills.
- COD transfer within two to three days after successful delivery.
- Service-city and price-change caveats.

The full route matrix must be imported as an effective-dated partner rate card. It should not be copied into application code.

## D.3 Highway Station Drop-Off Matrix

The management-confirmed Highway Station Drop-Off tariff matrix is:

| Station | Base rate |
|---|---:|
| Highway Station Drop Off (Downtown) | 4,000 MMK |
| Bayintnaung Drop Off | 4,000 MMK |
| Hlaing Thar Yar - Dagon Thiri Highway Station Drop Off | 4,000 MMK |
| North Okkalapa - Aung Mingalar Highway Station Drop Off | 3,000 MMK |
| Parami Highway Station Drop Off | 3,000 MMK |

The standard Britium customer-tier, extra-kilogram, CBM, Commitment-refund, audit, and historical-snapshot rules apply.

## D.4 Highway Station Drop-Off Acceptance Examples

### Downtown basic parcel

```text
station = HW_DOWNTOWN
customer_tier = STANDARD
actual_weight = 1.0 kg
base_rate = 4,000 MMK
extra_weight = 0 kg
expected_net_system_charge = 4,000 MMK
```

### Dagon Thiri with extra weight

```text
station = HW_DAGON_THIRI
customer_tier = STANDARD
actual_weight = 4.2 kg
chargeable_weight = 5 kg
included_weight = 3 kg
extra_weight = 2 kg
weight_surcharge = 1,000 MMK
expected_gross_system_charge = 5,000 MMK
```

### Aung Mingalar Royal tier

```text
station = HW_AUNG_MINGALAR
customer_tier = ROYAL
actual_weight = 4.2 kg
included_weight = 5 kg
extra_weight = 0 kg
expected_gross_system_charge = 3,000 MMK
```

### Unknown station

```text
station = FREE_TEXT_UNKNOWN_STATION
expected_validation_status = ERROR
expected_exception = HIGHWAY_STATION_RATE_NOT_FOUND
waybill_creation = BLOCKED
```

# Appendix E — Implementation Artefacts

The following existing workstream artefacts remain useful implementation inputs:

- `parcel_data_entry_updated.xlsx`
- `merchant_referral_commission_patch.sql`
- `WorkforceCommissionPage_updated.tsx`
- `production_remediation_developer_spec_v3_partner_rates.md`
- `branch_office_settlement_npt_spec.md`
- `outsourced_delivery_settlement_dk_royal_spec.md`
- `BranchOfficePage(2).tsx`
- DK Delivery and Royal Express source PDFs
