# Britium Express Finance COD Settlement V48

## Purpose

V48 activates the next controlled workflow after Rider V46 delivery:

```text
DELIVERED
→ synchronize delivered COD records
→ compare expected COD, collected amount, Rider remittance, payment mode and proof
→ READY_TO_SETTLE or ON_HOLD
→ post audited settlement
→ finance-settled legacy records and journal entries
```

The active route remains:

```text
/cod-settlement
```

## Important controls

- Only Rider V46 `DELIVERED` stops enter the settlement queue.
- Expected COD comes from the canonical Warehouse/Data Entry amount.
- Settlement cannot be posted unless proof is present and Rider remittance matches expected COD.
- Shortages, overages, missing proof, payment mismatch and suspected duplicate postings remain `ON_HOLD`.
- Every remittance, hold and settlement action creates an audit event.
- Direct table mutation is not granted to browser roles; the page uses controlled RPCs.
- Successful settlements synchronize the existing COD ledger, financial settlement, delivery-waybill finance status and journal tables when those legacy objects exist.

## Package contents

```text
finance_cod_settlement_v48.sql
verify_finance_cod_v48.sql
install_finance_cod_v48.mjs
verify_finance_cod_v48.mjs
src/pages/CODSettlementPage.V48.tsx
src/pages/CODSettlementPage.tsx
```

## Deployment

### 1. Run the backend SQL

Run the complete file in Supabase SQL Editor:

```text
finance_cod_settlement_v48.sql
```

The final verification result should show:

```text
be_finance_cod_snapshot_v48(text,integer)
be_finance_cod_sync_v48(text)
be_finance_cod_record_remittance_v48(text,numeric,text,text,text,timestamptz,text,text,text)
be_finance_cod_hold_v48(text,text,text,text)
be_finance_cod_settle_v48(text,numeric,text,text,timestamptz,text,text)
be_finance_cod_settle_batch_v48(text[],text,text,text,text)
be_finance_cod_status_v48(text)
be_finance_cod_settlements_v48
```

You can also run:

```text
verify_finance_cod_v48.sql
```

### 2. Install the frontend

Extract the ZIP directly beside `package.json` and `src`, then run:

```bash
node install_finance_cod_v48.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_finance_cod_v48.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY FINANCE COD SETTLEMENT V48
```

Then deploy:

```bash
npx vercel --prod
```

## Production test

1. Complete one COD parcel as `DELIVERED` in Rider V46.
2. Open `/#/cod-settlement`.
3. Select **Sync Delivered COD**.
4. Confirm the delivered Way ID appears with expected COD and proof status.
5. Record the Rider remittance, payment mode, handover reference, Finance receiver and proof reference.
6. Confirm an exact remittance becomes `READY_TO_SETTLE`.
7. Post settlement and confirm it becomes `SETTLED`.
8. Test a shortage or overage and confirm it remains `ON_HOLD`.
9. Test a missing proof and confirm settlement is blocked.
10. Export CSV and verify the audit references are present.

## Notes

- A delivered COD record with no remittance stays `PENDING_REMITTANCE`.
- A delivered COD record with no proof stays `PENDING_PROOF`.
- A zero-COD delivery becomes `NOT_REQUIRED`.
- Batch settlement processes only rows already marked `READY_TO_SETTLE`; failed rows are returned individually without hiding successful rows.
