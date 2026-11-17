/** CI ONLY: stage original 2026-08-03 township V61.4.1 resolver before Sep11.
 * Source is historical clean-review patch, not current Production V61.7 wrapper.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../britium-current-ui-fixed/data_entry_clean_review_v61_4_1_patch/sql/20260803_financial_v2_township_alias_v61_4_1.sql',import.meta.url));
const dest=fileURLToPath(new URL('../supabase/migrations/20260911000203_align_approved_standard_tariffs_and_exact_destination_keys.sql',import.meta.url));
const s=fs.readFileSync(source,'utf8'),target=fs.readFileSync(dest,'utf8');
const beginning='create or replace function public.be_financial_v2_township_key_v61_4_1(p_value text)';
const i=s.indexOf(beginning),j=s.indexOf('$normalize$;',i);
if(i<0||j<0||s.indexOf(beginning,i+beginning.length)!==-1)throw Error('Unexpected V61.4.1 canonical source');
const definition=s.slice(i,j+'$normalize$;'.length);
if(!definition.includes('immutable')||!definition.includes('north dagon'))throw Error('Historical normalization logic changed');
if(!target.includes('public.be_financial_v2_township_key_v61_4_1(p_value)'))throw Error('Unexpected September tariff target');
fs.writeFileSync(dest,'-- CI-only historical August 3 township normalization prerequisite.\n'+definition+'\n'+target);
console.log('CI-only: original V61.4.1 township normalizer staged before Sep11 tariff lookup.');
