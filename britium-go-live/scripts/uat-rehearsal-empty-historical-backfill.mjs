/** CI ONLY: an exact historical data repair has no work in an empty fresh DB.
 * Preserve every original guard for partial/existing September data.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export function scopeEmptyHistory(original){
 const anchor='  if (select count(*) from public.be_portal_pickup_requests where pickup_id=any(v_allowed)) <> 9 then';
 if(original.split(anchor).length!==2||!original.includes('Historical pickup reconciliation amount mismatch'))throw Error('Unexpected V208 historical safety contract');
 if(original.includes('-- CI_ONLY_EMPTY_HISTORY_SCOPE'))throw Error('Refusing repeated history scope staging');
 return original.replace(anchor,`  -- CI_ONLY_EMPTY_HISTORY_SCOPE
  if not exists (select 1 from public.be_portal_pickup_requests where pickup_id=any(v_allowed)) then
    if exists(select 1 from public.be_commission_records where ref_id=any(v_allowed))
       or exists(select 1 from public.be_workforce_wallet_ledger where pickup_id=any(v_allowed))
       or exists(select 1 from public.be_commission_events where pickup_id=any(v_allowed) or source_key=any(v_allowed)) then
      raise exception 'Historical credit rows exist without their pickup scope; Finance reconciliation is required';
    end if;
    raise notice 'No historical September pickups exist in this fresh CI database; no credits are created.';
    return;
  end if;
`+anchor);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
 const path=new URL('../supabase/migrations/20261018065514_20261018170000_september_historical_pickup_commission_backfill_v208.sql',import.meta.url);
 fs.writeFileSync(path,scopeEmptyHistory(fs.readFileSync(path,'utf8')));
 console.log('CI ONLY: V208 does no work for zero historical pickups; original partial-data/rate/amount guards preserved.');
}
