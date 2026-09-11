# Britium Branch Office + Merchant Onboarding Patch

## Purpose

This patch creates a production-ready Branch Office Portal based on the uploaded branch portal/tariff module, but wired to the current Supabase backend.

Branch office users can now:

- create/update branch office records,
- submit new merchants from a web form,
- bulk upload merchants from an Excel template,
- calculate branch delivery tariff,
- view service areas,
- track pending/approved/rejected merchant requests.

Branches do **not** need Supabase/backend access.

## Final page

Keep this page:

```txt
Branch Office Portal -> /branch-office
```

## Files

```txt
BranchOfficePortalPage.tsx                    -> src/pages/BranchOfficePortalPage.tsx
branch_office_merchant_onboarding_sync.sql    -> run in Supabase SQL Editor
Britium_Branch_Merchant_Upload_Template.xlsx  -> public/templates/Britium_Branch_Merchant_Upload_Template.xlsx
App.branch_office_route_snippet.tsx           -> route snippet
Sidebar.branch_office_menu_snippet.tsx        -> menu snippet
PickupForm.branch_merchant_options_snippet.ts -> optional merchant dropdown merge
branch_office_verification.sql                -> post-install verification
```

## Backend objects created

```txt
be_branch_offices
be_branch_staff
be_branch_merchant_registry
be_branch_merchant_onboarding_requests
be_branch_service_areas
be_branch_tariffs
be_v_branch_merchant_options
be_v_branch_office_dashboard
```

## RPC functions

```txt
be_branch_office_portal_snapshot()
be_upsert_branch_office()
be_branch_submit_merchant_registration()
be_branch_bulk_submit_merchants()
be_branch_review_merchant_registration()
be_branch_calculate_delivery_fee()
```

## Workflow

```txt
Branch staff fill form or upload Excel
    ↓
Merchant request is saved as PENDING
    ↓
HQ/Admin approves or rejects
    ↓
Approved merchant is inserted into be_branch_merchant_registry
    ↓
Pickup Form can load from be_v_branch_merchant_options
```

## Install

1. Run:

```txt
branch_office_merchant_onboarding_sync.sql
```

2. Copy files:

```txt
BranchOfficePortalPage.tsx -> src/pages/BranchOfficePortalPage.tsx
Britium_Branch_Merchant_Upload_Template.xlsx -> public/templates/Britium_Branch_Merchant_Upload_Template.xlsx
```

3. Add route:

```tsx
<Route path="/branch-office" element={<BranchOfficePortalPage />} />
```

4. Add sidebar item:

```txt
Branch Office -> /branch-office
```

5. Install dependency if missing:

```bash
npm install xlsx
```

6. Deploy:

```bash
npm run build
npx vercel --prod
```

## Verify

Run:

```sql
select public.be_branch_office_portal_snapshot('YGN-MAIN', 'testbranch_office_manager@britiumexpress.com');
```

Then run the verification file:

```txt
branch_office_verification.sql
```

## Notes

- The Excel template creates approval requests only. It does not directly insert merchants into live master records.
- The branch merchant registry is separated from old demo/mock data.
- Existing Pickup Form can be patched to include `be_v_branch_merchant_options` using the included snippet.
