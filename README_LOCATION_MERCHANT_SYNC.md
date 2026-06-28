# Go-Live Location + Merchant Synchronization Patch

## Purpose

This patch centralizes township/city and merchant auto-fill behavior across the Enterprise Portal and Rider App.

It fixes these go-live issues:

1. Township and city fields must use the same township master data everywhere.
2. Users must get suggestions while typing township names to avoid spelling mistakes.
3. Once a merchant is selected, merchant code, address, phone, township, city, region/state, zone, branch, business type, and payment terms must auto-fill.
4. Screens must not keep local hardcoded township arrays.

This supports the go-live rule that all departments act on one canonical backend record instead of disconnected local form data.

## Files to copy

Copy these files into your project:

```txt
src/lib/locationMerchantSync.ts
src/components/common/SmartTownshipCityField.tsx
src/components/common/MerchantAutoFillField.tsx
```

Optional full example replacement:

```txt
src/pages/PickupFormPage.golive.tsx
```

Rename it to:

```txt
src/pages/PickupFormPage.tsx
```

only after checking the Supabase import path.

## Backend sources used

The helper checks these backend sources in order:

### Township

```txt
be_township_master
be_master_townships
township_master
be_master_data_options where dropdown_name = township
```

### Merchant

```txt
be_master_data_page_snapshot
be_merchant_master
be_master_merchants
merchant_master
```

The component still has safe fallback township data so screens do not crash if master data is temporarily unavailable.

## Township/city replacement pattern

Replace every township/city input/select with:

```tsx
import SmartTownshipCityField from '@/components/common/SmartTownshipCityField';

<SmartTownshipCityField
  township={form.township}
  city={form.city}
  required
  townshipLabel={t('Township', 'မြို့နယ်')}
  cityLabel={t('City', 'မြို့')}
  onPatch={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
/>
```

For table rows, use:

```tsx
<SmartTownshipCityField
  township={row.township || row.delivery_township || row.town || ''}
  city={row.city || row.destination_city || ''}
  showCity={false}
  inputClassName="w-full bg-transparent border border-transparent group-hover:border-[#1a3a5c] p-1.5 rounded outline-none"
  labelClassName="hidden"
  onPatch={(patch) => {
    updateRow(i, 'township', patch.township);
    updateRow(i, 'city', patch.city);
    updateRow(i, 'region_state', patch.region_state || '');
    updateRow(i, 'zone', patch.zone || '');
    updateRow(i, 'branch_code', patch.branch_code || '');
  }}
/>
```

## Merchant auto-fill replacement pattern

Replace merchant select/input with:

```tsx
import MerchantAutoFillField from '@/components/common/MerchantAutoFillField';

<MerchantAutoFillField
  value={form.merchant_name ? `${form.merchant_code} - ${form.merchant_name}` : ''}
  required
  label={t('Merchant / Customer', 'ကုန်သည်')}
  onSelect={(_, patch) => setForm((prev) => ({ ...prev, ...patch }))}
/>
```

This auto-fills:

```txt
merchant_code
merchant_name
business_type
payment_terms
contact_person
phone_primary
phone_secondary
email
pickup_address
address_line_1
township
city
region_state
zone
branch_code
customer_tier
base_fee
delivery_charge
```

## Pages that must use these components

Apply the township/city component to every field named:

```txt
township
merchant_township
delivery_township
pickup_township
city
merchant_city
delivery_city
destination_city
pickup_city
```

Apply merchant auto-fill to merchant selectors in:

```txt
PickupFormPage.tsx
WaybillStudioPage.tsx
DataEntryPage.tsx
MerchantPortalPage.tsx
CustomerServicePortalPage.tsx
SupervisorPickupPage.tsx
Rider App pickup/delivery edit screens
```

## Important rule

Do not use local arrays such as:

```tsx
const TOWNSHIPS = [...]
const FALLBACK_TOWNSHIPS = [...]
<option>North Dagon</option>
```

inside page files anymore.

All township/city values must come through `SmartTownshipCityField`, which reads the township master and writes the canonical spelling back to the form.

## Build test

```bash
npm run build
```

If TypeScript complains about Supabase generated types, keep `(supabase as any)` in the helper.
