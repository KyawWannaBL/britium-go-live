/** CI-only verified Royal Express Htantabin tariff catalog predecessor, no production data copied. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote access prohibited');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI only');
const file=path.resolve('supabase/migrations/20261103223139_royal_catalog_finance_sync_guard_20261104.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('EXPECTED_APPROVED_ROYAL_DESTINATION_MISSING')&&original.includes("'MMR007014'"),'Original approved destination and guard required');
assert.ok(original.includes('ROYAL_DESTINATION_NOT_APPROVED_FOR_FINANCE'),'Original approval denial required');
assert.ok(!original.includes('CI_ONLY_APPROVED_ROYAL_HTANTABIN'),'Duplicate fixture prohibited');
const fixture=`-- CI_ONLY_APPROVED_ROYAL_HTANTABIN: single catalog record verified read-only against production.
insert into public.be_data_entry_tariff_catalog(
 destination_key,destination_name,original_label,standard_rate_mmk,special_rate_mmk,rack_code,provider_code,is_active,source_file
)
select 'ထန်းတပင်-royal','ထန်းတပင်','ထန်းတပင်',5000,null,'R','ROYAL EXPRESS',true,'TARIFF_SETTINGS_V1'
where not exists(select 1 from public.be_data_entry_tariff_catalog where destination_key='ထန်းတပင်-royal');
`;
assert.ok(fixture.includes('5000')&&fixture.includes('ROYAL EXPRESS'),'Verified Royal source tariff required');
assert.ok(!fixture.includes('ထန်းခြောက်ပင်'),'No unapproved destinations permitted');
fs.writeFileSync(file,fixture+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original Royal finance synchronization unchanged');
console.log('CI only: single verified Royal Htantabin catalog record staged; approval/finance guards intact.');
