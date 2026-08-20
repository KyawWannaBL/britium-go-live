# Data Entry Township Autocomplete + Wayplan Screen Cleanup Patch

## Purpose

This patch improves the Data Entry user experience and removes overlapping Wayplan screens.

## Data Entry changes

Use:

```txt
src/pages/DataEntryPage.tsx
```

New behavior:

- `REGISTER NOW` keeps the data-entry table focused on only required user-entry fields.
- `Customer Tier` is hidden from the UI and Excel template.
- Customer tier is still saved internally as `Standard`.
- The red `COD` input column remains removed.
- COD is still calculated internally from `Item Price` for downstream Waybill / Warehouse / Wayplan / Finance sync.
- Township is now a searchable autocomplete combobox, not a fixed/deletable select box.
- Staff can type partial Myanmar or English text, for example:
  - `တ`
  - `တောင်`
  - `Dagon`
  - `ဥက္ကလာ`
- Matching township names appear in a dropdown.
- Staff must select the valid township from the dropdown before saving, preventing spelling variants from entering reporting data.
- Column widths are optimized:
  - Address is wider.
  - Item Price / Weight / phone columns are narrower.
  - Remark is medium width.
  - Customer Tier is hidden.

## Excel template changes

Use:

```txt
public/templates/Britium_DataEntry_Register_Now_Template.xlsx
```

The template contains only:

```txt
Recipient Name
Contact No. (1)
Contact No. (2)
Township
Recipient Address
Item Price
Weight
Remark / Special Instruction
```

No `Customer Tier` column.
No `COD` column.

The workbook also includes a Township List sheet and dropdown validation for the Township column.

## Wayplan cleanup

Keep only:

```txt
Wayplan Command Center
/wayplan-command
```

Remove/hide these menu items:

```txt
Way Management
Way Management Plan
Wayplan Zone
Wayplan Management Go Live
```

The redirect files are included:

```txt
WayManagementPage.tsx
WayManagementPlanPage.tsx
WayplanZonePage.tsx
WayplanManagementGoLivePage.tsx
```

Each redirects users to `/wayplan-command`.

## Copy files

```txt
DataEntryPage.tsx                       -> src/pages/DataEntryPage.tsx
App.wayplan_cleanup.tsx                 -> src/App.tsx
WayManagementPage.tsx                   -> src/pages/WayManagementPage.tsx
WayManagementPlanPage.tsx               -> src/pages/WayManagementPlanPage.tsx
WayplanZonePage.tsx                     -> src/pages/WayplanZonePage.tsx
WayplanManagementGoLivePage.tsx         -> src/pages/WayplanManagementGoLivePage.tsx
Britium_DataEntry_Register_Now_Template.xlsx -> public/templates/Britium_DataEntry_Register_Now_Template.xlsx
```

## Deploy

```bash
npm install xlsx
npm run build
npx vercel --prod
```

After deployment:

```txt
Ctrl + Shift + R
```

## UAT check

1. Open `/data-entry`.
2. Select pickup.
3. Click `REGISTER NOW`.
4. Type `တောင်` in Township.
5. Dropdown should show names such as:
   - `တောင်ဥက္ကလာပ`
   - `ဒဂုံမြို့သစ်တောင်ပိုင်း`
   - `မင်္ဂလာတောင်ညွန့်`
6. Select one township.
7. Save row.
8. Generate Waybill.
9. Continue Warehouse → Wayplan Command Center.
