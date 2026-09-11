import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const lib = new URL('../src/lib/', import.meta.url);
const temp = mkdtempSync(join(tmpdir(), 'national-location-'));
try {
  for (const name of ['postalCodeData', 'postalCodeResolver', 'myanmarAddressConverter', 'dataEntryServiceProviderRouting']) {
    const source = readFileSync(new URL(`${name}.ts`, lib), 'utf8').replace(/@\/lib\/([A-Za-z0-9]+)/g, './$1.mjs');
    writeFileSync(join(temp, `${name}.mjs`), stripTypeScriptTypes(source));
  }
  const { POSTAL_CODE_ROWS: rows, POSTAL_CODE_TOWNSHIPS: towns, POSTAL_CODE_REGIONS: regions } = await import(pathToFileURL(join(temp, 'postalCodeData.mjs')));
  const { resolvePostalCode: resolve, searchMasterLocations: search } = await import(pathToFileURL(join(temp, 'postalCodeResolver.mjs')));
  const { resolveDataEntryServiceProvider: route } = await import(pathToFileURL(join(temp, 'dataEntryServiceProviderRouting.mjs')));
  assert.equal(rows.length, 17331);
  assert.equal(regions.length, 18);
  let checked = 0;
  for (const [ti, quarter, code, quarterMm] of rows) {
    const [en, mm] = towns[ti];
    if (en === '-') continue;
    for (const township of [en, mm]) {
      const result = resolve('', township, { postalCode: code });
      assert.equal(result.postalCode, code.padStart(7, '0'), `${township}: ${code}`);
      assert.equal(result.township, en);
      assert.equal(result.quarterMm, quarterMm);
    }
    checked++;
  }
  assert.equal(checked, 17298);
  assert(search('0501001').some(x => x.postalCode === '0501001'));
  assert(search('အင်းစိန်').some(x => x.township.includes('Insein')));
  assert(search('Hlaingtharya').some(x => x.township.includes('East')));
  assert(search('Hlaingtharya').some(x => x.township.includes('West')));
  assert(search('', 500).length <= 50);
  assert.equal(resolve('', '', {ward: 'No (1) Quarter'}).matchLevel, 'UNRESOLVED');
  assert.equal(resolve('', 'Insein', {postalCode: '0501001'}).township, 'Insein Township');
  assert.equal(resolve('', 'Unknown', {postalCode: '0501001'}).matchLevel, 'UNRESOLVED');
  assert.equal(route('', '', [], {postalCode:'0501001'}).providerCode, 'DK DELIVERY');
  assert.equal(route('Unknown', '', [], {postalCode:'0501001'}).township, 'Unknown');
  assert.equal(route('unmatched input', '', [], {fallbackUnknownToRoyal:true}).providerCode, '');
  assert.equal(route('unmatched input', '', [], {fallbackUnknownToRoyal:true}).township, 'unmatched input');
  assert.equal(route('Pyinmana', '', []).providerCode, 'NPT BRANCH');
  const rates = [{destination_key:'HLAING',destination_name:'လှိုင်',provider_code:'BRITIUM'}];
  assert.equal(route('Hlaing', 'Mandalay', rates).providerCode, 'BRITIUM');
  assert.equal(route('Hlaingtharya (West)', '', []).providerCode, 'BRITIUM');
  console.log(`PASS: ${checked} bilingual master locations, postal evidence, ambiguous wards, manual Unknown and core routing.`);
} finally {
  rmSync(temp, {recursive:true, force:true});
}
