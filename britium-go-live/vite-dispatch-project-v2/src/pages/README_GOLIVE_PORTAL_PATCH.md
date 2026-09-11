# Britium Go-Live Portal Replacement Files

Files included:
- SupervisorPortalPage.tsx
- MerchantPortalPage.tsx
- Britium_Merchant_Web_Template.xlsx

Deployment:
1. Replace `src/pages/SupervisorPortalPage.tsx` with `SupervisorPortalPage.tsx`.
2. Replace `src/pages/MerchantPortalPage.tsx` with `MerchantPortalPage.tsx`.
3. Copy `Britium_Merchant_Web_Template.xlsx` to `public/templates/Britium_Merchant_Web_Template.xlsx`.
4. Confirm these backend APIs/tables:
   - be_master_data_page_snapshot
   - be_mobile_workforce_accounts
   - be_portal_pickup_request_items
   - be_assign_pickup_workforce
   - be_portal_cargo_events
   - be_register_merchant_template_upload
   - be_submit_merchant_template_rows
5. Run `npm run build`.

Notes:
- Supervisor no longer uses mock fleet data.
- Rider, driver, helper, and fleet masters are loaded from backend.
- Merchant template upload supports Excel through storage + backend RPC.
- CSV upload can be preview-calculated in-browser.
