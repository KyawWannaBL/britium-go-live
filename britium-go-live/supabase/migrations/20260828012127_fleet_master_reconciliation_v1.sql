begin;
create schema if not exists private;
create table if not exists private.be_fleet_master_reconciliation_backup_v1 (
  backup_id uuid primary key default gen_random_uuid(),
  reconciliation_code text not null,
  captured_at timestamptz not null default now(),
  source_id uuid,
  dataset_key text,
  record_key text,
  payload jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by_email text,
  deleted_at timestamptz
);
revoke all on private.be_fleet_master_reconciliation_backup_v1
from public, anon, authenticated;
insert into private.be_fleet_master_reconciliation_backup_v1 (
  reconciliation_code, source_id, dataset_key, record_key, payload,
  status, created_at, updated_at, updated_by_email, deleted_at
)
select
  'FLEET_MASTER_RECONCILIATION_V1_20260828', id, dataset_key,
  record_key, payload, status, created_at, updated_at,
  updated_by_email, deleted_at
from public.be_master_data_rows
where dataset_key = 'fleet_master';
-- Isolate legacy duplicate wrappers while preserving them in the backup above.
update public.be_master_data_rows
set
  status = 'INACTIVE',
  deleted_at = coalesce(deleted_at, now()),
  updated_at = now(),
  updated_by_email = 'fleet-master-reconciliation-v1'
where dataset_key = 'fleet_master'
  and record_key !~ '^FLT[0-9]{3}$'
  and (
    jsonb_typeof(payload->'payload') = 'object'
    or coalesce(payload->>'vehicle_no', '') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
    or coalesce(payload->>'fleet_id', '') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
  );
with approved_fleet(record_key, payload) as (
  values
    ('FLT001', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT001','vehicle_no','6H-7397',
      'vehicle_name','6H-7397','plate_no','6H-7397','vehicle_type','Van',
      'capacity_kg',700,'capacity_cbm',4.5,'ownership_type','Owned',
      'zone_note','Delivery vehicle / Aung Mingalar support'
    )),
    ('FLT002', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT002','vehicle_no','4S-1626',
      'vehicle_name','4S-1626','plate_no','4S-1626','vehicle_type','Mini Truck',
      'capacity_kg',850,'capacity_cbm',4,'ownership_type','Owned',
      'zone_note','Delivery vehicle'
    )),
    ('FLT004', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT004','vehicle_no','7R-1473',
      'vehicle_name','7R-1473','plate_no','7R-1473','vehicle_type','Mini Truck',
      'capacity_kg',780,'capacity_cbm',1.2,'ownership_type','Owned',
      'zone_note','Delivery vehicle / Dagon Thiri support'
    )),
    ('FLT006', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT006','vehicle_no','7K-1890',
      'vehicle_name','7K-1890','plate_no','7K-1890','vehicle_type','Delivery Van',
      'ownership_type','Owned','zone_note','Approved Wayplan delivery vehicle'
    )),
    ('FLT007', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT007','vehicle_no','4N-3169',
      'vehicle_name','4N-3169','plate_no','4N-3169','vehicle_type','Delivery Van',
      'ownership_type','Owned','zone_note','Approved Wayplan delivery vehicle'
    )),
    ('FLT008', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT008','vehicle_no','2M-7017',
      'vehicle_name','2M-7017','plate_no','2M-7017','vehicle_type','Delivery Van',
      'ownership_type','Owned','zone_note','Approved Wayplan delivery vehicle'
    )),
    ('FLT009', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT009','vehicle_no','Pickup Vehicle 1',
      'vehicle_name','Pickup Vehicle 1','plate_no','Pickup Vehicle 1',
      'vehicle_type','Van','ownership_type','Owned',
      'zone_note','Flexible pickup / highway-station / third-party drop-off'
    )),
    ('FLT010', jsonb_build_object(
      'status','ACTIVE','fleet_id','FLT010','vehicle_no','Pickup Vehicle 2',
      'vehicle_name','Pickup Vehicle 2','plate_no','Pickup Vehicle 2',
      'vehicle_type','Van','ownership_type','Owned',
      'zone_note','Flexible pickup / highway-station / third-party drop-off'
    ))
)
insert into public.be_master_data_rows (
  dataset_key, record_key, payload, status, updated_by_email,
  created_at, updated_at, deleted_at
)
select
  'fleet_master', record_key, payload, 'ACTIVE',
  'fleet-master-reconciliation-v1', now(), now(), null
from approved_fleet
on conflict (dataset_key, record_key) do update
set
  payload = coalesce(public.be_master_data_rows.payload, '{}'::jsonb) || excluded.payload,
  status = 'ACTIVE',
  deleted_at = null,
  updated_at = now(),
  updated_by_email = excluded.updated_by_email;
commit;
