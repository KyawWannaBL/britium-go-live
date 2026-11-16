/** CI-only production-catalog verified empty ground settlement confirmations predecessor. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','No remote DB');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI only');
const file=path.resolve('supabase/migrations/20261031095042_cs_pickup_and_private_source_isolation.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('private.be_ground_settlement_confirmation_review_v1')&&original.includes('private.be_ground_settlement_confirmations_v1'),'Expected original isolation view');
assert.ok(!original.includes('CI_ONLY_EMPTY_GROUND_SETTLEMENT_CONFIRMATIONS'),'Already staged');
const sql=`-- CI_ONLY_EMPTY_GROUND_SETTLEMENT_CONFIRMATIONS: production catalog columns, constraints and RLS. No settlement records copied.
create table private.be_ground_settlement_confirmations_v1(
 source_sha256 text not null,
 delivery_way_id text not null,
 confirmation_no text not null unique,
 source_sheet text not null,
 source_row integer not null,
 ground_business_date date not null,
 ground_final_cod_mmk numeric(18,2),
 ground_cash_mmk numeric(18,2),
 ground_kpay_mmk numeric(18,2),
 source_check text not null,
 ground_status text not null default 'MANAGEMENT_REPORTED_SETTLED'::text,
 finance_status text not null default 'PENDING_FINANCE_RECONCILIATION'::text,
 ground_recorded_at timestamptz not null default now(),
 finance_verified_by uuid,
 finance_verified_at timestamptz,
 finance_payment_reference text,
 finance_note text,
 constraint ci_ground_settlement_confirmations_pk primary key(source_sha256,delivery_way_id),
 constraint ci_ground_settlement_finance_evidence check(finance_status<>'FINANCE_RECEIPT_VERIFIED' or (finance_verified_by is not null and finance_verified_at is not null and length(btrim(coalesce(finance_payment_reference,'')))>=6)),
 constraint ci_ground_settlement_finance_state check(finance_status in ('PENDING_FINANCE_RECONCILIATION','FINANCE_RECEIPT_VERIFIED')),
 constraint ci_ground_settlement_management_status check(ground_status='MANAGEMENT_REPORTED_SETTLED')
);
alter table private.be_ground_settlement_confirmations_v1 enable row level security;
revoke all on table private.be_ground_settlement_confirmations_v1 from public,anon,authenticated;
`;
assert.ok(!/\binsert\s+into\b/i.test(sql),'No historic settlement rows permitted');
fs.writeFileSync(file,sql+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original historical source isolation retained');
console.log('CI only: catalog-verified empty private settlement confirmations predecessor, RLS fail closed.');
