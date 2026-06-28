# Data Entry horizontal rider proof + multiline address/remark patch

## Purpose

This patch updates the Data Entry registration screen for operator visibility.

## Changes

- Moves the Rider Photo Verification panel from the left vertical column to a horizontal strip above the Data Entry template.
- Frees the left side of the page so the registration grid gets the full screen width.
- Keeps proof cards horizontally scrollable.
- Changes Recipient Address from a single-line input to a multi-line textarea.
- Changes Remark / Special Instruction from a single-line input to a multi-line textarea.
- Keeps township autocomplete and REGISTER NOW workflow unchanged.

## Install

Copy:

```text
DataEntryPage.tsx -> src/pages/DataEntryPage.tsx
```

Then deploy:

```bash
npm run build
npx vercel --prod
```

Hard refresh after deployment:

```text
Ctrl + Shift + R
```
