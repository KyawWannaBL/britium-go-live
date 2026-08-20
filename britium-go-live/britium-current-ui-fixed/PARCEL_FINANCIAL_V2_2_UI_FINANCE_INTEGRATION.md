# Parcel Financial V2.2 — Data Entry and Finance Integration

## Release units

1. Install `parcel_financial_v2_2_ui_finance_bridge.sql`.
2. Add `ParcelFinancialV2Editor.tsx` under `src/components/data-entry/`.
3. Add `FinanceMerchantSettlementPage.tsx` under `src/pages/`.
4. Integrate the editor into each Data Entry parcel row.
5. Add a route such as `/finance-merchant-settlement` for the Finance page.

## Data Entry row state

Add these fields to the active `DataEntryRow` type:

```ts
amount_entry_type: AmountEntryType;
delivery_charges: number | null;
merchant_stated_total_amount: number | null;
additional_customer_charge: number;
cbm_surcharge: number;
other_surcharge: number;
merchant_payable_charges: number;
other_merchant_credits: number;
financial_quote?: ParcelFinancialQuoteV2 | null;
```

Default values:

```ts
amount_entry_type: "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
delivery_charges: 0,
merchant_stated_total_amount: null,
additional_customer_charge: 0,
cbm_surcharge: 0,
other_surcharge: 0,
merchant_payable_charges: 0,
other_merchant_credits: 0,
financial_quote: null,
```

Render the editor below or beside the recipient fields:

```tsx
<ParcelFinancialV2Editor
  merchantId={selectedPickup?.merchant_code || ""}
  township={row.town}
  actualWeightKg={row.weight}
  value={row}
  quote={row.financial_quote}
  onChange={(financial) => setRows((old) => old.map((item, n) => n === i ? { ...item, ...financial, saved: false } : item))}
  onQuote={(financial_quote) => setRows((old) => old.map((item, n) => n === i ? {
    ...item,
    financial_quote,
    base_fee: Number(financial_quote?.base_tariff || 0),
    surcharge: Number(financial_quote?.weight_surcharge || 0),
    deli_fee: Number(financial_quote?.net_system_delivery_charge || 0),
    cod: Number(financial_quote?.cod_amount || 0),
    actual_collect: Number(financial_quote?.cod_amount || 0),
  } : item))}
/>
```

## Save sequence

After the existing base recipient row save succeeds, call:

```ts
await supabase.rpc("be_data_entry_save_financial_row_v2", {
  p_pickup_id: selectedPickupId,
  p_parcel_sequence: row.id,
  p_delivery_way_id: row.way_id,
  p_merchant_id: selectedPickup?.merchant_code || null,
  p_payload: {
    township: row.town,
    customer_tier: row.customer_tier || row.tier,
    amount_entry_type: row.amount_entry_type,
    item_price: row.item_price,
    weight_kg: row.weight,
    delivery_charges: row.delivery_charges,
    merchant_stated_total_amount: row.merchant_stated_total_amount,
    additional_customer_charge: row.additional_customer_charge,
    cbm_surcharge: row.cbm_surcharge,
    other_surcharge: row.other_surcharge,
    merchant_payable_charges: row.merchant_payable_charges,
    other_merchant_credits: row.other_merchant_credits,
  },
});
```

After the waybill/parcel creation RPC completes, apply the stored raw inputs to each created parcel:

```ts
for (const row of rows) {
  const { error } = await supabase.rpc("be_data_entry_apply_financial_to_parcel_v2", {
    p_delivery_way_id: row.way_id,
    p_authorized_by: null,
    p_reason: "DATA_ENTRY_WAYBILL_CREATED",
  });
  if (error) throw error;
}
```

Do not trust imported `cod_amount`, tariff, difference, or settlement values. Import only the raw financial inputs and let the quote/save RPC recalculate.

## Excel input headers

Add:

- Customer Tier
- Amount Entry Type
- Merchant Declared Delivery Charge
- Merchant Stated Total Amount
- Additional Customer Charge
- CBM Surcharge
- Other Surcharge
- Merchant Payable Charges
- Other Merchant Credits

Do not import calculated values as trusted fields.

## Finance route

In `src/App.tsx`:

```tsx
const FinanceMerchantSettlementPage = safeLazy(() => import("@/pages/FinanceMerchantSettlementPage"));
```

Add:

```tsx
<Route path="/finance-merchant-settlement" element={<FinanceMerchantSettlementPage />} />
```

## Required controlled dry run

1. Data Entry: merchant delivery above tariff.
2. Data Entry: merchant delivery below tariff.
3. Total amount including delivery.
4. Delivery paid by merchant.
5. Exact collection: confirm `REVIEW` and settlement block.
6. Deliver a test parcel.
7. Finance: settle it once.
8. Repeat settlement: confirm idempotency/no duplicate ledger payment.
9. Verify customer collection = merchant settlement + company delivery revenue + company-owned additional charge.
