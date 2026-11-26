import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql as 'select (case when current_setting(''fixture.role'',true) = ''anon'' then null else ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' end)::uuid';
create function auth.jwt() returns jsonb language sql as 'select ''{"email":"fixture@example.test"}''::jsonb';
create function public.be_current_role() returns text language sql as 'select current_setting(''fixture.role'',true)';
create function public.be_current_user_role() returns text language sql as 'select public.be_current_role()';
create function public.be_warehouse_assert_internal() returns text language sql as 'select public.be_current_role()';
create function public.be_branch_scope_v1(text) returns text language sql as 'select $1';
create function public.be_save_operational_route_version_v1(text,text,jsonb,text) returns jsonb language sql as 'select ''{"ok":true}''::jsonb';
create table public.be_data_entry_service_providers (provider_code text primary key, display_name text, provider_type text,is_active boolean default true);
insert into public.be_data_entry_service_providers values ('ROYAL EXPRESS','Royal Express','OUTSOURCE'),('NPT BRANCH','Naypyitaw','BRANCH'),('H.TERMINAL DROP-OFF','Highway','TERMINAL'),('BRITIUM','Britium','INTERNAL');
create table private.be_warehouse_provider_assignment_confirmation_v1(parcel_detail_id uuid primary key,provider_code text);
create table public.be_wayplan_service_locations(location_code text primary key,location_name text,address text,latitude numeric,longitude numeric,active boolean,location_type text);
insert into public.be_wayplan_service_locations(location_code,location_name,address,latitude,longitude,active) values
 ('ROYAL_DEPOT','Royal depot','royal',16,96,true),('SKY_DEPOT','Sky depot','sky',16,96,true),
 ('BRANCH_DEPOT','Branch depot','branch',16,96,true),('GATE_AUNG_MINGALAR','Aung Mingalar Highway Bus Station','gate',16,96,true),
 ('GATE_DAGON_AYAR','Dagon Ayar Highway Bus Station','gate',16,96,true);
create table public.be_provider_handover_sites_v1(provider_code text,origin_branch_code text,location_code text,active boolean,verified_at timestamptz,verified_by uuid);
create function public.be_provider_handover_site_approve_v1(text,text,text,text) returns jsonb language sql as $$
 insert into public.be_provider_handover_sites_v1 values($1,$2,$3,true,now(),auth.uid()) returning jsonb_build_object('ok',true,'location_code',$3)
$$;
create table public.be_provider_transfer_release_control_v1(control_key text,draft_enabled boolean);
insert into public.be_provider_transfer_release_control_v1 values('PROVIDER_TRANSFER_V1',false);
create table public.be_wayplan_roster_allowlist_v68(workforce_code text,role_code text,branch_code text,active boolean);
insert into public.be_wayplan_roster_allowlist_v68 values('DRV001','DRIVER','YGN',true);
create table public.be_mobile_workforce_accounts(worker_code text,workforce_code text, account_code text, driver_code text, role text, auth_user_id uuid, active boolean, is_active boolean);
insert into public.be_mobile_workforce_accounts values('DRV001',null,null,null,'DRIVER','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true,true);
create table public.be_master_data_rows(dataset_key text, record_key text, deleted_at timestamptz, status text, payload jsonb);
insert into public.be_master_data_rows values('fleet_master','FLT001',null,'ACTIVE','{"branch_code":"YGN","operation_type":"DELIVERY"}');
create table public.be_branch_offices(branch_code text, branch_name text,lat numeric,lng numeric,active boolean);
insert into public.be_branch_offices values('YGN','Yangon',16,96,true);
create table public.be_data_entry_parcel_details(id uuid default gen_random_uuid(),delivery_way_id text, pickup_id text,
  financial_validation_status text, parcel_status text, delivery_region text, financial_quote jsonb, delivery_route_mode text,
  handoff_station_code text,handoff_station_name text,updated_at timestamptz default now());
insert into public.be_data_entry_parcel_details(delivery_way_id,pickup_id,financial_validation_status,parcel_status,delivery_region,financial_quote,delivery_route_mode,handoff_station_code,handoff_station_name)
 values ('D-ROYAL','P-01','OK','REGISTERED','OUTSIDE_CORE','{"service_provider_code":"ROYAL EXPRESS"}','ROYAL_EXPRESS',null,null),
 ('D-SKY','P-02','OK','REGISTERED','OUTSIDE_CORE','{"service_provider_code":"ROYAL EXPRESS"}','ROYAL_EXPRESS',null,null),
 ('D-GATE','P-03','OK','REGISTERED','OUTSIDE_CORE','{}','HIGHWAY_BUS_STATION','OTHER','အောင်မင်္ဂလာဂိတ်'),
 ('D-NPT','P-04','OK','REGISTERED','NAYPYITAW','{"service_provider_code":"NPT BRANCH"}','DOORSTEP_MAP',null,null);
insert into private.be_warehouse_provider_assignment_confirmation_v1 select id,'SKY DELI' from public.be_data_entry_parcel_details where delivery_way_id='D-SKY';
create table public.be_warehouse_receipts_v36(delivery_way_id text,warehouse_code text,warehouse_status text,discrepancy_code text,updated_at timestamptz default now());
insert into public.be_warehouse_receipts_v36(delivery_way_id,warehouse_code,warehouse_status) select delivery_way_id,'YGN-MAIN','WAREHOUSE_READY' from public.be_data_entry_parcel_details;
create function public.be_warehouse_scan_lifecycle_snapshot_v211() returns jsonb language sql as $$
 select jsonb_build_object('ok',true,'rows',jsonb_agg(jsonb_build_object('canonical_delivery_way_id',delivery_way_id,'pickup_id',pickup_id))) from public.be_data_entry_parcel_details
$$;
create table public.be_wayplan_dispatches(wayplan_id text primary key,branch_code text,vehicle_code text,driver_code text,
 wayplan_status text,total_stops int,total_parcels int,created_by text,metadata jsonb);
create table public.be_wayplan_review_v43(wayplan_id text primary key,review_status text,approval_snapshot jsonb);
create function public.ensure_review() returns trigger language plpgsql as $$begin insert into public.be_wayplan_review_v43 values (new.wayplan_id,'DRAFT','{}'); return new; end;$$;
create trigger wayplan_review after insert on public.be_wayplan_dispatches for each row execute function public.ensure_review();
create table public.be_wayplan_membership_v40(wayplan_id text,delivery_way_id text,pickup_id text,route_zone text,
 membership_status text,vehicle_code text,driver_code text,metadata jsonb,created_by text);
create table public.be_wayplan_dispatch_stops(wayplan_id text,stop_sequence int,delivery_way_id text,pickup_id text,address text,township text,stop_status text,metadata jsonb);
create table public.be_delivery_reschedules_v71(delivery_way_id text,status text,requested_delivery_date date);
create table public.be_dispatch_scans_v39(delivery_way_id text,scan_status text,scanned_at timestamptz);
create table public.be_warehouse_return_scans_v39(delivery_way_id text,scanned_at timestamptz);
create table public.be_thirdparty_cs_current_v1(delivery_way_id text,outcome text);
create table public.be_delivery_attempt_state_v39(delivery_way_id text,last_status text);
create table public.be_provider_transfer_custody_v1(delivery_way_id text);
create table public.be_audit_events(actor_id uuid,actor_email text,actor_role text,action text,resource_type text,resource_id text,details jsonb);
set fixture.role='superadmin';
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261125192000_provider_transfer_confirmed_routing.sql', import.meta.url),'utf8'));
const preview = async () => (await db.query('select public.be_warehouse_provider_transfer_preview_v1() as result')).rows[0].result.rows;
const draft = (id,provider,site,way) => db.query(
 'select public.be_provider_transfer_wayplan_draft_v1($1,$2,\'YGN\',$3,array[$4]::text[],\'FLT001\',\'DRV001\') as result',
 [`00000000-0000-0000-0000-00000000000${id}`,provider,site,way]
);
let rows = await preview();
assert.deepEqual(Object.fromEntries(rows.map(row=>[row.canonical_delivery_way_id,row.service_provider_code])),{
 'D-ROYAL':'ROYAL EXPRESS','D-SKY':'SKY DELI','D-GATE':'H.TERMINAL DROP-OFF','D-NPT':'NPT BRANCH',
});
assert.ok(rows.every(row=>row.handover_location_verified===false));
await assert.rejects(draft(1,'ROYAL EXPRESS','ROYAL_DEPOT','D-ROYAL'),/not yet enabled/);
await db.exec(`
update public.be_provider_transfer_release_control_v1 set draft_enabled=true;
insert into public.be_provider_handover_sites_v1
select provider,'YGN',site,true,now(),auth.uid() from (values
 ('ROYAL EXPRESS','ROYAL_DEPOT'),('SKY DELI','SKY_DEPOT'),('NPT BRANCH','BRANCH_DEPOT'),
 ('H.TERMINAL DROP-OFF','GATE_AUNG_MINGALAR'),('H.TERMINAL DROP-OFF','GATE_DAGON_AYAR')
) as x(provider,site);
`);
rows=await preview();
assert.ok(rows.every(row=>row.handover_location_verified===true));
assert.equal(rows.find(row=>row.canonical_delivery_way_id==='D-GATE').handover_location_code,'GATE_AUNG_MINGALAR');
await db.exec("update public.be_data_entry_parcel_details set handoff_station_code='AUNG_MINGALAR' where delivery_way_id='D-GATE'");
assert.equal((await preview()).find(row=>row.canonical_delivery_way_id==='D-GATE').handover_location_code,'GATE_AUNG_MINGALAR');
await db.exec("update public.be_warehouse_receipts_v36 set discrepancy_code='MISMATCH' where delivery_way_id='D-NPT'");
assert.equal((await preview()).find(row=>row.canonical_delivery_way_id==='D-NPT').provider_planning_gate,'WAREHOUSE_NOT_READY');
await assert.rejects(draft(4,'NPT BRANCH','BRANCH_DEPOT','D-NPT'),/cleared WAREHOUSE_READY receipt/);
await db.exec("update public.be_warehouse_receipts_v36 set discrepancy_code=null where delivery_way_id='D-NPT'");

await assert.rejects(draft(1,'H.TERMINAL DROP-OFF','GATE_DAGON_AYAR','D-GATE'),/matching approved highway gate/);
await assert.rejects(draft(1,'ROYAL EXPRESS','ROYAL_DEPOT','D-SKY'),/another service provider/);
await db.exec("set fixture.role='warehouse'");
await assert.rejects(db.query('select public.be_provider_transfer_site_options_v1()'),/management authority/);
const register = (latitude) => db.query(
  "select public.be_provider_transfer_register_site_v1('SKY DELI','YGN','New Sky site','Fixture address',$1,96,'TEST-SITE-EVIDENCE') result",
  [latitude],
);
await assert.rejects(register(16),/management authority/);

await assert.rejects(draft(1,'ROYAL EXPRESS','ROYAL_DEPOT','D-ROYAL'),/Management authorization/);
await db.exec("set fixture.role='superadmin'");
const options=(await db.query('select public.be_provider_transfer_site_options_v1() as result')).rows[0].result;
assert.ok(options.providers.some(x=>x.code==='SKY DELI'));
await assert.rejects(register(0),/verified Myanmar coordinates/);
const registered=(await register(16)).rows[0].result;
assert.match(registered.location_code,/^HANDOVER_/);
assert.equal((await register(16)).rows[0].result.location_code,registered.location_code);
await assert.rejects(register(17),/different coordinates/);

for(const [id,provider,site,way] of [
 [1,'ROYAL EXPRESS','ROYAL_DEPOT','D-ROYAL'],[2,'SKY DELI','SKY_DEPOT','D-SKY'],
 [3,'H.TERMINAL DROP-OFF','GATE_AUNG_MINGALAR','D-GATE'],[4,'NPT BRANCH','BRANCH_DEPOT','D-NPT'],
]){
 const {result}= (await draft(id,provider,site,way)).rows[0];
 assert.equal(result.status,'DRAFT');
 assert.equal(result.dispatch_created,false);
 assert.equal(result.handover_recorded,false);
 await assert.rejects(draft(9,provider,site,way),/already assigned/);
}
for(const table of ['be_wayplan_dispatches','be_wayplan_membership_v40','be_wayplan_dispatch_stops','be_wayplan_review_v43','be_audit_events']){
 assert.equal(Number((await db.query('select count(*) from public.'+table)).rows[0].count),4,table);
}
assert.equal(Number((await db.query('select count(*) from public.be_dispatch_scans_v39')).rows[0].count),0);
console.log('PASS: four provider draft routes, site and role gates, wrong-provider and wrong-gate rejection, duplicate protection, draft review and audit, no scans.');
await db.close();
