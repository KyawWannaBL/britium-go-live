/** Stage original owner-approved Mandalay tariff import in disposable CI only.
 * The source is an existing reviewed repository SQL asset; no rates invented.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','Only disposable GitHub Actions');
const originalSource=fs.readFileSync(path.resolve('scripts/import-mandalay-approved-tariffs.sql'),'utf8');
const target=path.resolve('supabase/migrations/20261029191139_mandalay_explicit_area_rate_selection.sql');
const original=fs.readFileSync(target,'utf8');
const fingerprint='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb';
assert.ok(original.includes("Expected 168 owner-confirmed staged Mandalay rates"),'Original guard missing');
assert.ok(originalSource.includes(fingerprint)&&original.includes(fingerprint),'Approval fingerprint mismatch');
assert.ok(originalSource.includes("'owner_rate_confirmation','CONFIRMED'"),'Source owner confirmation absent');
assert.ok(originalSource.startsWith('begin;\n'),'Import transaction header changed');
const tail="commit;\nselect customer_tier,status,is_active,count(*) as rows,min(base_delivery_fee) as min_fee,max(base_delivery_fee) as max_fee from public.tariff_master where metadata->>'source_sha256'='"+fingerprint+"' group by customer_tier,status,is_active;\n";
assert.ok(originalSource.endsWith(tail),'Original import footer changed');
const staging=originalSource.slice('begin;\n'.length,originalSource.length-tail.length);
assert.ok(staging.includes('insert into public.tariff_master'),'Original approved tariff insert required');
assert.ok(!staging.toLowerCase().includes('delete from'),'No destructive tariff changes permitted');
assert.ok(!original.includes('CI_ONLY_OWNER_APPROVED_MDY_TARIFF_IMPORT'),'Duplicate fixture');
fs.writeFileSync(target,'-- CI_ONLY_OWNER_APPROVED_MDY_TARIFF_IMPORT: original reviewed source; no live data copied.\n'+staging+'\n'+original);
assert.ok(fs.readFileSync(target,'utf8').endsWith(original),'Original guarded migration preserved');
console.log('CI-only approved tariff source staged; 168-rate guard remains fail-closed.');
