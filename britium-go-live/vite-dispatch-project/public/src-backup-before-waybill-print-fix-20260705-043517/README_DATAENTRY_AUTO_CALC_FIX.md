# Data Entry Auto Calculation Fix

## Files

- `dataentry_auto_calculation_fix.sql`
- `DataEntryPage.auto_calc_fixed.tsx`

## What this fixes

The Data Entry grid now recalculates immediately when staff changes:

- Township
- Customer Tier
- Item Price
- Weight
- Destination

Calculated fields:

- Base Fee
- Surcharge
- Total Deli Fee
- COD
- Actual Collect

## Formula used for go-live

- Yangon/YGN base fee: 4,000 MMK
- Mandalay/MDY base fee: 6,000 MMK
- Naypyitaw/NPT base fee: 6,000 MMK
- Standard tier includes 3 kg
- Royal tier includes 5 kg
- Extra rounded-up kg surcharge: 500 MMK per kg
- COD = Item Price
- Actual Collect = Item Price + Total Deli Fee

## Apply

1. Run `dataentry_auto_calculation_fix.sql` in Supabase SQL editor.
2. Replace `src/pages/DataEntryPage.tsx` with `DataEntryPage.auto_calc_fixed.tsx`.
3. Build and deploy:

```bash
npm run build
npx vercel --prod
```

## Verify backend RPC

```sql
select public.be_calculate_tariff('North Dagon', 'Standard', 3, 50000);
select public.be_calculate_tariff('North Dagon', 'Standard', 4, 50000);
select public.be_calculate_tariff('Pyin Oo Lwin', 'Standard', 4, 50000);
select public.be_calculate_tariff('North Dagon', 'Royal', 6, 50000);
```
