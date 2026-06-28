# Replacement snippets for existing pages

## DataEntryPage table township cell

Replace the township `<select>` inside the row table with:

```tsx
<SmartTownshipCityField
  township={row.town}
  city={row.destination}
  showCity={false}
  inputClassName="w-full bg-transparent text-[#eef8ff] border border-transparent p-1.5 rounded outline-none focus:border-[#f6b84b]"
  labelClassName="hidden"
  onPatch={(patch) => {
    handleUpdate(i, 'town', patch.township);
    handleUpdate(i, 'destination', patch.city);
  }}
/>
```

Add import:

```tsx
import SmartTownshipCityField from '@/components/common/SmartTownshipCityField';
```

## WarehousePage row township cell

Replace the township `<input>` inside the row table with:

```tsx
<SmartTownshipCityField
  township={row.township}
  city={row.city || ''}
  showCity={false}
  inputClassName="w-full bg-transparent border border-transparent group-hover:border-[#1a3a5c] p-1.5 rounded outline-none"
  labelClassName="hidden"
  onPatch={(patch) => {
    updateRow(i, 'township', patch.township);
    updateRow(i, 'city', patch.city);
    updateRow(i, 'zone', patch.zone || row.zone);
  }}
/>
```

## WaybillStudioPage merchant field

Replace merchant `<select>` with:

```tsx
<MerchantAutoFillField
  value={quick.merchant_name ? `${quick.merchant_code} - ${quick.merchant_name}` : ''}
  required
  label={t('Merchant', 'ကုန်သည်')}
  onSelect={(_, patch) => setQuick((prev: any) => ({ ...prev, ...patch }))}
/>
```

Add import:

```tsx
import MerchantAutoFillField from '@/components/common/MerchantAutoFillField';
```

## WaybillStudioPage township/city fields

Replace township/city selects with:

```tsx
<SmartTownshipCityField
  township={quick.township}
  city={quick.city}
  required
  townshipLabel={t('Township', 'မြို့နယ်')}
  cityLabel={t('City', 'မြို့')}
  onPatch={(patch) => setQuick((prev: any) => ({ ...prev, ...patch }))}
/>
```

## MerchantPortalPage template rows

When converting uploaded rows, canonicalize township:

```tsx
import { findTownship, loadTownshipMaster, townshipToFormPatch } from '@/lib/locationMerchantSync';

const townshipMaster = await loadTownshipMaster();

const normalized = parsed.map((row) => {
  const match = findTownship(townshipMaster, row.merchant_township || row['Merchant Township']);
  return {
    ...row,
    merchant_township: match?.township_name || row.merchant_township,
    merchant_city: match?.city || row.merchant_city,
    region_state: match?.region_state,
    zone: match?.zone,
    branch_code: match?.branch_code,
  };
});
```

## Rider App location fields

Use the same component in rider pickup/delivery failure/reschedule forms:

```tsx
<SmartTownshipCityField
  township={form.township}
  city={form.city}
  required
  onPatch={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
/>
```
