# Parcel Financial V2.2.1 — App, Sidebar, and Backend Hardening

## Result review

The V2.2 installation JSON confirms that the functions and view were created. It does not prove security, calculation behavior, Data Entry collection state, or settlement execution.

V2.2.1 corrects these issues:

- PostgreSQL's default `PUBLIC` function execution was not revoked.
- Data Entry wrote `actual_collect = cod_amount` before any receiver collection occurred.
- A client could submit a different `p_actor` UUID to the settlement batch RPC.
- Duplicate parcel IDs could inflate the batch parcel count.
- A settlement batch UUID could be reused.
- Parcel application relied only on `parcels.way_id` rather than resolving compatible Delivery Way fields.

## Install backend correction

```sql
parcel_financial_v2_2_1_hardening.sql
```

Then run:

```sql
parcel_financial_v2_2_1_verify.sql
```

Required verification values:

```text
quote_test_ok = true
save_does_not_write_actual_collect = true
batch_requires_authenticated_actor = true
batch_blocks_actor_spoof = true
batch_deduplicates_ids = true
public_can_execute_batch = false
anon_can_execute_batch = false
authenticated_can_execute_batch = true
```

## Frontend files

Copy:

```text
App.tsx
  -> src/App.tsx

Sidebar.tsx
  -> src/components/layout/Sidebar.tsx

FinanceMerchantSettlementPage.V2_2_1.tsx
  -> src/pages/FinanceMerchantSettlementPage.tsx

ParcelFinancialV2Editor.V2_2_1.tsx
  -> src/components/data-entry/ParcelFinancialV2Editor.tsx
```

The App route is:

```text
/finance-merchant-settlement
```

The Sidebar adds **Merchant Settlement V2** under **Finance & Accounts**.

## Build

```bash
rm -rf dist node_modules/.vite
npm run build
```

Then open:

```text
/#/finance-merchant-settlement
```

Do not execute a live settlement until the queue contains a controlled `DELIVERED`, `validation_status=OK`, non-settled test parcel.
