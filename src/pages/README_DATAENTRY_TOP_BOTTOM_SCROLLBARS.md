# Data Entry Top & Bottom Scrollbars Patch

## Purpose
Adds synchronized horizontal scrollbars to the Data Entry web template form.

## Changes
- Adds a top horizontal scrollbar above the registration table.
- Adds a bottom horizontal scrollbar below the registration table.
- Synchronizes top scrollbar, table scroll, and bottom scrollbar.
- Keeps the horizontal rider-photo strip above the template.
- Keeps multi-line Recipient Address and Remark / Special Instruction fields.

## Install
Copy:

```txt
DataEntryPage.tsx -> src/pages/DataEntryPage.tsx
```

Then deploy:

```bash
npm run build
npx vercel --prod
```

Hard refresh:

```txt
Ctrl + Shift + R
```

## Expected result
Data entry staff can scroll the wide registration form from both the top and bottom of the table without losing row visibility.
