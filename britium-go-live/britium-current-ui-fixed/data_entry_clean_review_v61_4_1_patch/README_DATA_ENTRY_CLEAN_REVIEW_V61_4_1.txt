Britium Express Data Entry Clean Review V61.4.1

CORRECTION IN THIS BUILD
- V61.4 normalized the UI value to "north dagon" but did not recognize tariff-master spellings such as "Dagon Myo Thit (North)".
- V61.4.1 resolves directional Dagon aliases by stable code and semantic direction tokens in English/Myanmar.
- No tariff amount, tariff row, historical parcel, mutation mode or financial-write gate is changed.
- The clean registration screen and editable 50-field review sheet from V61.4 are preserved.

Britium Express - Data Entry Clean Review V61.4.1
Build date: 2026-08-03
Target: production portal

PURPOSE
1. Fix approved township aliases so Dagon Myothit (North) resolves the same active tariff as North Dagon.
2. Preserve Standard, Royal and Commitment tariff differences.
3. Keep the V61.3.3 customer-paid surcharge pass-through rule.
4. Place parcel weight and surcharge calculation before final charges.
5. Remove non-editable backend fields from the main registration form.
6. Add a full-screen review sheet before save and waybill readiness checks.
7. Let Data Entry staff amend editable cells directly in the review sheet.
8. Keep all server-controlled values read-only.
9. Keep mutation mode and financial write activation unchanged.

PACKAGE CONTENTS
- patch/src/pages/DataEntryFinancialV2Page.tsx
- sql/20260803_financial_v2_township_alias_v61_4_1.sql
- sql/verify_financial_v2_township_alias_v61_4_1.sql
- sql/rollback_financial_v2_township_alias_v61_4_1.sql
- apply_data_entry_clean_review_v61_4_1.mjs
- verify_data_entry_clean_review_v61_4_1.mjs
- verify_dist_data_entry_clean_review_v61_4_1.mjs

MANDATORY ORDER
A. Run the complete backend migration SQL in Supabase SQL Editor.
B. Confirm its final JSON has ok=true.
C. Run the complete backend verifier SQL.
D. Confirm its final JSON has ok=true.
E. Run the frontend installer from the portal root.
F. Run the source verifier.
G. Run npm run build.
H. Run the dist verifier.
I. Deploy with npx vercel --prod only after all previous gates pass.

BACKEND MIGRATION
Open and copy the complete contents of:
  sql/20260803_financial_v2_township_alias_v61_4_1.sql
Do not paste the file path into SQL Editor.

Expected North Dagon Standard 10 kg test:
- item price: 50,000 MMK
- merchant declared delivery: 6,000 MMK
- included weight: 3 kg
- extra weight: 7 kg
- weight surcharge: 3,500 MMK
- customer COD: 59,500 MMK
- Britium entitlement: active North Dagon Standard base tariff plus 3,500 MMK
- mutation mode remains MUTATION_SHADOW
- financial writes remain disabled

FRONTEND INSTALLATION
From the portal root:
  node ./data_entry_clean_review_v61_4_1_patch/apply_data_entry_clean_review_v61_4_1.mjs .
  node ./data_entry_clean_review_v61_4_1_patch/verify_data_entry_clean_review_v61_4_1.mjs .

BUILD AND DIST VERIFICATION
  rm -rf dist node_modules/.vite
  npm run build
  node ./data_entry_clean_review_v61_4_1_patch/verify_dist_data_entry_clean_review_v61_4_1.mjs .

DEPLOYMENT
  npx vercel --prod

SAFETY
- The installer backs up the current page under production_backups.
- The frontend patch does not execute SQL, build or deploy.
- The backend migration does not modify tariff rows or historical parcel rows.
- The rollback restores the exact pre-V61.4.1 calculation function from the recorded backup.
- Financial writes are not enabled by this package.
