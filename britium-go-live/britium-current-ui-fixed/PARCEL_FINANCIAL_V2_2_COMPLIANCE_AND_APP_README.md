# Parcel Financial V2.2 — Compliance Review and App Integration

## Current result

The V2.2 installation marker confirms that the SQL objects were created. It
does not by itself prove:

- Data Entry save/apply behavior;
- settlement eligibility and idempotency;
- role authorization;
- frontend route visibility;
- production browser behavior.

## Important correction

`actual_collect` must not be pre-filled during Data Entry with the expected
`cod_amount`. `cod_amount` is the amount expected from the receiver.
`actual_collect` is an execution/finance outcome and should only be recorded
when collection is actually confirmed.

Run:

```sql
parcel_financial_v2_2_1_compliance_hardening.sql
```

Expected audit:

- `missing_parcel_columns = []`
- `tariff_rows = 168`
- `public_execute_findings = []`
- `anon_execute_findings = []`
- `data_entry_actual_collect_is_not_prefilled = true`

## App and sidebar integration

The supplied `App.tsx` contains the Sidebar inline; there is no separate
Sidebar component in that file. The installer updates both the protected route
and the inline Finance sidebar group.

Place `FinanceMerchantSettlementPage.tsx` in:

```text
src/pages/FinanceMerchantSettlementPage.tsx
```

Then run:

```bash
node patch_parcel_financial_v2_2_app_route.mjs \
  && rm -rf dist node_modules/.vite \
  && npm run build \
  && node verify_parcel_financial_v2_2_app_route.mjs
```

Expected route:

```text
#/finance-merchant-settlement
```

Expected sidebar:

```text
Finance & Accounts
└─ Merchant Settlement
```

## Data Entry template note

The pasted header omits these required calculated/audit fields:

- `merchant_settlement_adjustment`
- `calculation_version`
- `calculated_at`

They must be included in internal export/audit views. They must not be editable
client inputs.

`monthly_ways` may be stored as a backend snapshot, but the frontend and Excel
import must not supply it as a trusted value.

## Scenario note

The 4,500 MMK examples are valid for a 4,500 MMK tariff destination such as
North Okkalapa. They are not the universal Yangon tariff. The tariff source
also contains 4,000 MMK Yangon rows, 3,000/4,000 drop-off rows, and 6,000 MMK
Mandalay/Nay Pyi Taw rows.
