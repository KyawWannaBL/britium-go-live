BRITIUM EXPRESS - DATA ENTRY MINIMAL CLEAN UX V61.6
Build: PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03

Purpose
- Show one parcel at a time.
- Show only operator-editable core fields on the main page.
- Put parcel weight before collection and final charges.
- Hide backend-only fields, tariff cards, processing labels and suggestions.
- Show exactly three final summary cards.
- Keep optional adjustments and proof review collapsed.
- Preserve the editable full-screen 50-column review sheet.
- Preserve the verified V61.5 backend and all six payment types.
- Do not enable financial writes.

Install from repository root
1. node ./data_entry_minimal_clean_ux_v61_6_patch/apply_data_entry_minimal_clean_ux_v61_6.mjs .
2. node ./data_entry_minimal_clean_ux_v61_6_patch/verify_data_entry_minimal_clean_ux_v61_6.mjs .
3. rm -rf dist node_modules/.vite
4. npm run build
5. node ./data_entry_minimal_clean_ux_v61_6_patch/verify_dist_data_entry_minimal_clean_ux_v61_6.mjs .
6. npx vercel --prod

No SQL migration is required for V61.6. The V61.5 backend migration and verifier must already be green.
