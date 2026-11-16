import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 const snapshot=fs.readFileSync(new URL('../supabase/migrations/20260721093501_remote_schema.sql',import.meta.url),'utf8');
 const table=snapshot.match(/create table "public"\."be_commission_events" \([\s\S]*?\n\s+\);/i)?.[0];
 assert.ok(table);await db.exec(table);
 const fixture=new URL('../sql/candidates/uat_commission_event_lineage_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(fixture))await db.exec(fs.readFileSync(fixture,'utf8'));
 const migration=fs.readFileSync(new URL('../supabase/migrations/20260930054451_commission_wallet_unification_20260930_v1.sql',import.meta.url),'utf8');
 const index=migration.match(/create unique index if not exists be_commission_events_source_role_uq[\s\S]*?;/i)?.[0];
 assert.ok(index);await db.exec(index);
 const insert=`insert into be_commission_events(source_key,operation_type,unit_type,role_code,merchant_id,merchant_name,referral_assignment_id) values('CI-LINEAGE','DELIVERY','PARCEL','RIDER','CI','CI',null)`;
 await db.exec(insert);await assert.rejects(db.exec(insert),{code:'23505'});
 await db.exec(insert.replace("'RIDER'","'HELPER'"));
 assert.equal((await db.query('select count(*) n from be_commission_events')).rows[0].n,2);
 console.log('PASS: exact snapshot commission table accepts verified lineage columns; original composite index prevents duplicate source/role commissions.');
}finally{await db.close();}
