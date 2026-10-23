import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create table be_parcel_tariffs_v2(id int,township text,customer_tier text,status text,effective_from date,effective_to date,updated_at timestamptz,base_tariff bigint,included_kg numeric,extra_per_kg bigint,commitment_min_ways int,commitment_refund_per_way bigint,tariff_zone text,tariff_zone_code text);
 create function be_business_date() returns date language sql as $$select date '2026-10-23'$$;
 create function be_approved_tariff_lookup_key(text) returns text language sql immutable as $$select case when $1='Naypyitaw' then 'နေပြည်တော်' else $1 end$$;
 insert into be_parcel_tariffs_v2 values
 (1,'Inner','STANDARD','ACTIVE','2026-10-01',null,now(),4000,3,500,0,0,'YANGON','YANGON'),
 (2,'Outer','STANDARD','ACTIVE','2026-10-01',null,now(),4500,3,500,0,0,'YANGON','YGN'),
 (3,'Mandalay','STANDARD','ACTIVE','2026-10-01',null,now(),6000,3,500,0,0,'Mandalay','MDY'),
 (4,'NPT','STANDARD','ACTIVE','2026-10-01',null,now(),6000,3,500,0,0,'Nay Pyi Taw','NPT'),
 (5,'နေပြည်တော်','STANDARD','ACTIVE','2026-10-01',null,now(),6000,3,500,0,0,'BRANCH','BRANCH'),
 (6,'Royal destination','STANDARD','ACTIVE','2026-10-01',null,now(),15000,3,500,0,0,'ROYAL','ROYAL'),
 (7,'Inner','ROYAL','ACTIVE','2026-10-01',null,now(),3500,5,500,0,0,'Yangon','YGN');`);
 await db.exec(fs.readFileSync('scripts/fixtures/parcel-financial-before-image-tariff.sql','utf8'));
 const migration='supabase/migrations/20261023070000_image_tariff_weight_bands.sql';
 if(fs.existsSync(migration)) {const sql=fs.readFileSync(migration,'utf8');await db.exec(sql);await db.exec(sql);}
 async function quote(town,weight,tier='STANDARD') {
  return (await db.query(`select be_calculate_parcel_financial_v2_v61_8_2_legacy($1,$2,'EXACT_COLLECTION_AMOUNT',null,null,0,0,0,0,0,0,$3,0) q`,[town,tier,weight])).rows[0].q;
 }
 for(const [kg,expected] of [[3,0],[4,500],[10,3500],[10.1,4200],[11,4200],[20,10500],[21,11500],[30,20500],[31,22000]]) {
  const q=await quote('Inner',kg);assert.equal(q.weight_surcharge,expected,`Yangon ${kg}kg`);
  assert.equal(q.britium_delivery_entitlement,4000+expected);assert.equal(q.cod_amount,0);assert.equal(q.merchant_final_settlement_amount,-4000-expected);
 }
 for(const town of ['Mandalay','NPT','နေပြည်တော်','Naypyitaw']) {assert.equal((await quote(town,3)).weight_surcharge,0);assert.equal((await quote(town,4.2)).weight_surcharge,3000);}
 assert.equal((await quote('Outer',3)).base_tariff,4500);
 assert.equal((await quote('Royal destination',4)).weight_surcharge,500,'unspecified provider weight policy retained');
 assert.equal((await quote('Inner',6,'ROYAL')).weight_surcharge,500,'separate negotiated tier retained');
 assert.equal((await quote('Missing',4)).validation_status,'ERROR');
 assert.equal((await quote('Inner',-1)).validation_status,'ERROR');
 console.log('PASS image tariff: marginal bands, regional rates, rounding, exact collection, entitlement, contracted tiers and replay');
} finally {await db.close();}
