-- Britium Express — Master Data Go-Live Wired Sync
-- Purpose:
--   1) Keep Master Data generic and metadata-driven.
--   2) Preserve the current portal structure: src/pages/MasterDataPage.tsx uses Supabase RPCs.
--   3) Expose go-live compatible master-data views for portal modules.
--   4) No operational master rows are hardcoded in this SQL.
-- Safe to rerun.

create extension if not exists pgcrypto;

create table if not exists public.be_master_data_tabs (
  dataset_key text primary key,
  sheet_name text,
  display_name_en text not null,
  display_name_mm text,
  category text default 'Master Data',
  primary_key text not null,
  sort_order integer default 999,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_master_data_tabs
  add column if not exists sheet_name text,
  add column if not exists display_name_en text,
  add column if not exists display_name_mm text,
  add column if not exists category text default 'Master Data',
  add column if not exists primary_key text,
  add column if not exists sort_order integer default 999,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_master_data_columns (
  dataset_key text not null references public.be_master_data_tabs(dataset_key) on delete cascade,
  field_key text not null,
  label_en text not null,
  label_mm text,
  data_type text not null default 'text',
  required boolean default false,
  editable boolean default true,
  visible boolean default true,
  options jsonb default '[]'::jsonb,
  sort_order integer default 999,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (dataset_key, field_key)
);

alter table public.be_master_data_columns
  add column if not exists label_en text,
  add column if not exists label_mm text,
  add column if not exists data_type text default 'text',
  add column if not exists required boolean default false,
  add column if not exists editable boolean default true,
  add column if not exists visible boolean default true,
  add column if not exists options jsonb default '[]'::jsonb,
  add column if not exists sort_order integer default 999,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_master_data_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null references public.be_master_data_tabs(dataset_key) on delete cascade,
  record_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by_email text,
  deleted_at timestamptz,
  unique (dataset_key, record_key)
);

alter table public.be_master_data_rows
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists updated_by_email text,
  add column if not exists deleted_at timestamptz;

create table if not exists public.be_master_data_audit_log (
  id bigserial primary key,
  dataset_key text not null,
  record_key text not null,
  action text not null,
  old_payload jsonb,
  new_payload jsonb,
  actor_email text,
  created_at timestamptz default now()
);

create index if not exists idx_be_master_data_rows_dataset_live
  on public.be_master_data_rows(dataset_key, record_key)
  where deleted_at is null;

create index if not exists idx_be_master_data_rows_payload_gin
  on public.be_master_data_rows using gin(payload);

-- Metadata seed only. Operational row data must come from the live DB, upload, or seed script.
with src as (
  select *
  from jsonb_to_recordset($json$[{"dataset_key": "merchant_master", "sheet_name": "Merchant_Master (EN)", "display_name_en": "Merchant Master", "display_name_mm": "ကုန်သည် မာစတာ", "category": "Merchant", "primary_key": "merchant_code", "sort_order": 1, "active": true}, {"dataset_key": "rider_master", "sheet_name": "Rider_Master (EN)", "display_name_en": "Rider Master", "display_name_mm": "ရိုင်ဒါ မာစတာ", "category": "Workforce", "primary_key": "rider_id", "sort_order": 2, "active": true}, {"dataset_key": "driver_master", "sheet_name": "Driver_Master (EN)", "display_name_en": "Driver Master", "display_name_mm": "ဒရိုင်ဘာ မာစတာ", "category": "Workforce", "primary_key": "driver_id", "sort_order": 3, "active": true}, {"dataset_key": "helper_master", "sheet_name": "Helper_Master (EN)", "display_name_en": "Helper Master", "display_name_mm": "ကူညီသူ မာစတာ", "category": "Workforce", "primary_key": "helper_id", "sort_order": 4, "active": true}, {"dataset_key": "employee_master", "sheet_name": "Employee_Master (EN)", "display_name_en": "Employee Master", "display_name_mm": "ဝန်ထမ်း မာစတာ", "category": "Workforce", "primary_key": "employee_id", "sort_order": 5, "active": true}, {"dataset_key": "fleet_master", "sheet_name": "Fleet_Master (EN)", "display_name_en": "Fleet Master", "display_name_mm": "ယာဉ် မာစတာ", "category": "Fleet", "primary_key": "fleet_id", "sort_order": 6, "active": true}, {"dataset_key": "service_types", "sheet_name": "Service_Types (EN)", "display_name_en": "Service Types", "display_name_mm": "ဝန်ဆောင်မှု အမျိုးအစား", "category": "Tariff", "primary_key": "service_type", "sort_order": 7, "active": true}, {"dataset_key": "weight_brackets", "sheet_name": "Weight_Brackets (EN)", "display_name_en": "Weight Brackets", "display_name_mm": "အလေးချိန် အဆင့်", "category": "Tariff", "primary_key": "weight_bracket_code", "sort_order": 8, "active": true}, {"dataset_key": "vehicle_capacity", "sheet_name": "Vehicle_Capacity (EN)", "display_name_en": "Vehicle Capacity", "display_name_mm": "ယာဉ်ထုထည် သတ်မှတ်ချက်", "category": "Fleet", "primary_key": "vehicle_code", "sort_order": 9, "active": true}, {"dataset_key": "zone_master", "sheet_name": "Zone_Master (EN)", "display_name_en": "Zone Master", "display_name_mm": "ဇုန် မာစတာ", "category": "Geo", "primary_key": "state_region_code", "sort_order": 10, "active": true}, {"dataset_key": "township_master", "sheet_name": "Township_Master", "display_name_en": "Township Master", "display_name_mm": "မြို့နယ် မာစတာ", "category": "Geo", "primary_key": "township_code", "sort_order": 11, "active": true}, {"dataset_key": "cod_fee_rules", "sheet_name": "COD_Fee_Rules (EN)", "display_name_en": "COD Fee Rules", "display_name_mm": "COD ကြေး သတ်မှတ်ချက်", "category": "Finance", "primary_key": "rule_code", "sort_order": 12, "active": true}, {"dataset_key": "surcharge_rules", "sheet_name": "Surcharge_Rules (EN)", "display_name_en": "Surcharge Rules", "display_name_mm": "ဖြည့်ကြေး သတ်မှတ်ချက်", "category": "Finance", "primary_key": "surcharge_code", "sort_order": 13, "active": true}, {"dataset_key": "cargo_dropoff_rate", "sheet_name": "Cargo_Dropoff_Rate (EN)", "display_name_en": "Cargo Dropoff Rate", "display_name_mm": "ကုန်ချ နှုန်းထား", "category": "Finance", "primary_key": "dropoff_code", "sort_order": 14, "active": true}]$json$)
  as x(
    dataset_key text,
    sheet_name text,
    display_name_en text,
    display_name_mm text,
    category text,
    primary_key text,
    sort_order integer,
    active boolean
  )
)
insert into public.be_master_data_tabs (
  dataset_key, sheet_name, display_name_en, display_name_mm, category, primary_key, sort_order, active, updated_at
)
select dataset_key, sheet_name, display_name_en, display_name_mm, category, primary_key, sort_order, active, now()
from src
on conflict (dataset_key) do update set
  sheet_name = excluded.sheet_name,
  display_name_en = excluded.display_name_en,
  display_name_mm = excluded.display_name_mm,
  category = excluded.category,
  primary_key = excluded.primary_key,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

with src as (
  select *
  from jsonb_to_recordset($json$[{"dataset_key": "merchant_master", "field_key": "merchant_code", "label_en": "Merchant Code", "label_mm": "Merchant Code", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "merchant_master", "field_key": "merchant_name", "label_en": "Merchant Name", "label_mm": "Merchant Name", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "merchant_master", "field_key": "business_type", "label_en": "Business Type", "label_mm": "Business Type", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Retail", "Wholesale", "E-commerce", "Marketplace", "Corporate", "SME", "Individual Seller", "Online Shop", "Book Store", "Branch Office"], "sort_order": 3}, {"dataset_key": "merchant_master", "field_key": "contact_person", "label_en": "Contact Person", "label_mm": "Contact Person", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "merchant_master", "field_key": "phone_primary", "label_en": "Phone Primary", "label_mm": "Phone Primary", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "merchant_master", "field_key": "phone_secondary", "label_en": "Phone Secondary", "label_mm": "Phone Secondary", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "merchant_master", "field_key": "email", "label_en": "Email", "label_mm": "Email", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "merchant_master", "field_key": "address_line_1", "label_en": "Address Line 1", "label_mm": "Address Line 1", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 8}, {"dataset_key": "merchant_master", "field_key": "address_line_2", "label_en": "Address Line 2", "label_mm": "Address Line 2", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 9}, {"dataset_key": "merchant_master", "field_key": "township", "label_en": "Township", "label_mm": "Township", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 10}, {"dataset_key": "merchant_master", "field_key": "city", "label_en": "City", "label_mm": "City", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Yangon", "Mandalay", "Naypyidaw", "Mawlamyine", "Bago", "Pathein", "Taunggyi", "Sittwe", "Myitkyina", "Lashio"], "sort_order": 11}, {"dataset_key": "merchant_master", "field_key": "region_state", "label_en": "Region State", "label_mm": "Region State", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Yangon Region", "Mandalay Region", "Naypyidaw Union Territory", "Mon State", "Bago Region", "Ayeyarwady Region", "Shan State", "Rakhine State", "Kachin State", "Sagaing Region", "Magway Region", "Tanintharyi Region", "Kayah State", "Kayin State", "Chin State"], "sort_order": 12}, {"dataset_key": "merchant_master", "field_key": "default_pickup_address", "label_en": "Default Pickup Address", "label_mm": "Default Pickup Address", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 13}, {"dataset_key": "merchant_master", "field_key": "default_pickup_time_window", "label_en": "Default Pickup Time Window", "label_mm": "Default Pickup Time Window", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 14}, {"dataset_key": "merchant_master", "field_key": "payment_terms", "label_en": "Payment Terms", "label_mm": "Payment Terms", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["COD", "Prepaid", "Monthly Billing", "Merchant Credit", "Bank Transfer"], "sort_order": 15}, {"dataset_key": "merchant_master", "field_key": "contract_status", "label_en": "Contract Status", "label_mm": "Contract Status", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Rejected", "Inactive"], "sort_order": 16}, {"dataset_key": "merchant_master", "field_key": "is_active", "label_en": "Is Active", "label_mm": "Is Active", "data_type": "boolean", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 17}, {"dataset_key": "merchant_master", "field_key": "standard_allowance_kg", "label_en": "Standard Allowance Kg", "label_mm": "Standard Allowance Kg", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 18}, {"dataset_key": "merchant_master", "field_key": "special_allowance_kg", "label_en": "Special Allowance Kg", "label_mm": "Special Allowance Kg", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 19}, {"dataset_key": "merchant_master", "field_key": "extra_per_kg_mmk", "label_en": "Extra Per Kg Mmk", "label_mm": "Extra Per Kg Mmk", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 20}, {"dataset_key": "rider_master", "field_key": "rider_id", "label_en": "Rider Id", "label_mm": "ရိုင်ဒါ ID", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "rider_master", "field_key": "rider_name", "label_en": "Rider Name", "label_mm": "ရိုင်ဒါ အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "rider_master", "field_key": "phone_primary", "label_en": "Phone Primary", "label_mm": "ဖုန်းနံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "rider_master", "field_key": "nrc_or_id_no", "label_en": "Nrc Or Id No", "label_mm": "မှတ်ပုံတင်နံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "rider_master", "field_key": "assigned_zone", "label_en": "Assigned Zone", "label_mm": "သတ်မှတ်ဇုန်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Yangon Central", "Yangon West", "Yangon East", "Yangon North", "Yangon South", "Mandalay Central", "Upper Myanmar", "Lower Myanmar"], "sort_order": 5}, {"dataset_key": "rider_master", "field_key": "employment_type", "label_en": "Employment Type", "label_mm": "အလုပ်အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Permanent", "Contract", "Part-time", "Temporary", "Partner"], "sort_order": 6}, {"dataset_key": "rider_master", "field_key": "status", "label_en": "Status", "label_mm": "အခြေအနေ", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Inactive", "Suspended", "Blacklisted"], "sort_order": 7}, {"dataset_key": "driver_master", "field_key": "driver_id", "label_en": "Driver Id", "label_mm": "ဒရိုင်ဘာ ID", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "driver_master", "field_key": "driver_name", "label_en": "Driver Name", "label_mm": "ဒရိုင်ဘာ အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "driver_master", "field_key": "phone_primary", "label_en": "Phone Primary", "label_mm": "ဖုန်းနံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "driver_master", "field_key": "license_no", "label_en": "License No", "label_mm": "လိုင်စင်နံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "driver_master", "field_key": "license_expiry_date", "label_en": "License Expiry Date", "label_mm": "လိုင်စင် သက်တမ်းကုန်ဆုံးရက်", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "driver_master", "field_key": "assigned_fleet_id", "label_en": "Assigned Fleet Id", "label_mm": "ယာဉ် ID", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "driver_master", "field_key": "status", "label_en": "Status", "label_mm": "အခြေအနေ", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Inactive", "Suspended", "Blacklisted"], "sort_order": 7}, {"dataset_key": "helper_master", "field_key": "helper_id", "label_en": "Helper Id", "label_mm": "ကူညီသူ ID", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "helper_master", "field_key": "helper_name", "label_en": "Helper Name", "label_mm": "ကူညီသူ အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "helper_master", "field_key": "phone_primary", "label_en": "Phone Primary", "label_mm": "ဖုန်းနံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "helper_master", "field_key": "assigned_zone", "label_en": "Assigned Zone", "label_mm": "သတ်မှတ်ဇုန်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Yangon Central", "Yangon West", "Yangon East", "Yangon North", "Yangon South", "Mandalay Central", "Upper Myanmar", "Lower Myanmar"], "sort_order": 4}, {"dataset_key": "helper_master", "field_key": "employment_type", "label_en": "Employment Type", "label_mm": "အလုပ်အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Permanent", "Contract", "Part-time", "Temporary", "Partner"], "sort_order": 5}, {"dataset_key": "helper_master", "field_key": "status", "label_en": "Status", "label_mm": "အခြေအနေ", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Inactive", "Suspended", "Blacklisted"], "sort_order": 6}, {"dataset_key": "employee_master", "field_key": "employee_id", "label_en": "Employee Id", "label_mm": "ဝန်ထမ်း ID", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "employee_master", "field_key": "employee_name", "label_en": "Employee Name", "label_mm": "ဝန်ထမ်း အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "employee_master", "field_key": "role_id", "label_en": "Role Id", "label_mm": "ရာထူး", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["customer_service", "marketing", "business_development_manager", "supervisor", "operation_manager", "warehouse", "finance", "finance_manager", "admin", "superadmin", "data entry", "Sales & Marketing Assistant"], "sort_order": 3}, {"dataset_key": "employee_master", "field_key": "department", "label_en": "Department", "label_mm": "ဌာန", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Customer Service", "Marketing", "Business Development", "Operation", "Warehouse", "Finance", "Admin", "Management"], "sort_order": 4}, {"dataset_key": "employee_master", "field_key": "phone_primary", "label_en": "Phone Primary", "label_mm": "ဖုန်းနံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "employee_master", "field_key": "email", "label_en": "Email", "label_mm": "အီးမေးလ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "employee_master", "field_key": "supervisor_employee_id", "label_en": "Supervisor Employee Id", "label_mm": "အကြီးအကဲ ID", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "employee_master", "field_key": "status", "label_en": "Status", "label_mm": "အခြေအနေ", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Inactive", "Suspended", "Blacklisted"], "sort_order": 8}, {"dataset_key": "fleet_master", "field_key": "fleet_id", "label_en": "Fleet Id", "label_mm": "ယာဉ် ID", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "fleet_master", "field_key": "vehicle_no", "label_en": "Vehicle No", "label_mm": "ယာဉ်နံပါတ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "fleet_master", "field_key": "vehicle_type", "label_en": "Vehicle Type", "label_mm": "ယာဉ်အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Bike", "Van", "Truck", "Mini Truck", "Car", "Partner Vehicle"], "sort_order": 3}, {"dataset_key": "fleet_master", "field_key": "capacity_kg", "label_en": "Capacity Kg", "label_mm": "တင်နိုင် ကီလိုဂရမ်", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "fleet_master", "field_key": "capacity_cbm", "label_en": "Capacity Cbm", "label_mm": "ထုထည် (CBM)", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "fleet_master", "field_key": "assigned_driver_id", "label_en": "Assigned Driver Id", "label_mm": "ဒရိုင်ဘာ ID", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "fleet_master", "field_key": "ownership_type", "label_en": "Ownership Type", "label_mm": "ပိုင်ဆိုင်မှု", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Owned", "Rented", "Partner", "Leased"], "sort_order": 7}, {"dataset_key": "fleet_master", "field_key": "insurance_expiry_date", "label_en": "Insurance Expiry Date", "label_mm": "အာမခံ သက်တမ်း", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 8}, {"dataset_key": "fleet_master", "field_key": "status", "label_en": "Status", "label_mm": "ယာဉ် အခြေအနေ", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Draft", "Submitted", "Approved", "Active", "Inactive", "Suspended", "Blacklisted"], "sort_order": 9}, {"dataset_key": "fleet_master", "field_key": "zone_note", "label_en": "Zone Note", "label_mm": "ဇုန် မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 10}, {"dataset_key": "service_types", "field_key": "service_type", "label_en": "Service Type", "label_mm": "ဝန်ဆောင်မှု ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "service_types", "field_key": "name_en", "label_en": "Name En", "label_mm": "အင်္ဂလိပ် အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "service_types", "field_key": "name_mm", "label_en": "Name Mm", "label_mm": "မြန်မာ အမည်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "service_types", "field_key": "description", "label_en": "Description", "label_mm": "ဖော်ပြချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "service_types", "field_key": "is_active", "label_en": "Is Active", "label_mm": "အသုံးပြုနေသည်", "data_type": "boolean", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "weight_brackets", "field_key": "weight_bracket_code", "label_en": "Weight Bracket Code", "label_mm": "အလေးချိန် ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "weight_brackets", "field_key": "weight_from_kg", "label_en": "Weight From Kg", "label_mm": "နည်းဆုံး ကီလိုဂရမ်", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "weight_brackets", "field_key": "weight_to_kg", "label_en": "Weight To Kg", "label_mm": "အများဆုံး ကီလိုဂရမ်", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "weight_brackets", "field_key": "description", "label_en": "Description", "label_mm": "ဖော်ပြချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "vehicle_capacity", "field_key": "vehicle_code", "label_en": "Vehicle Code", "label_mm": "ယာဉ် ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "vehicle_capacity", "field_key": "vehicle_name", "label_en": "Vehicle Name", "label_mm": "ယာဉ်မော်ဒယ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "vehicle_capacity", "field_key": "vehicle_type", "label_en": "Vehicle Type", "label_mm": "ယာဉ်အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": ["Bike", "Van", "Truck", "Mini Truck", "Car", "Partner Vehicle"], "sort_order": 3}, {"dataset_key": "vehicle_capacity", "field_key": "safe_capacity_kg", "label_en": "Safe Capacity Kg", "label_mm": "တင်နိုင် ကီလိုဂရမ်", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "vehicle_capacity", "field_key": "safe_capacity_cbm", "label_en": "Safe Capacity Cbm", "label_mm": "ထုထည် CBM", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "vehicle_capacity", "field_key": "notes", "label_en": "Notes", "label_mm": "မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "zone_master", "field_key": "state_region_code", "label_en": "State Region Code", "label_mm": "ပြည်နယ်/တိုင်း ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "zone_master", "field_key": "state_region_name_en", "label_en": "State Region Name En", "label_mm": "ပြည်နယ်/တိုင်း (EN)", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "zone_master", "field_key": "state_region_name_mm", "label_en": "State Region Name Mm", "label_mm": "ပြည်နယ်/တိုင်း (MM)", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "zone_master", "field_key": "suggested_zone_group", "label_en": "Suggested Zone Group", "label_mm": "ဇုန်အုပ်စု (ကနဦး)", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "zone_master", "field_key": "zone_label_final", "label_en": "Zone Label Final", "label_mm": "ဇုန် ပြတ်ပြတ်သားသား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "zone_master", "field_key": "notes", "label_en": "Notes", "label_mm": "မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "township_master", "field_key": "township_code", "label_en": "Township Code", "label_mm": "Township Code", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "township_master", "field_key": "township_name_en", "label_en": "Township Name En", "label_mm": "Township Name En", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "township_master", "field_key": "township_name_mm", "label_en": "Township Name Mm", "label_mm": "Township Name Mm", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "township_master", "field_key": "state_region_code", "label_en": "State Region Code", "label_mm": "State Region Code", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "township_master", "field_key": "state_region_name_en", "label_en": "State Region Name En", "label_mm": "State Region Name En", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "township_master", "field_key": "state_region_name_mm", "label_en": "State Region Name Mm", "label_mm": "State Region Name Mm", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "township_master", "field_key": "township_name_for_current_app", "label_en": "Township Name For Current App", "label_mm": "Township Name For Current App", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "cod_fee_rules", "field_key": "rule_code", "label_en": "Rule Code", "label_mm": "သတ်မှတ်ချက် ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "cod_fee_rules", "field_key": "version_code", "label_en": "Version Code", "label_mm": "ဗားရှင်း ကုဒ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "cod_fee_rules", "field_key": "service_type", "label_en": "Service Type", "label_mm": "ဝန်ဆောင်မှု", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "cod_fee_rules", "field_key": "cod_amount_from_mmk", "label_en": "Cod Amount From Mmk", "label_mm": "COD မှ", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "cod_fee_rules", "field_key": "cod_amount_to_mmk", "label_en": "Cod Amount To Mmk", "label_mm": "COD သို့", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "cod_fee_rules", "field_key": "cod_fee_fixed_mmk", "label_en": "Cod Fee Fixed Mmk", "label_mm": "တည်ငြိမ်ကြေး", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "cod_fee_rules", "field_key": "cod_fee_percent", "label_en": "Cod Fee Percent", "label_mm": "ရာခိုင်နှုန်း", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "cod_fee_rules", "field_key": "min_cod_fee_mmk", "label_en": "Min Cod Fee Mmk", "label_mm": "အနည်းဆုံး ကြေး", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 8}, {"dataset_key": "cod_fee_rules", "field_key": "max_cod_fee_mmk", "label_en": "Max Cod Fee Mmk", "label_mm": "အများဆုံး ကြေး", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 9}, {"dataset_key": "cod_fee_rules", "field_key": "effective_from", "label_en": "Effective From", "label_mm": "ထိရောက်သည့်ရက်", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 10}, {"dataset_key": "cod_fee_rules", "field_key": "effective_to", "label_en": "Effective To", "label_mm": "ကုန်ဆုံးရက်", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 11}, {"dataset_key": "cod_fee_rules", "field_key": "is_active", "label_en": "Is Active", "label_mm": "အသုံးပြုနေသည်", "data_type": "boolean", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 12}, {"dataset_key": "cod_fee_rules", "field_key": "notes", "label_en": "Notes", "label_mm": "မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 13}, {"dataset_key": "surcharge_rules", "field_key": "surcharge_code", "label_en": "Surcharge Code", "label_mm": "ဖြည့်ကြေး ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "surcharge_rules", "field_key": "version_code", "label_en": "Version Code", "label_mm": "ဗားရှင်း ကုဒ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "surcharge_rules", "field_key": "surcharge_type", "label_en": "Surcharge Type", "label_mm": "ဖြည့်ကြေး အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "surcharge_rules", "field_key": "state_region_code", "label_en": "State Region Code", "label_mm": "ပြည်နယ်/တိုင်း ကုဒ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "surcharge_rules", "field_key": "township_code", "label_en": "Township Code", "label_mm": "မြို့နယ် ကုဒ်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "surcharge_rules", "field_key": "zone_label", "label_en": "Zone Label", "label_mm": "ဇုန် ပြတ်ပြတ်သားသား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "surcharge_rules", "field_key": "amount_mmk", "label_en": "Amount Mmk", "label_mm": "ပမာဏ (MMK)", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "surcharge_rules", "field_key": "percent", "label_en": "Percent", "label_mm": "ရာခိုင်နှုန်း", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 8}, {"dataset_key": "surcharge_rules", "field_key": "start_date", "label_en": "Start Date", "label_mm": "စတင်ရက်", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 9}, {"dataset_key": "surcharge_rules", "field_key": "end_date", "label_en": "End Date", "label_mm": "ကုန်ဆုံးရက်", "data_type": "date", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 10}, {"dataset_key": "surcharge_rules", "field_key": "is_active", "label_en": "Is Active", "label_mm": "အသုံးပြုနေသည်", "data_type": "boolean", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 11}, {"dataset_key": "surcharge_rules", "field_key": "notes", "label_en": "Notes", "label_mm": "မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 12}, {"dataset_key": "cargo_dropoff_rate", "field_key": "dropoff_code", "label_en": "Dropoff Code", "label_mm": "ကုန်ချ ကုဒ်", "data_type": "text", "required": true, "editable": true, "visible": true, "options": [], "sort_order": 1}, {"dataset_key": "cargo_dropoff_rate", "field_key": "dropoff_name_en", "label_en": "Dropoff Name En", "label_mm": "ကုန်ချ လုပ်ဆောင်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 2}, {"dataset_key": "cargo_dropoff_rate", "field_key": "location_type", "label_en": "Location Type", "label_mm": "တည်နေရာ အမျိုးအစား", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 3}, {"dataset_key": "cargo_dropoff_rate", "field_key": "base_fee_mmk", "label_en": "Base Fee Mmk", "label_mm": "အခြေခံ ကြေး (MMK)", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 4}, {"dataset_key": "cargo_dropoff_rate", "field_key": "included_weight_kg", "label_en": "Included Weight Kg", "label_mm": "ပါဝင်သော ကီလိုဂရမ်", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 5}, {"dataset_key": "cargo_dropoff_rate", "field_key": "extra_per_started_kg_mmk", "label_en": "Extra Per Started Kg Mmk", "label_mm": "ထပ်တိုး ကီလိုကြေး", "data_type": "number", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 6}, {"dataset_key": "cargo_dropoff_rate", "field_key": "currency", "label_en": "Currency", "label_mm": "ငွေကြေး", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 7}, {"dataset_key": "cargo_dropoff_rate", "field_key": "notes", "label_en": "Notes", "label_mm": "မှတ်ချက်", "data_type": "text", "required": false, "editable": true, "visible": true, "options": [], "sort_order": 8}]$json$)
  as x(
    dataset_key text,
    field_key text,
    label_en text,
    label_mm text,
    data_type text,
    required boolean,
    editable boolean,
    visible boolean,
    options jsonb,
    sort_order integer
  )
)
insert into public.be_master_data_columns (
  dataset_key, field_key, label_en, label_mm, data_type, required, editable, visible, options, sort_order, updated_at
)
select dataset_key, field_key, label_en, label_mm, coalesce(data_type,'text'), coalesce(required,false),
       coalesce(editable,true), coalesce(visible,true), coalesce(options,'[]'::jsonb), sort_order, now()
from src
on conflict (dataset_key, field_key) do update set
  label_en = excluded.label_en,
  label_mm = excluded.label_mm,
  data_type = excluded.data_type,
  required = excluded.required,
  editable = excluded.editable,
  visible = excluded.visible,
  options = excluded.options,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Preserve rows from the currently installed legacy snapshot when possible.
do $$
declare
  v jsonb;
  r jsonb;
  rk text;
  ds text;
  role_text text;
  payload jsonb;
begin
  if to_regprocedure('public.be_master_data_page_snapshot()') is not null then
    begin
      execute 'select public.be_master_data_page_snapshot()' into v;
    exception when others then
      v := null;
    end;

    if v is not null then
      for r in select value from jsonb_array_elements(coalesce(v->'merchants','[]'::jsonb)) loop
        rk := coalesce(r->>'merchant_code', r->>'code', r->>'id', r->>'merchant_id', r->>'name');
        if rk is not null and btrim(rk) <> '' then
          payload := r || jsonb_build_object(
            'merchant_code', rk,
            'merchant_name', coalesce(r->>'merchant_name', r->>'name'),
            'phone_primary', coalesce(r->>'phone_primary', r->>'phone'),
            'township', coalesce(r->>'township', r->>'town'),
            'address_line_1', coalesce(r->>'address_line_1', r->>'address'),
            'status', coalesce(r->>'status', 'ACTIVE')
          );
          insert into public.be_master_data_rows(dataset_key, record_key, payload, status, updated_by_email)
          values ('merchant_master', rk, payload, coalesce(r->>'status','ACTIVE'), 'legacy-snapshot')
          on conflict (dataset_key, record_key) do nothing;
        end if;
      end loop;

      for r in select value from jsonb_array_elements(coalesce(v->'workforce','[]'::jsonb)) loop
        role_text := lower(coalesce(r->>'role', r->>'role_id', 'employee'));
        ds := case
          when role_text like '%rider%' then 'rider_master'
          when role_text like '%driver%' then 'driver_master'
          when role_text like '%helper%' then 'helper_master'
          else 'employee_master'
        end;
        rk := coalesce(r->>'rider_id', r->>'driver_id', r->>'helper_id', r->>'employee_id', r->>'id', r->>'code', r->>'name');
        if rk is not null and btrim(rk) <> '' then
          payload := r || jsonb_build_object(
            case when ds = 'rider_master' then 'rider_id'
                 when ds = 'driver_master' then 'driver_id'
                 when ds = 'helper_master' then 'helper_id'
                 else 'employee_id' end,
            rk,
            'status', coalesce(r->>'status', 'ACTIVE')
          );
          insert into public.be_master_data_rows(dataset_key, record_key, payload, status, updated_by_email)
          values (ds, rk, payload, coalesce(r->>'status','ACTIVE'), 'legacy-snapshot')
          on conflict (dataset_key, record_key) do nothing;
        end if;
      end loop;

      for r in select value from jsonb_array_elements(coalesce(v->'fleets','[]'::jsonb)) loop
        rk := coalesce(r->>'fleet_id', r->>'id', r->>'vehicle_no');
        if rk is not null and btrim(rk) <> '' then
          payload := r || jsonb_build_object(
            'fleet_id', rk,
            'vehicle_no', coalesce(r->>'vehicle_no', r->>'id'),
            'vehicle_type', coalesce(r->>'vehicle_type', r->>'type'),
            'capacity_kg', coalesce(r->>'capacity_kg', r->>'capacity'),
            'status', coalesce(r->>'status', 'ACTIVE')
          );
          insert into public.be_master_data_rows(dataset_key, record_key, payload, status, updated_by_email)
          values ('fleet_master', rk, payload, coalesce(r->>'status','ACTIVE'), 'legacy-snapshot')
          on conflict (dataset_key, record_key) do nothing;
        end if;
      end loop;
    end if;
  end if;
end $$;

-- Remove old overloaded master-data RPCs to prevent PostgREST ambiguity.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'be_master_data_snapshot',
        'be_master_data_page_snapshot',
        'be_master_data_upsert_row',
        'be_master_data_delete_row',
        'be_master_data_bulk_upsert',
        'be_master_data_sync_to_live_tables',
        'be_master_data_healthcheck'
      )
  loop
    execute 'drop function if exists ' || f.signature || ' cascade';
  end loop;
end $$;

drop function if exists public.be_master_data_snapshot(text,text,integer,integer);
create or replace function public.be_master_data_snapshot(
  p_dataset_key text default null,
  p_search text default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_datasets jsonb;
  v_rows jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(
    to_jsonb(t) || jsonb_build_object(
      'fields',
      coalesce((
        select jsonb_agg(to_jsonb(c) order by c.sort_order, c.field_key)
        from public.be_master_data_columns c
        where c.dataset_key = t.dataset_key
          and coalesce(c.visible,true) = true
      ), '[]'::jsonb),
      'row_count',
      (select count(*) from public.be_master_data_rows r where r.dataset_key = t.dataset_key and r.deleted_at is null)
    )
    order by t.sort_order, t.display_name_en
  ), '[]'::jsonb)
  into v_datasets
  from public.be_master_data_tabs t
  where t.active = true
    and (p_dataset_key is null or t.dataset_key = p_dataset_key);

  with filtered as (
    select r.*
    from public.be_master_data_rows r
    join public.be_master_data_tabs t on t.dataset_key = r.dataset_key and t.active = true
    where r.deleted_at is null
      and (p_dataset_key is null or r.dataset_key = p_dataset_key)
      and (
        nullif(btrim(coalesce(p_search,'')), '') is null
        or r.record_key ilike '%' || p_search || '%'
        or r.status ilike '%' || p_search || '%'
        or r.payload::text ilike '%' || p_search || '%'
      )
    order by r.dataset_key, r.record_key
    limit greatest(coalesce(p_limit,500), 1)
    offset greatest(coalesce(p_offset,0), 0)
  ),
  grouped as (
    select dataset_key,
           jsonb_agg(jsonb_build_object(
             'id', id,
             'dataset_key', dataset_key,
             'record_key', record_key,
             'payload', payload,
             'status', status,
             'updated_at', updated_at,
             'updated_by_email', updated_by_email
           ) order by record_key) as rows
    from filtered
    group by dataset_key
  )
  select coalesce(jsonb_object_agg(dataset_key, rows), '{}'::jsonb)
  into v_rows
  from grouped;

  select jsonb_build_object(
    'datasets', (select count(*) from public.be_master_data_tabs where active),
    'columns', (select count(*) from public.be_master_data_columns),
    'rows', (select count(*) from public.be_master_data_rows where deleted_at is null),
    'merchants', (select count(*) from public.be_master_data_rows where dataset_key = 'merchant_master' and deleted_at is null),
    'workforce', (select count(*) from public.be_master_data_rows where dataset_key in ('rider_master','driver_master','helper_master','employee_master') and deleted_at is null),
    'fleets', (select count(*) from public.be_master_data_rows where dataset_key = 'fleet_master' and deleted_at is null)
  )
  into v_counts;

  return jsonb_build_object(
    'ok', true,
    'datasets', v_datasets,
    'tabs', v_datasets,
    'records_by_dataset', v_rows,
    'counts', v_counts,

    -- Compatibility keys for the existing portal structure.
    'merchants', coalesce(v_rows->'merchant_master', '[]'::jsonb),
    'workforce',
      coalesce(v_rows->'rider_master','[]'::jsonb)
      || coalesce(v_rows->'driver_master','[]'::jsonb)
      || coalesce(v_rows->'helper_master','[]'::jsonb)
      || coalesce(v_rows->'employee_master','[]'::jsonb),
    'fleets', coalesce(v_rows->'fleet_master', '[]'::jsonb),
    'townships', coalesce(v_rows->'township_master', '[]'::jsonb)
  );
end;
$$;

drop function if exists public.be_master_data_page_snapshot();
create or replace function public.be_master_data_page_snapshot()
returns jsonb
language sql
stable
as $$
  select public.be_master_data_snapshot(null, null, 500, 0);
$$;

drop function if exists public.be_master_data_upsert_row(text,text,jsonb,text,text);
create or replace function public.be_master_data_upsert_row(
  p_dataset_key text,
  p_record_key text,
  p_payload jsonb,
  p_status text default 'ACTIVE',
  p_actor_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_tab public.be_master_data_tabs%rowtype;
  v_key text;
  v_old jsonb;
  v_row public.be_master_data_rows%rowtype;
begin
  select * into v_tab
  from public.be_master_data_tabs
  where dataset_key = p_dataset_key and active = true;

  if not found then
    raise exception 'Unknown or inactive master dataset: %', p_dataset_key;
  end if;

  v_key := nullif(btrim(coalesce(p_record_key, p_payload->>v_tab.primary_key)), '');
  if v_key is null then
    raise exception 'Missing primary key % for dataset %', v_tab.primary_key, p_dataset_key;
  end if;

  select to_jsonb(r) into v_old
  from public.be_master_data_rows r
  where r.dataset_key = p_dataset_key and r.record_key = v_key;

  insert into public.be_master_data_rows (
    dataset_key, record_key, payload, status, updated_by_email, updated_at, deleted_at
  )
  values (
    p_dataset_key,
    v_key,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(v_tab.primary_key, v_key),
    coalesce(nullif(btrim(p_status),''),'ACTIVE'),
    p_actor_email,
    now(),
    null
  )
  on conflict (dataset_key, record_key) do update set
    payload = excluded.payload,
    status = excluded.status,
    updated_by_email = excluded.updated_by_email,
    updated_at = now(),
    deleted_at = null
  returning * into v_row;

  insert into public.be_master_data_audit_log(dataset_key, record_key, action, old_payload, new_payload, actor_email)
  values (p_dataset_key, v_key, case when v_old is null then 'INSERT' else 'UPDATE' end, v_old, to_jsonb(v_row), p_actor_email);

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

drop function if exists public.be_master_data_delete_row(text,text,text);
create or replace function public.be_master_data_delete_row(
  p_dataset_key text,
  p_record_key text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_old jsonb;
begin
  select to_jsonb(r) into v_old
  from public.be_master_data_rows r
  where r.dataset_key = p_dataset_key and r.record_key = p_record_key and r.deleted_at is null;

  update public.be_master_data_rows
  set deleted_at = now(),
      status = 'DELETED',
      updated_at = now(),
      updated_by_email = p_actor_email
  where dataset_key = p_dataset_key
    and record_key = p_record_key
    and deleted_at is null;

  insert into public.be_master_data_audit_log(dataset_key, record_key, action, old_payload, new_payload, actor_email)
  values (p_dataset_key, p_record_key, 'DELETE', v_old, null, p_actor_email);

  return jsonb_build_object('ok', true, 'deleted', found);
end;
$$;

drop function if exists public.be_master_data_bulk_upsert(text,jsonb,text);
create or replace function public.be_master_data_bulk_upsert(
  p_dataset_key text,
  p_rows jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_tab public.be_master_data_tabs%rowtype;
  v_row jsonb;
  v_payload jsonb;
  v_key text;
  v_count integer := 0;
begin
  select * into v_tab
  from public.be_master_data_tabs
  where dataset_key = p_dataset_key and active = true;

  if not found then
    raise exception 'Unknown or inactive master dataset: %', p_dataset_key;
  end if;

  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_payload := case
      when v_row ? 'payload' then coalesce(v_row->'payload','{}'::jsonb)
      else v_row - 'record_key' - 'status'
    end;

    v_key := nullif(btrim(coalesce(v_row->>'record_key', v_payload->>v_tab.primary_key)), '');
    if v_key is not null then
      perform public.be_master_data_upsert_row(
        p_dataset_key,
        v_key,
        v_payload,
        coalesce(v_row->>'status', v_payload->>'status', 'ACTIVE'),
        p_actor_email
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'dataset_key', p_dataset_key, 'upserted', v_count);
end;
$$;

create or replace view public.be_v_master_data_active_rows as
select
  r.id,
  r.dataset_key,
  t.display_name_en,
  t.display_name_mm,
  t.category,
  t.primary_key,
  r.record_key,
  r.payload,
  r.status,
  r.updated_at,
  r.updated_by_email
from public.be_master_data_rows r
join public.be_master_data_tabs t on t.dataset_key = r.dataset_key
where r.deleted_at is null
  and t.active = true;

create or replace view public.be_v_master_merchants as
select
  record_key as merchant_code,
  coalesce(payload->>'merchant_name', payload->>'name') as merchant_name,
  coalesce(payload->>'business_type', payload->>'customer_type') as business_type,
  coalesce(payload->>'contact_person', payload->>'owner_name') as contact_person,
  coalesce(payload->>'phone_primary', payload->>'phone') as phone_primary,
  payload->>'phone_secondary' as phone_secondary,
  payload->>'email' as email,
  coalesce(payload->>'address_line_1', payload->>'address') as address_line_1,
  payload->>'township' as township,
  payload->>'city' as city,
  payload->>'region_state' as region_state,
  coalesce(payload->>'payment_terms', payload->>'payment_type') as payment_terms,
  status,
  payload,
  updated_at
from public.be_v_master_data_active_rows
where dataset_key = 'merchant_master';

create or replace view public.be_v_master_workforce as
select
  dataset_key,
  record_key as worker_id,
  coalesce(payload->>'rider_name', payload->>'driver_name', payload->>'helper_name', payload->>'employee_name', payload->>'name') as worker_name,
  case dataset_key
    when 'rider_master' then 'RIDER'
    when 'driver_master' then 'DRIVER'
    when 'helper_master' then 'HELPER'
    else coalesce(payload->>'role_id', 'EMPLOYEE')
  end as role_code,
  coalesce(payload->>'phone_primary', payload->>'phone') as phone_primary,
  coalesce(payload->>'assigned_zone', payload->>'zone') as assigned_zone,
  payload->>'assigned_fleet_id' as assigned_fleet_id,
  status,
  payload,
  updated_at
from public.be_v_master_data_active_rows
where dataset_key in ('rider_master','driver_master','helper_master','employee_master');

create or replace view public.be_v_master_fleets as
select
  record_key as fleet_id,
  coalesce(payload->>'vehicle_no', payload->>'plate_no') as vehicle_no,
  payload->>'vehicle_type' as vehicle_type,
  nullif(payload->>'capacity_kg','')::numeric as capacity_kg,
  nullif(payload->>'capacity_cbm','')::numeric as capacity_cbm,
  payload->>'assigned_driver_id' as assigned_driver_id,
  payload->>'ownership_type' as ownership_type,
  payload->>'zone_note' as zone_note,
  status,
  payload,
  updated_at
from public.be_v_master_data_active_rows
where dataset_key = 'fleet_master';

create or replace view public.be_v_master_townships as
select
  record_key as township_code,
  coalesce(payload->>'township_name_en', payload->>'township') as township_name_en,
  payload->>'township_name_mm' as township_name_mm,
  payload->>'state_region_code' as state_region_code,
  payload->>'state_region_name_en' as state_region_name_en,
  payload->>'state_region_name_mm' as state_region_name_mm,
  coalesce(payload->>'township_name_for_current_app', payload->>'township_name_en') as township_name_for_current_app,
  status,
  payload,
  updated_at
from public.be_v_master_data_active_rows
where dataset_key = 'township_master';

create or replace view public.be_v_master_tariff_inputs as
select *
from public.be_v_master_data_active_rows
where dataset_key in (
  'service_types','weight_brackets','vehicle_capacity','zone_master',
  'cod_fee_rules','surcharge_rules','cargo_dropoff_rate'
);

drop function if exists public.be_master_data_sync_to_live_tables(text,text);
create or replace function public.be_master_data_sync_to_live_tables(
  p_dataset_key text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_counts jsonb;
begin
  -- Go-live contract:
  -- Operational pages should read the public.be_v_master_* views or the snapshot RPC.
  -- This RPC validates the master catalogue and refreshes PostgREST schema cache.
  select jsonb_build_object(
    'ok', true,
    'dataset_key', p_dataset_key,
    'actor_email', p_actor_email,
    'merchants', (select count(*) from public.be_v_master_merchants),
    'workforce', (select count(*) from public.be_v_master_workforce),
    'fleets', (select count(*) from public.be_v_master_fleets),
    'townships', (select count(*) from public.be_v_master_townships),
    'tariff_inputs', (select count(*) from public.be_v_master_tariff_inputs)
  )
  into v_counts;

  perform pg_notify('pgrst', 'reload schema');
  return v_counts;
end;
$$;

drop function if exists public.be_master_data_healthcheck();
create or replace function public.be_master_data_healthcheck()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'datasets', (select count(*) from public.be_master_data_tabs where active),
      'columns', (select count(*) from public.be_master_data_columns),
      'rows', (select count(*) from public.be_master_data_rows where deleted_at is null),
      'merchants', (select count(*) from public.be_v_master_merchants),
      'workforce', (select count(*) from public.be_v_master_workforce),
      'fleets', (select count(*) from public.be_v_master_fleets),
      'townships', (select count(*) from public.be_v_master_townships)
    ),
    'tabs', (select jsonb_agg(dataset_key order by sort_order) from public.be_master_data_tabs where active),
    'views', jsonb_build_object(
      'be_v_master_merchants', to_regclass('public.be_v_master_merchants') is not null,
      'be_v_master_workforce', to_regclass('public.be_v_master_workforce') is not null,
      'be_v_master_fleets', to_regclass('public.be_v_master_fleets') is not null,
      'be_v_master_townships', to_regclass('public.be_v_master_townships') is not null
    )
  );
$$;

grant select on public.be_master_data_tabs to anon, authenticated;
grant select on public.be_master_data_columns to anon, authenticated;
grant select on public.be_master_data_rows to anon, authenticated;
grant select on public.be_master_data_audit_log to authenticated;
grant select on public.be_v_master_data_active_rows to anon, authenticated;
grant select on public.be_v_master_merchants to anon, authenticated;
grant select on public.be_v_master_workforce to anon, authenticated;
grant select on public.be_v_master_fleets to anon, authenticated;
grant select on public.be_v_master_townships to anon, authenticated;
grant select on public.be_v_master_tariff_inputs to anon, authenticated;

grant execute on function public.be_master_data_snapshot(text,text,integer,integer) to anon, authenticated;
grant execute on function public.be_master_data_page_snapshot() to anon, authenticated;
grant execute on function public.be_master_data_upsert_row(text,text,jsonb,text,text) to anon, authenticated;
grant execute on function public.be_master_data_delete_row(text,text,text) to anon, authenticated;
grant execute on function public.be_master_data_bulk_upsert(text,jsonb,text) to anon, authenticated;
grant execute on function public.be_master_data_sync_to_live_tables(text,text) to anon, authenticated;
grant execute on function public.be_master_data_healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';
