import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"email":"finance@example.test"}'::jsonb$$;
 create function be_current_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table be_wayplan_cod_settlements(wayplan_id text,delivery_way_id text,cod_collected numeric,settlement_status text,settlement_reference text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 create table be_finance_cod_settlements_v48(wayplan_id text,delivery_way_id text,settlement_status text,settled_amount numeric,rider_remittance numeric,reported_collected numeric,expected_cod numeric,settlement_reference text,settlement_receiver text,settlement_note text,settled_by text,settled_at timestamptz,hold_code text,hold_note text,held_by text,held_at timestamptz,metadata jsonb,updated_at timestamptz);
 insert into be_wayplan_cod_settlements values('WP-1','HISTORICAL',null,'PENDING_SETTLEMENT',null,null,'{"historical_source_review":true}',now()),('WP-2','VERIFIED',4000,'PENDING_SETTLEMENT',null,null,'{}',now());`);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_historical_finance_collection_review_v212.sql'));
 if(!file) throw new Error('Missing historical finance review guard migration');
 await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 async function settle(id='HISTORICAL'){return (await db.query(`select be_finance_settle_wayplan_cod($1::jsonb) data`,[JSON.stringify({delivery_way_id:id,actor:'spoofed-user',settlement_reference:'TEST'})])).rows[0].data;}
 assert.equal((await settle()).error,'AUTH_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';set test.role='rider'`);
 assert.equal((await settle()).error,'FINANCE_REQUIRED');
 await db.exec(`set test.role='finance'`);
 assert.equal((await settle()).error,'COLLECTION_EVIDENCE_REQUIRED');
 assert.equal((await db.query(`select settlement_status from be_wayplan_cod_settlements where delivery_way_id='HISTORICAL'`)).rows[0].settlement_status,'PENDING_SETTLEMENT');
 const verified=await settle('VERIFIED');assert.equal(verified.ok,true);
 const row=(await db.query(`select * from be_wayplan_cod_settlements where delivery_way_id='VERIFIED'`)).rows[0];
 assert.equal(row.settlement_status,'SETTLED');assert.equal(row.metadata.settled_by,'finance@example.test');
 assert.equal((await settle('VERIFIED')).settled_count,0,'repeat confirmation must not create extra settlement');
 console.log('PASS historical finance review: authentication, role boundary, missing collection evidence, unchanged pending rows, verified settlement and actor attribution');
} finally {await db.close();}
