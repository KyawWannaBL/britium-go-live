import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'uat-operational-'));
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table be_cs_tickets(id uuid primary key);create table be_party_wallet_accounts(id uuid primary key);
 create table be_data_entry_parcel_details(id uuid primary key);create table be_wayplan_dispatch_stops(id uuid primary key);`);
 const fixture=new URL('./uat-operational-prerequisites.json',import.meta.url);
 const entries=fs.existsSync(fixture)?JSON.parse(fs.readFileSync(fixture,'utf8')):[];
 if(entries.length){
  fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});fs.mkdirSync(path.join(tmp,'supabase/migrations'),{recursive:true});
  for(const file of ['uat-operational-prerequisites.json','uat-rehearsal-operational-prerequisites.mjs'])fs.copyFileSync(new URL('./'+file,import.meta.url),path.join(tmp,'scripts',file));
  for(const {target} of entries)fs.writeFileSync(path.join(tmp,'supabase/migrations',target),'-- unchanged consumer\nselect 1;\n');
  const script=path.join(tmp,'scripts/uat-rehearsal-operational-prerequisites.mjs');
  execFileSync(process.execPath,[script],{env:{...process.env,DO_NOT_CONNECT_REMOTE:'1'}});
  for(const {target,ddl} of entries){const staged=fs.readFileSync(path.join(tmp,'supabase/migrations',target),'utf8');assert.ok(staged.includes(ddl));assert.ok(staged.endsWith('-- unchanged consumer\nselect 1;\n'));}
 }
 for(const entry of entries)await db.exec(entry.ddl);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261103200047_finance_weight_recalculate_cod_policy_and_audit_v2.sql',import.meta.url),'utf8'));
 assert.equal(entries.length,13);
 for(const entry of entries){
  assert.equal((await db.query('select count(*) n from public.'+entry.name)).rows[0].n,0);
  assert.deepEqual((await db.query(`select relrowsecurity as rls,has_table_privilege('anon',$1,'SELECT') as anon,has_table_privilege('authenticated',$1,'SELECT') as authenticated from pg_class where oid=$1::regclass`,['public.'+entry.name])).rows[0],{rls:true,anon:false,authenticated:false});
 }
 console.log('PASS: 13 verified missing operational schemas compile empty with RLS/client denial; real weight-finance migration preserves foreign-key dependency.');
}finally{await db.close();fs.rmSync(tmp,{recursive:true,force:true});}
