/** CI-only fix for missing Master Data catalog seed in historical replay.
 * No remote connection, no main branch change, no production data import.
 * An August 28 migration inserts fleet_master rows, and relies on an
 * earlier catalog configuration not represented in versioned history.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../supabase/migrations/20260828012127_fleet_master_reconciliation_v1.sql',import.meta.url));
const source=fs.readFileSync(file,'utf8');
if(!source.includes("with approved_fleet(record_key, payload) as (") ||
   !source.includes("'fleet_master', record_key, payload, 'ACTIVE'")) {
  throw new Error('Unrecognized fleet reconciliation; refusing CI overlay');
}
const overlay=[
  '-- CI-only: restore missing fleet catalog metadata before historical fleet reconciliation.',
  "INSERT INTO public.be_master_data_tabs (dataset_key, sheet_name, display_name_en, display_name_mm, category, primary_key, sort_order, active)",
  "VALUES ('fleet_master', 'Fleet_Master (EN)', 'Fleet Master', 'Fleet Master', 'Fleet', 'fleet_id', 6, true)",
  'ON CONFLICT (dataset_key) DO NOTHING;',
  ''
].join('\n');
fs.writeFileSync(file,overlay+source);
console.log('CI-only: added verified fleet_master catalog row before reconciliation.');
