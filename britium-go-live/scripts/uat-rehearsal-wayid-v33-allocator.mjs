/** CI ONLY: original V33 Way ID allocator before historical rename.
 * Source recovered from Production retained _legacy_v33 function.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const migration=fileURLToPath(new URL('../supabase/migrations/20260914022752_restore_original_merchant_wayids_v33.sql',import.meta.url));
const source=fileURLToPath(new URL('../sql/candidates/uat_v33_allocator_predecessor_rehearsal_only.sql',import.meta.url));
const target=fs.readFileSync(migration,'utf8'),historical=fs.readFileSync(source,'utf8');
const registry=fs.readFileSync(new URL('../sql/candidates/uat_wayid_registry_rehearsal_only.sql',import.meta.url),'utf8');
if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
for(const marker of ['CREATE TABLE public.be_delivery_way_id_registry','UNIQUE (pickup_id,parcel_sequence)','CHECK (parcel_sequence > 0)','ENABLE ROW LEVEL SECURITY','FROM PUBLIC,anon,authenticated'])
 if(!registry.includes(marker))throw Error('Way ID registry fixture incomplete: '+marker);
if(!target.includes("be_allocate_delivery_way_id_legacy_v33")||!historical.includes('CREATE OR REPLACE FUNCTION public.be_allocate_delivery_way_id(p_pickup_id text, p_parcel_sequence integer)'))throw Error('V33 allocator historical dependency changed');
fs.writeFileSync(migration,registry+'\n'+historical+'\n'+target);
console.log('CI only: original V33 Way ID allocator staged before required rename.');
