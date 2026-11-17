/** CI-only: enable real pg_cron extension before original Rider Finance outbox scheduler. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote DB prohibited');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI only');
const file=path.resolve('supabase/migrations/20261106191447_rider_delivery_finance_outbox_v1_20261107.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes("select cron.schedule(\n  'be-delivery-finance-outbox-v1'"),'Original durable finance outbox scheduling required');
assert.ok(original.includes('DATABASE_SCHEDULER_ONLY')&&original.includes('revoke all on function public.be_delivery_finance_outbox_process_v1()'),'Original scheduler-only authorization required');
assert.ok(!original.includes('CI_ONLY_ENABLE_REAL_PG_CRON'),'No repeated staging');
const sql=`-- CI_ONLY_ENABLE_REAL_PG_CRON: install actual extension, not a simulated scheduler.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
`;
assert.ok(!sql.includes('create function cron.schedule'),'Fake scheduler prohibited');
fs.writeFileSync(file,sql+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original outbox and cron job migration unchanged');
console.log('CI only: real pg_cron extension required for original finance outbox schedule.');
