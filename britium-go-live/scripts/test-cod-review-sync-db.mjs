import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;
 create table be_wayplan_dispatches(wayplan_id text,rider_code text,rider_name text);
 insert into be_wayplan_dispatches values('WP','RID001','Rider');
 create table be_wayplan_cod_settlements(
  id uuid default gen_random_uuid(),wayplan_id text,delivery_way_id text,waybill_no text,pickup_id text,
  rider_code text,rider_name text,recipient_name text,recipient_phone text,cod_expected numeric,cod_collected numeric,
  delivery_fee numeric,settlement_status text,settlement_reference text,settled_at timestamptz,delivered_at timestamptz,
  metadata jsonb,created_at timestamptz,updated_at timestamptz,unique(wayplan_id,delivery_way_id));
 create table be_wayplan_dispatch_stops(
  wayplan_id text,delivery_way_id text,waybill_no text,pickup_id text,receiver_name text,recipient_name text,
  receiver_phone text,recipient_phone text,cod_amount numeric,cod_collected numeric,delivery_fee numeric,
  stop_status text,delivered_at timestamptz,rider_status text,rider_proof_url text);`);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_finance_cod_review_actions_v213.sql'));
 assert.ok(file,'Finance review migration must exist');
 const migration=fs.readFileSync('supabase/migrations/'+file,'utf8');
 const sync=migration.match(/create or replace function public\.be_sync_wayplan_cod_settlement\(\)[\s\S]*?\$sync\$;/i);
 assert.ok(sync,'migration must replace the operational sync trigger function');
 await db.exec(sync[0]);
 await db.exec(`create trigger sync_cod after insert or update on be_wayplan_dispatch_stops
  for each row execute function be_sync_wayplan_cod_settlement();`);
 async function source(id,collected=100){
  await db.query(`insert into be_wayplan_dispatch_stops
   (wayplan_id,delivery_way_id,cod_amount,cod_collected,delivery_fee,stop_status,delivered_at,rider_status,rider_proof_url)
   values('WP',$1,100,$2,10,'DELIVERED','2026-10-23T00:00:00Z','DELIVERED','old')`,[id,collected]);
 }
 async function row(id){return(await db.query('select * from be_wayplan_cod_settlements where delivery_way_id=$1',[id])).rows[0];}
 await source('FRESH',null);
 assert.equal((await row('FRESH')).cod_collected,null,'missing receipt must remain unknown on a fresh insert');
 const cases=[
  {id:'REJECTED',status:'REJECTED',expected:100,collected:null,metadata:{rejection_reason:'Missing receipt',finance_review_status:'REJECTED'}},
  {id:'ADJUSTED',status:'PENDING_SETTLEMENT',expected:90,collected:null,metadata:{original_expected_collection:100,collection_adjustment_mmk:-10,adjustment_reason:'Correction',finance_review_status:'ADJUSTED'}},
  {id:'SETTLED',status:'SETTLED',expected:90,collected:90,metadata:{finance_confirmed_at:'2026-10-23',payment_method:'CASH',collection_reference:'REF',settled_by:'finance@test'}},
  {id:'HISTORICAL',status:'PENDING_SETTLEMENT',expected:500,collected:null,metadata:{historical_source_review:true,source_business_date:'2026-10-21',driver_name:'Historical Driver'}}
 ];
 for(const c of cases){
  await source(c.id);
  await db.query(`update be_wayplan_cod_settlements set cod_expected=$2,cod_collected=$3,settlement_status=$4,
   metadata=$5::jsonb,delivery_fee=12,settlement_reference=$6,settled_at=$7,delivered_at=$8 where delivery_way_id=$1`,
   [c.id,c.expected,c.collected,c.status,JSON.stringify(c.metadata),c.status==='SETTLED'?'REF':null,c.status==='SETTLED'?'2026-10-23':null,c.id==='HISTORICAL'?null:'2026-10-22']);
  await db.query(`update be_wayplan_dispatch_stops set cod_amount=999,cod_collected=999,delivery_fee=99,
   receiver_name='Updated recipient',rider_proof_url='new-proof',delivered_at='2026-10-24' where delivery_way_id=$1`,[c.id]);
  const actual=await row(c.id);
  assert.equal(Number(actual.cod_expected),c.expected,c.id+' expected remains reviewed');
  assert.equal(actual.cod_collected===null?null:Number(actual.cod_collected),c.collected,c.id+' collection remains reviewed');
  assert.equal(Number(actual.delivery_fee),12,c.id+' reviewed fee remains unchanged');
  assert.equal(actual.settlement_status,c.status);
  for(const [key,value] of Object.entries(c.metadata))assert.deepEqual(actual.metadata[key],value,c.id+' preserves '+key);
  assert.equal(actual.recipient_name,'Updated recipient');
  assert.equal(actual.metadata.rider_proof_url,'new-proof');
  if(c.id==='HISTORICAL')assert.equal(actual.delivered_at,null,'unknown historical delivery timestamp remains unknown');
  if(c.id==='SETTLED'){assert.equal(actual.settlement_reference,'REF');assert.ok(actual.settled_at);}
 }
 await source('UNREVIEWED');
 await db.exec(`update be_wayplan_dispatch_stops set cod_amount=120,cod_collected=110 where delivery_way_id='UNREVIEWED'`);
 assert.equal(Number((await row('UNREVIEWED')).cod_expected),120,'ordinary unreviewed sync still updates amount');
 assert.equal(Number((await row('UNREVIEWED')).cod_collected),110);
 console.log('PASS COD operational trigger: rejected, adjusted, settled and historical financial evidence retained; operational fields sync; unknown collection preserved');
}finally{await db.close();}
