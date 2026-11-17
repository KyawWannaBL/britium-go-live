import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create table be_portal_pickup_requests(pickup_id text primary key,pickup_collected_at timestamptz,pickup_status text);
 create table be_commission_records(ref_id text);create table be_workforce_wallet_ledger(pickup_id text,amount numeric);
 create table be_commission_events(id uuid,pickup_id text,source_key text);`);
 const original=fs.readFileSync(new URL('../supabase/migrations/20261018065514_20261018170000_september_historical_pickup_commission_backfill_v208.sql',import.meta.url),'utf8');
 const script=new URL('./uat-rehearsal-empty-historical-backfill.mjs',import.meta.url);
 const sql=fs.existsSync(script)?(await import(script)).scopeEmptyHistory(original):original;
 await db.exec(sql);
 assert.equal((await db.query('select count(*) n from be_commission_events')).rows[0].n,0);
 await db.exec(`insert into be_portal_pickup_requests(pickup_id) values('UNRELATED-CI')`);
 await db.exec(sql);
 assert.equal((await db.query('select count(*) n from be_portal_pickup_requests')).rows[0].n,1);
 for(const [table,column] of [['be_commission_records','ref_id'],['be_workforce_wallet_ledger','pickup_id'],['be_commission_events','source_key']]){
  await db.exec('insert into '+table+'('+column+") values('P0902-TSW-002')");
  await assert.rejects(db.exec(sql),/Historical credit rows exist without their pickup scope/);await db.exec('rollback');
  await db.exec('delete from '+table);
 }
 await db.exec(`insert into be_portal_pickup_requests(pickup_id) values('P0902-TSW-002')`);
 await assert.rejects(db.exec(sql),/requires all nine verified pickup IDs/);await db.exec('rollback');
 await db.exec(`delete from be_portal_pickup_requests;insert into be_portal_pickup_requests(pickup_id) values('P0902-TSW-002'),('P0902-MMM-002'),('P0904-KSC-002'),('P0909-TSW-001'),('P0909-CHI-001'),('P0923-FFY-004'),('P0926-YDC-002'),('P0927-PHS-002'),('P0929-POE-001')`);
 await assert.rejects(db.exec(sql),/no longer has a verified September collected state/);await db.exec('rollback');
 assert.equal((await db.query('select count(*) n from be_commission_events')).rows[0].n,0);
 const guard=original.slice(original.indexOf('  if (select count(*) from public.be_portal_pickup_requests'));
 assert.ok(sql.endsWith(guard),'Every original existing-data safety check must remain unchanged');
 console.log('PASS: empty historical scope changes no credits; partial scope and invalid September pickups still fail closed.');
}finally{await db.close();}
