# Data Entry Upload Button Fix

Replace `src/pages/DataEntryPage.tsx` with `DataEntryPage.upload_fixed.tsx`.

This patch makes the Upload button open a file picker and import `.xlsx`, `.xls`, or `.csv` rows into the Data Entry template.

It preserves existing Rider proof/photo rows and merges uploaded values by DeliveryWay ID or parcel sequence.

## Required dependency

If the project does not already have SheetJS installed, run:

```bash
npm install xlsx
```

Then build:

```bash
npm run build
npx vercel --prod
```

## Verification

Before deployment, search for the upload handler:

```powershell
Get-ChildItem .\src -Recurse -Include *.tsx,*.ts | Select-String "handleTemplateUpload|uploadInputRef"
```
