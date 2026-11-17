/** CI-only: restore historical finance source to a disposable migration replay.
 * Extracted from 20260804_financial_v2_payment_settlement_v61_8_1.sql,
 * earlier than 20260827070905 patch, never current Production finance definition.
 * The source is deliberately kept with its original CRLF body for the legacy
 * migration's pg_get_functiondef exact-text replacement.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const migration=fileURLToPath(new URL('../supabase/migrations/20260827070905_fix_declared_delivery_settlement_v61_8_2.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_financial_v61_8_1_historical_rehearsal_only.sql',import.meta.url));
const original=fs.readFileSync(migration,'utf8');
const historical=fs.readFileSync(fixture,'utf8');
const fn='be_calculate_parcel_financial_v2';
const sought="v_customer_delivery_surcharges := case\r\n    when v_type in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY')\r\n      then v_backend_delivery_surcharges\r\n    else 0\r\n  end;";
if(!original.includes("Target financial calculation function was not found")) throw Error('Unexpected target migration');
if(!historical.includes("create or replace function public."+fn+"(")) throw Error('Wrong historical finance fixture');
if(!historical.includes(sought)||!historical.includes('PARCEL_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1')) throw Error('Historical V61.8.1 marker or exact CRLF patch block missing');
fs.writeFileSync(migration,historical+'\n'+original);
console.log('CI-only: inserted historical finance function before August 27 exact text patch.');
