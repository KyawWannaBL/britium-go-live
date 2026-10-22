import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create function public.be_data_entry_service_provider_route_v17(t text) returns jsonb language sql as $$select jsonb_build_object('destination_key',t,'reason','EXACT_BRITIUM_ROUTE','provider_code','BRITIUM','matched_destination',t)$$;`);
const baseline=fs.readFileSync('supabase/migrations/20260915213000_yangon_dynamic_zoning_v37_royal_outscope.sql','utf8');
await db.exec(baseline.slice(baseline.indexOf('create or replace function'),baseline.indexOf('revoke all')));
await db.exec(fs.readFileSync('supabase/migrations/20260923014000_explicit_highway_station_routing_v120.sql','utf8'));
const patch=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_explicit_highway_handoff_route.sql'));
if(patch) {const sql=fs.readFileSync('supabase/migrations/'+patch,'utf8');await db.exec(sql);await db.exec(sql);}
for (const t of ['ဂိတ်ချ','H.TERMINAL DROP-OFF','highway terminal drop-off']) {
 const {rows}=await db.query('select public.be_data_entry_delivery_route_v26($1,145000,$2,$3) as r',[t,'ဂျိမ်းဖောယူကားဂိတ်၊ အောင်မင်္ဂလာကားကွင်း','BRITIUM']);
 assert.equal(rows[0].r.delivery_mode,'HIGHWAY_BUS_STATION',t+' must honor explicit highway selection even with COD');
 assert.equal(rows[0].r.station_required,true);assert.equal(rows[0].r.map_required,false);assert.equal(rows[0].r.region_code,'OUTSIDE_CORE');
}
for(const [township,price,address,provider,mode] of [
 ['ရွှေပြည်သာ',145000,'Ordinary doorstep address','BRITIUM','DOORSTEP_MAP'],
 ['သာကေတ',0,'အဝေးပြေးကားဝင်း','BRITIUM','HIGHWAY_BUS_STATION'],
 ['မြောက်ဥက္ကလာပ',145000,'An address near the highway bus station','BRITIUM','DOORSTEP_MAP'],
 ['Yangon',145000,'Selected handoff station','H.TERMINAL DROP-OFF','HIGHWAY_BUS_STATION']
]) {const {rows}=await db.query('select public.be_data_entry_delivery_route_v26($1,$2,$3,$4) as r',[township,price,address,provider]);assert.equal(rows[0].r.delivery_mode,mode);}
await db.close();console.log('Explicit highway routing SQL tests PASS (COD handoff, legacy alias, doorstep preservation, idempotent patch)');
