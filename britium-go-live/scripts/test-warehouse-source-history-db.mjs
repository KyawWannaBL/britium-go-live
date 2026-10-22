import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create role authenticated; create role service_role;
 create table be_wayplan_dispatches(wayplan_id text,metadata jsonb,driver_name text,helper_name text,rider_name text,vehicle_code text);
 create table be_wayplan_dispatch_stops(wayplan_id text,delivery_way_id text,metadata jsonb);
 create function be_warehouse_scan_lifecycle_snapshot_v164() returns jsonb language plpgsql as $$begin
 if current_setting('test.role',true)='merchant' then raise exception 'Warehouse read authority required';end if;
 return '{"ok":true,"rows":[{"delivery_way_id":"D-CANONICAL","dispatch_scan_at":null,"return_scan_1_at":null,"warehouse_scan_status":"RECEIVED"},{"delivery_way_id":"D-SOURCE-OTHER","warehouse_scan_status":"RECEIVED"}],"stats":{"rows":2}}'::jsonb;end$$;
 insert into be_wayplan_dispatches values('WP-1','{"work_date":"2026-10-20","plan_type":"OUTBOUND","completion_basis":"MD_INSTRUCTED_ASSUMPTION"}','Driver','Helper',null,'VAN-1');
 insert into be_wayplan_dispatches values('RETRY-1','{"work_date":"2026-10-20","plan_type":"RETRY_REVIEW","completion_basis":"MD_INSTRUCTED_ASSUMPTION"}',null,null,null,null);
 insert into be_wayplan_dispatch_stops values('WP-1','D-CANONICAL','{"source_way_id":"D-SOURCE-OTHER","md_attested_outcome":"DELIVERY_ATTEMPT_FAILED","source_attempt_evidence":{"reason":"No answer","verification":"Valid","source_file":"failed.xlsx"}}');
 insert into be_wayplan_dispatch_stops values('RETRY-1','D-CANONICAL','{"source_attempt_evidence":{"reason":"Duplicate retry reference"}}');`);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_warehouse_reported_source_history_v211.sql'));
 const migration=file?fs.readFileSync('supabase/migrations/'+file,'utf8'):'';
 await db.exec(migration.trim()||`create function be_warehouse_scan_lifecycle_snapshot_v211() returns jsonb language sql as $$select be_warehouse_scan_lifecycle_snapshot_v164()$$;`);
 const snapshot=(await db.query('select be_warehouse_scan_lifecycle_snapshot_v211() data')).rows[0].data;
 const row=snapshot.rows[0];
 assert.equal(row.reported_source_history?.length,1,'confirmed source reason must be visible; derived retry references must not duplicate it');
 assert.equal(row.reported_source_history[0].reason,'No answer');
 assert.equal(row.reported_source_history[0].verification,'Valid');
 assert.equal(row.reported_source_history[0].work_date,'2026-10-20');
 assert.equal(row.dispatch_scan_at,null,'reported dispatch must not become an actual scan');
 assert.equal(row.return_scan_1_at,null,'reported failure must not become an actual return scan');
 assert.equal(row.warehouse_scan_status,'RECEIVED');
 assert.equal(snapshot.rows[1].reported_source_history.length,0,'source aliases must not attach evidence to a different canonical parcel');
 assert.equal((await db.query('select count(*) n from be_wayplan_dispatch_stops')).rows[0].n,2,'snapshot must not write operational records');
 await db.exec("set test.role='merchant'");
 await assert.rejects(db.query('select be_warehouse_scan_lifecycle_snapshot_v211()'),/Warehouse read authority required/);
 console.log('PASS warehouse source history: reasons, validity, dates, canonical identity, retry deduplication, scan integrity and permission guard');
} finally {await db.close();}
