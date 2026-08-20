# Parcel Financial V2 implementation package

Build: `PARCEL_FINANCIAL_V2_BACKEND_2026-07-31`

## Files

- `parcel_data_entry_financial_v2_fixed.xlsx` — corrected import/data-entry workbook.
- `parcel_financial_v2_backend.sql` — additive PostgreSQL/Supabase migration, calculator, recalculation, financial lock, settlement ledger and audit.
- `parcel_financial_v2_tests.sql` — seven required calculator tests.

## Workbook corrections

The fixed workbook adds the missing fields:

- `merchant_settlement_adjustment`
- `calculation_version`
- `calculated_at`

It repairs shifted formulas, adds the exact-collection example, documents trusted/untrusted import fields, and marks server-calculated values as previews. The backend must ignore imported calculated values.

## Installation order

1. Back up the database and run the SQL in a controlled environment.
2. Review the 168 tariff rows seeded from the supplied `Tariff_Master` sheet.
3. Seed `be_merchant_financial_profiles_v2` for every merchant before calling recalculation.
4. Run `parcel_financial_v2_tests.sql`.
5. Update the parcel create/import service to save only raw inputs, then call `be_recalculate_parcel_financial_v2`.
6. Update waybill printing to use stored `cod_amount` and call `be_lock_parcel_financial_v2` after a successful print.
7. Settle only through `be_settle_parcel_financial_v2` after delivery.

## Important integration rule

Do not pass spreadsheet values for `cod_amount`, tariffs, calculated weights, differences, settlement, validation, version or timestamp into trusted database updates. They are preview columns and must be overwritten by the backend.

## Known schema assumption

The migration uses existing `public.parcels` columns `id`, `way_id`, `merchant_id`, `township`, `item_price`, `delivery_charges`, `cod_amount`, `weight_kg`, `status`, and `created_at`. It aborts if `public.parcels` is missing. Review column types in staging before production.
