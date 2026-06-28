# Britium Data Entry Register Now + Wayplan Cleanup Patch

## What this patch changes

### Data Entry
Replaces the wide Data Entry grid with a compact **REGISTER NOW** workflow.

The visible user-entry columns are now only:

1. Recipient Name
2. Contact No. (1)
3. Contact No. (2)
4. Township
5. Recipient Address
6. Customer Tier
7. Item Price
8. Weight
9. Remark / Special Instruction
10. Save

The red **COD** column is removed from the screen and from the Excel template.

The system still keeps `cod_amount` internally for downstream Waybill / Warehouse / Wayplan / Finance sync. It is calculated from `Item Price`, so users do not type COD manually anymore.

### Excel Template
The old `parcels.xlsx` flow is replaced by:

`Britium_DataEntry_Register_Now_Template.xlsx`

This workbook contains only the required Register Now columns and no COD column.

### Wayplan screens
These duplicated screens are redirected to the single consolidated page:

- `/way-management`
- `/way-management-plan`
- `/wayplan-zone`
- `/wayplan-go-live`

Use only:

`/wayplan-command`

Recommended sidebar name:

`Wayplan Command Center`

## Files

Copy these files into your project:

```txt
src/pages/DataEntryPage.tsx
src/App.tsx
src/pages/WayManagementPage.tsx
src/pages/WayManagementPlanPage.tsx
src/pages/WayplanZonePage.tsx
src/pages/WayplanManagementGoLivePage.tsx
public/templates/Britium_DataEntry_Register_Now_Template.xlsx
```

Patch file mapping:

```txt
DataEntryPage.tsx                       -> src/pages/DataEntryPage.tsx
App.wayplan_cleanup.tsx                 -> src/App.tsx
WayManagementPage.tsx                   -> src/pages/WayManagementPage.tsx
WayManagementPlanPage.tsx               -> src/pages/WayManagementPlanPage.tsx
WayplanZonePage.tsx                     -> src/pages/WayplanZonePage.tsx
WayplanManagementGoLivePage.tsx         -> src/pages/WayplanManagementGoLivePage.tsx
Britium_DataEntry_Register_Now_Template.xlsx -> public/templates/Britium_DataEntry_Register_Now_Template.xlsx
```

## Required npm package

The Data Entry page uses Excel upload/download through `xlsx`.

```bash
npm install xlsx
```

## Deploy

```bash
npm run build
npx vercel --prod
```

Then hard refresh:

```txt
Ctrl + Shift + R
```

## Verification

1. Open `/data-entry`.
2. Select a pickup request.
3. Click **REGISTER NOW**.
4. Confirm only the yellow Register Now columns appear.
5. Confirm there is no COD column.
6. Click **Register Template.xlsx** and verify the downloaded Excel has no COD column.
7. Open `/way-management`, `/way-management-plan`, `/wayplan-zone`, or `/wayplan-go-live`; each should redirect to `/wayplan-command`.

## Notes

The hidden calculation still saves:

- delivery fee
- surcharge
- cod_amount
- actual_collect

Users only enter operational information needed for registration.
