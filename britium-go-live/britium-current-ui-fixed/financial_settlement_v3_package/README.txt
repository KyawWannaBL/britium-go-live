BRITIUM FINANCIAL SETTLEMENT V3 - PRODUCTION PACKAGE

Contents
- sql/20260731_financial_settlement_v3.sql
- sql/verify_financial_settlement_v3.sql
- payload/FinanceMerchantSettlementPage.tsx
- apply_financial_settlement_v3.mjs
- verify_financial_settlement_v3.mjs

Purpose
- Adds draft/review/approval/payment workflow over the existing
  be_v_finance_merchant_settlement_queue_v2 calculation source.
- Keeps Parcel Financial V2 server calculations as the financial source of truth.
- Adds maker-checker approval, partial payments, statements, holds, disputes and audit history.
- Separates Finance and merchant access through a database access table and JWT metadata.
- Final full payment calls the existing be_finance_settle_batch_v2 RPC so the canonical parcel
  settlement state is updated only after the payment is fully confirmed.

Install order
1. Extract this package.
2. From the portal repository root run:
   node /path/to/apply_financial_settlement_v3.mjs
3. In Supabase SQL Editor execute sql/20260731_financial_settlement_v3.sql.
4. Add the actual Finance users to the access table, for example:

   insert into public.be_finance_settlement_access_v3(email, access_role)
   values ('YOUR_FINANCE_EMAIL', 'FINANCE_ADMIN')
   on conflict (email) do update set access_role=excluded.access_role, active=true, updated_at=now();

5. Execute sql/verify_financial_settlement_v3.sql.
6. Run:
   node /path/to/verify_financial_settlement_v3.mjs
   rm -rf dist node_modules/.vite
   npm run build
7. Deploy production with:
   npx vercel --prod

Important
- Do not remove or replace be_v_finance_merchant_settlement_queue_v2.
- Do not remove or replace be_finance_settle_batch_v2.
- The migration is additive. It does not alter Parcel Financial V2 calculation formulas.
- The legacy finalizer is invoked only when a batch reaches full confirmed payment.
- Merchant users must have a merchant_id in be_finance_settlement_access_v3 or JWT metadata.
