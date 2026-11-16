import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function be_current_role() returns text language sql as $$select coalesce(current_setting('test.role',true),'rider')$$;
 create function be_current_field_team_identity() returns jsonb language sql as $$select '{}'::jsonb$$;`);
 const fixture=new URL('../sql/candidates/uat_field_finance_foundation_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(fixture))await db.exec(fs.readFileSync(fixture,'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260927234319_field_financial_settlement_and_master_sync_v177.sql',import.meta.url),'utf8'));
 for(const sql of ['be_finance_field_settlement_center_v1(null)','be_finance_field_settlement_sign_v1(null,\'CI\',\'CI\',null)','be_finance_field_settlement_clear_v1(null,\'CI\',null)'])
  assert.equal((await db.query('select '+sql+' result')).rows[0].result.code,'AUTH_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-4000-8000-000000000001';set test.role='rider'`);
 assert.equal((await db.query(`select be_finance_field_settlement_clear_v1(null,'CI',null) result`)).rows[0].result.code,'FINANCE_AUTHORITY_REQUIRED');
 await db.exec(`insert into be_field_finance_settlements_v1(work_date,wayplan_id) values('2026-11-16','CI')`);
 await assert.rejects(db.exec(`insert into be_field_finance_settlements_v1(work_date,wayplan_id) values('2026-11-16','CI')`),{code:'23505'});
 assert.equal((await db.query(`select opening_cod_amount from be_field_finance_settlements_v1`)).rows[0].opening_cod_amount,'0');
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.exec('select * from be_field_finance_settlements_v1'),{code:'42501'});
  await db.exec('reset role');
 }
 console.log('PASS: V177 compiles with full settlement table; daily uniqueness, auth and finance-role denial retained; direct clients denied.');
}finally{await db.close();}
