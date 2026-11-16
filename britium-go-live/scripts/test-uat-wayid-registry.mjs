import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;
 create table be_data_entry_parcel_details(delivery_way_id text,pickup_id text,parcel_sequence integer,updated_at timestamptz);
 create table be_pickup_parcel_verifications(like be_data_entry_parcel_details);
 insert into be_data_entry_parcel_details values('D1116-CI-0001','CI-PICKUP',1,now());
 insert into be_pickup_parcel_verifications values('D1116-CI-0001','CI-PICKUP',1,now());`);
 const source=new URL('../sql/candidates/uat_wayid_registry_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(source))await db.exec(fs.readFileSync(source,'utf8'));
 await db.exec(fs.readFileSync(new URL('../sql/candidates/uat_v33_allocator_predecessor_rehearsal_only.sql',import.meta.url),'utf8'));
 const migration=fs.readFileSync(new URL('../supabase/migrations/20260926204710_canonical_delivery_way_registry_seed_and_backfill_v134.sql',import.meta.url),'utf8');
 await db.exec(migration);
 await db.exec(migration);
 assert.equal((await db.query('select count(*) n from be_delivery_way_id_registry')).rows[0].n,1);
 await assert.rejects(db.exec(`insert into be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence) values('D1116-CI-0002','CI-PICKUP',1)`),{code:'23505'});
 await assert.rejects(db.exec(`insert into be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence) values('D1116-CI-0001','OTHER',2)`),{code:'23505'});
 await assert.rejects(db.exec(`insert into be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence) values('D1116-CI-0002','OTHER',0)`),{code:'23514'});
 assert.equal((await db.query(`select relrowsecurity as enabled from pg_class where oid='be_delivery_way_id_registry'::regclass`)).rows[0].enabled,true);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.exec('select * from be_delivery_way_id_registry'),{code:'42501'});
  await db.exec('reset role');
 }
 console.log('PASS: canonical Way ID registry backfill is repeatable, unique, positive-sequence only and closed to client roles.');
}finally{await db.close();}
