/** CI-only pre-Mandalay baseline for the tariff-location resolver.
 * Restored from production function structure with October injected code removed;
 * original migration applies its own MDY_EXPLICIT_ALIAS_PRIORITY_V1 patch.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI only');
const file=path.resolve('supabase/migrations/20261029191139_mandalay_explicit_area_rate_selection.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('MDY_EXPLICIT_ALIAS_PRIORITY_V1'),'Expected original alias patch');
assert.ok(original.includes("Expected 168 owner-confirmed staged Mandalay rates"),'Owner tariff guard required');
assert.ok(!original.includes('CI_ONLY_TARIFF_LOOKUP_PREDECESSOR'),'No repeated staging');
const baseline=`-- CI_ONLY_TARIFF_LOOKUP_PREDECESSOR: exact pre-patch function semantics; original patch retained.
create or replace function public.be_financial_v2_tariff_location_key_v61_7_1(p_value text)
returns text language plpgsql stable parallel safe set search_path to 'public','pg_temp' as $uat_tariff_lookup$
declare
  v text := public.be_financial_v2_normalize_township_text_v61_7(p_value);
  v_code text;
  v_key text;
begin
  if v = '' then return null; end if;
  v_code := public.be_financial_v2_township_code_v61_7(p_value);
  if v_code is not null then return v_code; end if;
  select a.location_key into v_key
  from public.be_tariff_location_alias_v61_7_1 a
  where a.normalized_alias=v
  limit 1;
  return v_key;
end
$uat_tariff_lookup$;
`;
assert.ok(!baseline.includes('MDY_EXPLICIT_ALIAS_PRIORITY_V1'),'Owner alias patch must run in original migration');
fs.writeFileSync(file,baseline+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original approved migration preserved');
console.log('CI only: source-verified pre-patch tariff lookup staged; original Mandalay priority patch remains enabled.');
