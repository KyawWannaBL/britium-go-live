import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create function auth.role() returns text language sql as $$select 'anon'::text$$;
 create table be_data_entry_access_grants_v57(grant_id uuid);`);
 await db.exec(fs.readFileSync(new URL('../sql/candidates/uat_v57_actor_access_historical_rehearsal_only.sql',import.meta.url),'utf8'));
 const fixture=new URL('../sql/candidates/uat_v57_require_access_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(fixture))await db.exec(fs.readFileSync(fixture,'utf8'));
 await assert.rejects(db.query(`select be_data_entry_require_access_v57('view',false)`),{code:'42501'});
 await assert.rejects(db.query(`select be_data_entry_require_access_v57('update',true)`),{code:'42501'});
 const invalid=(await db.query(`select be_data_entry_actor_access_v57('INVALID',false) result`)).rows[0].result;
 assert.equal(invalid.allowed,false);assert.equal(invalid.reason_code,'INVALID_ACTION');
 console.log('PASS: actual V57 actor and permission-enforcement functions deny anonymous reads/waybill writes and invalid actions.');
}finally{await db.close();}
