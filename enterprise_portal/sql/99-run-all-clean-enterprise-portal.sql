
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 00-bootstrap-core-schema.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 00-bootstrap-core-schema.sql
-- Run this before 70-79 module RPC SQL files.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.be_user_account_registry (
  user_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text,
  role text not null default 'guest',
  email text,
  phone_number text,
  branch_code text default 'YGN',
  vehicle_type text,
  license_plate text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_merchants (
  merchant_id text primary key,
  merchant_code text unique not null,
  merchant_name text not null,
  contact_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text default 'Yangon',
  payment_profile text default 'COD',
  service_profile text default 'Standard',
  tariff_tier text default 'Standard',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_riders (
  rider_id text primary key,
  rider_name text not null,
  phone_primary text,
  nrc_or_id_no text,
  assigned_zone text,
  employment_type text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_drivers (
  driver_id text primary key,
  driver_name text not null,
  phone_primary text,
  license_no text,
  license_expiry_date text,
  assigned_fleet_id text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_fleet (
  fleet_id text primary key,
  vehicle_no text,
  vehicle_type text,
  capacity_kg numeric,
  capacity_cbm numeric,
  assigned_driver_id text,
  ownership_type text,
  insurance_expiry_date text,
  status text,
  zone_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_mobile_workforce_accounts (
  worker_id text primary key,
  full_name text,
  role_type text not null,
  phone_number text,
  branch_code text default 'YGN',
  vehicle_type text,
  license_plate text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique not null,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  merchant_id text,
  merchant_code text,
  merchant_name text,
  sender_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text,
  recipient_name text,
  recipient_phone text,
  delivery_township text,
  delivery_address text,
  service_tier text default 'Standard',
  priority text default 'NORMAL',
  payment_method text default 'COD',
  cod_amount numeric default 0,
  cod_settled boolean default false,
  weight_kg numeric default 0,
  delivery_fee numeric default 0,
  status text not null default 'SUBMITTED',
  branch_code text default 'YGN',
  requester_type text default 'PORTAL',
  created_by uuid,
  assigned_rider_id text,
  assigned_rider_name text,
  route_label text,
  warehouse_location text,
  waybill_printed_at timestamptz,
  invoice_approved boolean,
  invoice_approved_at timestamptz,
  invoice_approved_by uuid,
  invoice_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_be_portal_pickup_status on public.be_portal_pickup_requests(status);
create index if not exists idx_be_portal_pickup_branch on public.be_portal_pickup_requests(branch_code);
create index if not exists idx_be_portal_pickup_created_at on public.be_portal_pickup_requests(created_at);
create index if not exists idx_be_portal_pickup_merchant on public.be_portal_pickup_requests(merchant_code);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  event_type text not null,
  description text,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_be_portal_events_pickup on public.be_portal_cargo_events(pickup_id);
create index if not exists idx_be_portal_events_created_at on public.be_portal_cargo_events(created_at);

create table if not exists public.be_bulk_upload_batches (
  batch_id uuid primary key default gen_random_uuid(),
  original_filename text,
  total_rows int default 0,
  valid_rows int default 0,
  invalid_rows int default 0,
  status text default 'UPLOADED',
  rows_json jsonb default '[]'::jsonb,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.be_tariff_master (
  tier_name text primary key,
  free_allowance_kg int not null default 3,
  base_fee_mmk int not null default 4000,
  extra_per_kg_mmk int not null default 500,
  highway_fee_mmk int not null default 3000,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.be_tariff_master(tier_name, free_allowance_kg, base_fee_mmk, extra_per_kg_mmk, highway_fee_mmk)
values
  ('Standard', 3, 4000, 500, 3000),
  ('Royal', 5, 4000, 500, 3000),
  ('Commitment', 5, 3500, 500, 3000)
on conflict (tier_name) do update set
  free_allowance_kg = excluded.free_allowance_kg,
  base_fee_mmk = excluded.base_fee_mmk,
  extra_per_kg_mmk = excluded.extra_per_kg_mmk,
  highway_fee_mmk = excluded.highway_fee_mmk,
  is_active = true,
  updated_at = now();

create table if not exists public.be_system_config (
  config_key text primary key,
  config_value text,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.be_system_config(config_key, config_value, description)
values
  ('portal_mode', 'production', 'Britium enterprise portal operating mode'),
  ('default_branch', 'YGN', 'Default branch when branch is not specified'),
  ('waybill_prefix', 'W', 'Waybill number prefix')
on conflict (config_key) do nothing;

create table if not exists public.be_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_at timestamptz not null default now()
);

-- Bootstrap helper: first authenticated user can register as admin only when registry is empty.
create or replace function public.be_bootstrap_first_admin(
  p_full_name text default 'Britium Admin',
  p_branch_code text default 'YGN'
) returns json
language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_count int;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_count from public.be_user_account_registry where status = 'active';

  if v_count > 0 then
    raise exception 'Admin bootstrap is locked because registry already has users';
  end if;

  insert into public.be_user_account_registry(auth_user_id, full_name, role, email, branch_code, status)
  values (v_uid, p_full_name, 'admin', v_email, p_branch_code, 'active')
  on conflict (auth_user_id) do update set role = 'admin', status = 'active', updated_at = now();

  return json_build_object('ok', true, 'role', 'admin', 'email', v_email);
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.be_bootstrap_first_admin(text,text) to authenticated;

notify pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 10-seed-masterdata-from-authoritative-template.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 10-seed-masterdata-from-authoritative-template.sql
-- Source: attached Britium master data template files.
-- This seed is idempotent and uses template codes as the only canonical source.
-- ============================================================

truncate public.be_masterdata_merchants cascade;
insert into public.be_masterdata_merchants(merchant_id, merchant_code, merchant_name, contact_phone, pickup_address, pickup_township, pickup_city, payment_profile, service_profile, tariff_tier, status) values
('ALN', 'ALN', 'Alnoor', '09448088835', 'No. (1526), Ward (45), Zawgyi Road, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('APA', 'APA', 'APAC', '09888867040', 'No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower', 'Tamwe', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('APS', 'APS', 'Aung Pyae Sone', '09752660008', 'No. (7), beside Ayeyarwun Main Road, Kwe Ma Housing, 10th Ward', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBG', 'BBG', 'Baby Genius', '09766482813', 'No. (284/979), Bo Moe Kyo Road, Ward (9), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBK', 'BBK', 'Baby Kyaw', '09796491867', 'No. (115-Ka), Ward (9), Yuzana Road, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBR', 'BBR', 'Best Buy in Rangoon', '09977730920', 'No. (2), Ground Floor, Maha Bawga Road, Hledan', 'Kamayut', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('BBT', 'BBT', 'BabyTop', '09699468766', 'No. (23), corner of 130th Street and Thone Myaung Road, Mingalar Taung Nyunt', 'Mingala Taung Nyunt', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY', 'CUY', 'Curvy (Office)', '09776527618', 'No. (896), Aung Thiri (2) Street, Ward (28)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY(YK)', 'CUY(YK)', 'Curvy (Yankin)', '09-772233150', 'No. (217), Thitsar Road, Ward (13), Yankin', 'Yankin', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('CUY(JS)', 'CUY(JS)', 'Curvy (Junction Square)', '09-754614522', 'Junction Square Shopping Mall, First Floor, Pyay Road and Kyun Taw Road, Kamayut', 'Kamayut', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('DDC', 'DDC', 'DDC BC', '0969793443', 'No. (422), Bo Myat Tun Road, corner of Zizawar Road, Ward (47)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'inactive'),
('DSD', 'DSD', 'Daw Sanda', '09776110406', 'No. (439), Nay Kyar 1 Street, Ward (50), North Dagon, Yangon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('ETE', 'ETE', 'Ei Tone', '095409045', 'Building No. (31), Room 6, West Kyo Kone Yeiktha, second street after Kyo Kone Flower Market, unnamed street on the road to Insein RTAD', 'Insein', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('HAM', 'HAM', 'HAIM', '0424426681', 'No. (665), Bo Saw Aung Road, Ward (9), East Dagon Township, Yangon Region', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('HMS', 'HMS', 'Hla Myittar Shin', '09264365636', 'No. (542), Lay Daunk Kan Ward, Kandaw Road, Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('JLS', 'JLS', 'July Sis', '09698793840', 'No. (232), Sakkawat (3) Street, Zay Market, North Okkalapa', 'North Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('KKK', 'KKK', 'Ko Kyaw Clothing', '09988198263', 'No. (23), Lutlatyay Lane (1), Ward (Ga), Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('LOS', 'LOS', 'Lady OS', '09981435810', 'No. (63), Pho Mye Road, on Myanmar Gon Yi Road, Mingalar Taung Nyunt', 'Mingala Taung Nyunt', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('MBO', 'MBO', 'MaBel OS', '09893341595', 'No. (825/B), Saw Yan Paing Road, Ward (29), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('MDY', 'MDY', 'Mandalay Branch', '09765540091', 'House No. (B/4), 65th Street, between 30th and 31st Streets, Mandalay', 'Mandalay', 'Mandalay', 'COD', 'Standard', 'Standard', 'active'),
('MEL', 'MEL', 'Mee Lay', '09799737996', 'No. (2212), Maha Bandula Road, Hlawga Lower Gate Bus Stop, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NDN', 'NDN', 'NDN', '09890334723', 'No. (1000), Anawrahta Road, Ward (38)', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NFS', 'NFS', 'Nwe Fashion', '09777099242', 'No. (57), Sipin Road, Ward 19(A), South Dagon', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NFT', 'NFT', 'Nfinity', '09794908400', 'Block 14(B), Ayar Chan Thar Condo, Dagon Seikkan Township, Ayeyarwun Main Road', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NHT', 'NHT', 'Nan Htike Tan', '09764881098', 'No. (689), Mayu (4) Street, Ward (6), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NPT', 'NPT', 'Nay Pyi Taw Branch', '09782326699', 'No. (5), Aung Zabu Ward (9), in front of Naypyidaw Council, Zabuthiri Township, Naypyidaw', 'Nay Pyi Taw', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PLE', 'PLE', 'Pleasure', '09740908663', 'No. (57), Ngu Wah Road, Ahlone', 'Alone', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('POC', 'POC', 'PO Clothing', '09420093957', 'No. (97/B), Mya Marlar Road, Ward (9), Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PPL', 'PPL', 'Poe Poe Lay', '09253420220', 'Between Streets 11 and 12, on Ayar Main Road, Nya Ward, North Okkalapa', 'North Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PRE', 'PRE', 'PREMIER', '09260644879', 'No. (299-A), Mya Marlar Road, Thaketa Industrial Zone', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PSO', 'PSO', 'Phyu Sin OS', '09740908663', 'No. (57), Ngu Wah Road, Ahlone', 'Kyimyindaing', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PTB', 'PTB', 'Pi Ti Sar Pay', '09257060323', 'No. (1170), Min Ye Kyaw Swar Main Road, Ward (133), East Dagon Township, Yangon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PTP', 'PTP', 'Pan Tharaphy', '095191464', 'No. (47/B1), Pho Sein Road, Bahan', 'Bahan', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PYT', 'PYT', 'Payit Ka lay', '09669716499', 'Police Staff Housing, Mahasi Sasana Yeiktha Road, Bahan', 'Bahan', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SEN', 'SEN', 'Shwe Eaint', '09944436600', 'No. (25), Aung Thapyay West (5) Street, Ward (7), Thaketa', 'Thaketa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SHS', 'SHS', 'Shwe Sin', '09975538286', 'No. (815), Anawrahta Road, Ward (9), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SMH', 'SMH', 'Shaw Mahar', '09777759111', 'No. (1235), corner of Min Road and Min Road (2), Ward (55), South Dagon', 'South Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SSF', 'SSF', 'Su Su Fashion World', '09786872727', 'Building (1), A1, Ward (42), U Wisara Main Road, in front of Maha Myaing Housing, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('STZ', 'STZ', 'Saung Thazin', '09799951012', 'No. (1074), Htan Chauk Pin, Thiri Mingalar Circular Road, in front of Kyan Taing Aung Pagoda, Phaya Lay Road, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SYE', 'SYE', 'Shwe Yee', '09752882403', 'Near Dagon Ayar Highway, Sein Tharaphu (2) Street, opposite Pattamyar Nwe Phone Shop', 'Hlaing Thar Yar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('TGK', 'TGK', 'Thingangyun Bracnh', '09424596830', 'No. (114/B), Pyitawaye Road, Lay Daunk Kan Ward, Thingangyun', 'Thingangyun', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('UQD', 'UQD', 'Unique/Diva', '09888867040', 'No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower', 'Tamwe', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('BBW', 'BBW', 'Baby world', '09759791826', 'No. (22), Bo Hmu Ba Htoo Road, Ward (6), East Dagon', 'East Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SFH', 'SFH', 'Sweety Fashion House', '09451578299', 'No. (879), Metta Road, in front of 13 Market, in front of Ngwe Yamone Market, South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('ZZE', 'ZZE', 'Zan Zan Export Clothings', '09673648505', 'No. (159-B), Thiri Mingalar Circular Road, Ward 5/6, Shwe Pyi Thar', 'Shwe Pyi Thar', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('FFU', 'FFU', 'Food For U', '099777809039', 'No. (1265), Ground Floor, Bo Min Yaung Road, Ward (41), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SOS', 'SOS', 'Singapore Online Shop', '09250050750', 'No. (716/A), Maha Bandula Road, also known as Mandalay Road, Ward (46), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('AK', 'AK', 'A&K Collection', '09-978939591', 'No. (125/B), Ward 14/3, Thandumar Main Road, near Okkalapa Pagoda, South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('SLN', 'SLN', 'Slinnar''s Beauty Club North Dagon', '09-954033833', 'On Bayint Naung Main Road, in front of Pinlon City Mall, Pinlon Hill, Second Floor, North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('TZ', 'TZ', 'TZ-5 Fashion Shop', '09-981381635', 'No. (266), Metta Road, Ward (10), South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('KWY', 'KWY', 'kyal Win yan', '09-765144772', 'No. (40)/(Ta-173), Min Ye Kyaw Swar Road, Ward (40), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('PP', 'PP', 'PANN PANN Orchid Garden', '09-791596959', 'No. (383), Sein Pan Road, Ward (40), North Dagon', 'North Dagon', 'Yangon', 'COD', 'Standard', 'Standard', 'active'),
('NKS', 'NKS', 'Neo Kids', '09-5199004', 'No. (698), Baya Thingyan Road, Ward (10), South Okkalapa', 'South Okkalapa', 'Yangon', 'COD', 'Standard', 'Standard', 'active')
on conflict (merchant_code) do update set merchant_name=excluded.merchant_name, contact_phone=excluded.contact_phone, pickup_address=excluded.pickup_address, pickup_township=excluded.pickup_township, pickup_city=excluded.pickup_city, status=excluded.status, updated_at=now();

truncate public.be_masterdata_riders cascade;
insert into public.be_masterdata_riders(rider_id, rider_name, phone_primary, nrc_or_id_no, assigned_zone, employment_type, status) values
('RID001', 'Ko Kyaw Zin Khant', '09-779 052 872', '12/DaGaYa(N)032246', 'Yangon Central', 'Permanent', 'Active'),
('RID002', 'Ko Paing Zay Htet', '09-779 615 147', '14/DaDaYa(N)246279', 'Yangon South', 'Permanent', 'Active'),
('RID003', 'Ko Chit Yin Htoo', '09-662 385 475', '12/DaGaYa(N)052464', 'Yangon North', 'Permanent', 'Active'),
('RID004', 'Ko Wai Lin Phyo', '09-779 634 710', '14/PaThaNa(N)366317', 'Yangon North', 'Permanent', 'Active'),
('RID005', 'Ko Aye Chan Soe', '09-259 725 323', '13/KaTaNa(N)211849', 'Yangon North', 'Permanent', 'Active'),
('RID006', 'Ma Myo Pa Pa Aung', '09-779 617 044', '12/DaGaYa(N)023361', 'Yangon East', 'Permanent', 'Active'),
('RID007', 'Ko Myo Min Kyaw', '09-775 018 446', '12/MaYaKa(N)187754', 'Yangon Central', 'Permanent', 'Active'),
('RID008', 'Ko Than Min Soe', '09-786 015 602', '12/MaBaNa(N)228656', 'Yangon South', 'Contract', 'Active'),
('RID009', 'Ko S Lin Phyo', '09-965 023 790', '12/DaGaYa(N)038819', 'Yangon Central', 'Contract', 'Active')
on conflict (rider_id) do update set rider_name=excluded.rider_name, phone_primary=excluded.phone_primary, assigned_zone=excluded.assigned_zone, status=excluded.status;

truncate public.be_masterdata_drivers cascade;
insert into public.be_masterdata_drivers(driver_id, driver_name, phone_primary, license_no, license_expiry_date, assigned_fleet_id, status) values
('DRV001', 'Ko Wai Phyo Lwin', '09-260 741 691', 'D/00138/12', '07.05.2027', 'Hlaing Thar Yar , Insein', 'Active'),
('DRV002', 'Ko Tun Min Aung', '09-942 540 630', 'E/01923/25', '23.06.2028', 'Thaketa,Mingalartaung Nyunt,Tamwe', 'Active'),
('DRV003', 'Aung Zaw Moe', '09-750 099 581', 'B/06711/23', '16.02.2028', 'Downtown', 'Active'),
('DRV004', 'Ko Wai Yan Phyo', '09-757 052 761', 'B/08656/19', '05.12.2029', 'Shwe Pyi Thar , Mingalardon , North Okkalapa', 'Active'),
('DRV005', 'Ko Kyaw Myo Aung', '09-770 696 670', 'B/05214/18', '25.5.2028', 'Mayangone, Hlaing , Kamayut', 'Active'),
('DRV006', 'Win Naing Tun', '09-679 874 786', 'B/19817/22', '22.4.2027', 'Dagon Seinkkan, South Dagon', 'Active')
on conflict (driver_id) do update set driver_name=excluded.driver_name, phone_primary=excluded.phone_primary, assigned_fleet_id=excluded.assigned_fleet_id, status=excluded.status;

truncate public.be_masterdata_fleet cascade;
insert into public.be_masterdata_fleet(fleet_id, vehicle_no, vehicle_type, capacity_kg, capacity_cbm, assigned_driver_id, ownership_type, insurance_expiry_date, status, zone_note) values
('FLT001', '6H - 7397', 'Van', 700.0, 5.0, 'Ko Tun Min Aung', 'Owned', '2027.01.31', 'Assigned', 'Aungmingalar highway bus stop — nearby cargo pickup'),
('FLT002', '4S - 1626', 'Mini Truck', 850.0, 4.0, 'Ko Wai Phyo Lwin', 'Owned', '2027.01.31', 'Assigned', 'Zone 1'),
('FLT003', '2Q - 6524', 'Mini Truck', 850.0, 4.0, 'Ko Win Naing Tun', 'Owned', '2027.01.31', 'Assigned', 'Zone 2'),
('FLT004', '7R - 1473', 'Mini Truck', 780.0, 1.0, 'Ko Aung Zaw Moe', 'Owned', '2027.01.31', 'Assigned', 'Zone 3'),
('FLT005', '9R - 4431', 'Van', 300.0, 3.0, 'Ko Kyaw Myo Aung', 'Owned', '2026.07.06', 'Assigned', 'Zone 4'),
('FLT006', '7K - 1890', 'Box Truck', 1000.0, 10.0, 'Ko Wai Yan Phyo', null, '2027.01.31', 'Assigned', 'Dagonthiri highway bus stop — nearby cargo pickup')
on conflict (fleet_id) do update set vehicle_no=excluded.vehicle_no, vehicle_type=excluded.vehicle_type, assigned_driver_id=excluded.assigned_driver_id, status=excluded.status, zone_note=excluded.zone_note;

-- Keep workforce dropdowns template-only: remove generated rider/driver records without auth mappings.
delete from public.be_mobile_workforce_accounts;
insert into public.be_mobile_workforce_accounts(worker_id, full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status) select rider_id, rider_name, 'rider', phone_primary, 'YGN', null, null, lower(status) from public.be_masterdata_riders where lower(status)='active' on conflict(worker_id) do update set full_name=excluded.full_name, phone_number=excluded.phone_number, status=excluded.status;
insert into public.be_mobile_workforce_accounts(worker_id, full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status) select d.driver_id, d.driver_name, 'driver', d.phone_primary, 'YGN', f.vehicle_type, f.vehicle_no, lower(d.status) from public.be_masterdata_drivers d left join public.be_masterdata_fleet f on f.assigned_driver_id = d.driver_name or f.assigned_driver_id = d.driver_id where lower(d.status)='active' on conflict(worker_id) do update set full_name=excluded.full_name, phone_number=excluded.phone_number, vehicle_type=excluded.vehicle_type, license_plate=excluded.license_plate, status=excluded.status;

-- Add riders/drivers as workforce users without auth_user_id; real login users can later be mapped by setting auth_user_id.
insert into public.be_user_account_registry(user_id, full_name, role, phone_number, branch_code, vehicle_type, license_plate, status)
select gen_random_uuid(), full_name, role_type, phone_number, branch_code, vehicle_type, license_plate, status
from public.be_mobile_workforce_accounts w
where not exists (
  select 1 from public.be_user_account_registry u
  where u.full_name = w.full_name and u.role = w.role_type
);

notify pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 70-dashboard-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express: 70-dashboard-go-live.sql
-- Run in Supabase SQL Editor
-- Depends on: be_user_account_registry, be_portal_pickup_requests,
--             be_portal_cargo_events, be_mobile_workforce_accounts
-- ============================================================

-- ── Helper: resolve current user role ───────────────────────
CREATE OR REPLACE FUNCTION public.be_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT role FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1),
    'guest'
  );
$$;

-- ── Dashboard KPI snapshot ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_kpi_today()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
  v_today DATE := CURRENT_DATE;
  v_res JSON;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance','cs','dispatch','warehouse') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT branch_code INTO v_branch
  FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  SELECT json_build_object(
    'total_pickups_today',     (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE created_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'pending_pickups',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('SUBMITTED','PENDING_ASSIGNMENT') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'active_shipments',        (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'delivered_today',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'DELIVERED' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'failed_today',            (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'FAILED_ATTEMPT' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'returned_today',          (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'RETURNED' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'pending_cod',             (SELECT COALESCE(SUM(cod_amount),0) FROM public.be_portal_pickup_requests WHERE status = 'DELIVERED' AND payment_method = 'COD' AND cod_settled = false AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'active_riders',           (SELECT COUNT(*) FROM public.be_mobile_workforce_accounts WHERE role_type = 'rider' AND status = 'active'),
    'exceptions_open',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('EXCEPTION','ON_HOLD') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'as_of',                   NOW()
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- ── 7-day delivery trend ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_trend_7d()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance','cs','dispatch','warehouse') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT branch_code INTO v_branch FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.day)
    FROM (
      SELECT
        TO_CHAR(d.day,'Mon DD') AS day,
        COALESCE(SUM(CASE WHEN p.status='DELIVERED' THEN 1 ELSE 0 END),0)::int AS delivered,
        COALESCE(SUM(CASE WHEN p.status='FAILED_ATTEMPT' THEN 1 ELSE 0 END),0)::int AS failed,
        COALESCE(SUM(CASE WHEN p.status IN ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY') THEN 1 ELSE 0 END),0)::int AS active
      FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval) d(day)
      LEFT JOIN public.be_portal_pickup_requests p
        ON p.created_at::date = d.day::date
        AND (v_branch IS NULL OR p.branch_code = v_branch OR v_role IN ('admin','operation_manager'))
      GROUP BY d.day
    ) t
  );
END;
$$;

-- ── Module throughput (pickup counts by module/source) ───────
CREATE OR REPLACE FUNCTION public.be_dashboard_module_throughput()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT requester_type AS source,
             COUNT(*)::int AS total,
             SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END)::int AS delivered,
             SUM(CASE WHEN status='FAILED_ATTEMPT' THEN 1 ELSE 0 END)::int AS failed
      FROM public.be_portal_pickup_requests
      WHERE created_at >= CURRENT_DATE - 29
      GROUP BY requester_type
      ORDER BY total DESC
    ) t
  );
END;
$$;

-- ── Recent activity feed ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_activity_feed(p_limit INT DEFAULT 20)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT branch_code INTO v_branch FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        e.id, e.event_type, e.pickup_id, e.description,
        e.actor_role, e.created_at,
        p.merchant_name, p.status AS current_status
      FROM public.be_portal_cargo_events e
      LEFT JOIN public.be_portal_pickup_requests p ON p.pickup_id = e.pickup_id
      WHERE (v_branch IS NULL OR p.branch_code = v_branch OR v_role IN ('admin','operation_manager'))
      ORDER BY e.created_at DESC
      LIMIT p_limit
    ) t
  );
END;
$$;

-- ── SLA summary (delivery within 24h / 48h) ─────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_sla_summary()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (
    SELECT json_build_object(
      'total_delivered_7d', COUNT(*),
      'within_24h',  SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 24 THEN 1 ELSE 0 END)::int,
      'within_48h',  SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 48 THEN 1 ELSE 0 END)::int,
      'over_48h',    SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 >  48 THEN 1 ELSE 0 END)::int
    )
    FROM public.be_portal_pickup_requests
    WHERE status = 'DELIVERED' AND updated_at >= CURRENT_DATE - 6
  );
END;
$$;

-- ── Permissions ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.be_dashboard_kpi_today TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_trend_7d TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_module_throughput TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_activity_feed TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_sla_summary TO authenticated;

-- ── Verification ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'ok', true,
    'rpc_count', (SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_dashboard_%'),
    'ts', NOW()
  );
$$;
GRANT EXECUTE ON FUNCTION public.be_dashboard_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 71-create-delivery-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express: 71-create-delivery-go-live.sql
-- ============================================================

-- ── Tariff calculator ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_tier TEXT, p_weight NUMERIC, p_highway BOOLEAN DEFAULT FALSE
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_allowance INT; v_base_fee INT; v_extra_kg INT; v_surcharge INT; v_highway_fee INT;
BEGIN
  CASE p_tier
    WHEN 'Standard'   THEN v_allowance := 3; v_base_fee := 4000;
    WHEN 'Royal'      THEN v_allowance := 5; v_base_fee := 4000;
    WHEN 'Commitment' THEN v_allowance := 5; v_base_fee := 3500;
    ELSE RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END CASE;
  v_extra_kg   := GREATEST(0, CEIL(p_weight)::INT - v_allowance);
  v_surcharge  := v_extra_kg * 500;
  v_highway_fee := CASE WHEN p_highway THEN 3000 ELSE 0 END;
  RETURN json_build_object(
    'tier', p_tier, 'weight', p_weight, 'ceiling_weight', CEIL(p_weight),
    'allowance', v_allowance, 'extra_kg', v_extra_kg,
    'base_fee', v_base_fee, 'surcharge', v_surcharge, 'highway_fee', v_highway_fee,
    'total', v_base_fee + v_surcharge + v_highway_fee
  );
END;
$$;

-- ── Merchant dropdown ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_get_merchants_dropdown()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_agg(row_to_json(t)) FROM (
    SELECT merchant_id, merchant_code, merchant_name, contact_phone,
           pickup_address, pickup_township, pickup_city,
           payment_profile, service_profile, tariff_tier
    FROM public.be_masterdata_merchants WHERE status='active' ORDER BY merchant_name
  ) t);
END;
$$;

-- ── Create delivery ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_create_delivery(p_payload JSON)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_user_id UUID := auth.uid();
  v_pickup_id TEXT; v_deliver_id TEXT; v_invoice_no TEXT; v_waybill_no TEXT;
  v_date TEXT := TO_CHAR(NOW(),'MMDD');
  v_code TEXT; v_count INT; v_new_id UUID;
  v_tariff JSON;
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry') THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- Validate required fields
  IF p_payload->>'merchant_code' IS NULL OR p_payload->>'recipient_phone' IS NULL THEN
    RAISE EXCEPTION 'merchant_code and recipient_phone are required';
  END IF;
  -- Phone format check
  IF NOT ((p_payload->>'recipient_phone') ~ '^(09|\\+959)[0-9]{7,9}$') THEN
    RAISE EXCEPTION 'Invalid phone format: %', p_payload->>'recipient_phone';
  END IF;
  -- Generate IDs
  v_code := UPPER(SUBSTRING(p_payload->>'merchant_code',1,3));
  SELECT COALESCE(MAX((split_part(pickup_id,'-',3))::INT),0)+1 INTO v_count
  FROM public.be_portal_pickup_requests
  WHERE pickup_id LIKE 'P'||v_date||'-'||v_code||'-%';
  v_pickup_id  := 'P'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  v_deliver_id := 'D'||v_date||'-'||v_code||'-'||LPAD((v_count+1)::TEXT,3,'0');
  v_invoice_no := 'I'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  v_waybill_no := 'W'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  -- Branch resolution
  v_branch := CASE
    WHEN lower(p_payload->>'pickup_city') LIKE '%mandalay%' OR lower(p_payload->>'pickup_city') LIKE '%mdy%' THEN 'MDY'
    WHEN lower(p_payload->>'pickup_city') LIKE '%naypyi%' OR lower(p_payload->>'pickup_city') LIKE '%npt%' THEN 'NPT'
    ELSE 'YGN'
  END;
  -- Tariff calculation
  v_tariff := public.be_calculate_tariff(
    COALESCE(p_payload->>'service_tier','Standard'),
    COALESCE((p_payload->>'weight_kg')::NUMERIC, 0),
    COALESCE((p_payload->>'highway_dropoff')::BOOLEAN, FALSE)
  );
  -- Insert record
  INSERT INTO public.be_portal_pickup_requests (
    pickup_id, deliver_id, invoice_no, waybill_no,
    merchant_id, merchant_code, merchant_name,
    sender_phone, pickup_address, pickup_township, pickup_city,
    recipient_name, recipient_phone, delivery_township, delivery_address,
    service_tier, priority, payment_method, cod_amount,
    weight_kg, delivery_fee, status, branch_code,
    requester_type, created_by, created_at, updated_at
  ) VALUES (
    v_pickup_id, v_deliver_id, v_invoice_no, v_waybill_no,
    p_payload->>'merchant_id', p_payload->>'merchant_code', p_payload->>'merchant_name',
    p_payload->>'sender_phone', p_payload->>'pickup_address', p_payload->>'pickup_township', p_payload->>'pickup_city',
    p_payload->>'recipient_name', p_payload->>'recipient_phone', p_payload->>'delivery_township', p_payload->>'delivery_address',
    COALESCE(p_payload->>'service_tier','Standard'),
    COALESCE(p_payload->>'priority','NORMAL'),
    COALESCE(p_payload->>'payment_method','COD'),
    COALESCE((p_payload->>'cod_amount')::NUMERIC, 0),
    COALESCE((p_payload->>'weight_kg')::NUMERIC, 0),
    (v_tariff->>'total')::NUMERIC,
    'SUBMITTED', v_branch, 'PORTAL', v_user_id, NOW(), NOW()
  ) RETURNING id INTO v_new_id;
  -- Create initial cargo event
  INSERT INTO public.be_portal_cargo_events (pickup_id, event_type, description, actor_role, created_at)
  VALUES (v_pickup_id, 'SUBMITTED', 'Shipment created via Portal', v_role, NOW());
  RETURN json_build_object(
    'success', true, 'pickup_id', v_pickup_id, 'deliver_id', v_deliver_id,
    'invoice_no', v_invoice_no, 'waybill_no', v_waybill_no,
    'branch', v_branch, 'tariff', v_tariff, 'id', v_new_id
  );
END;
$$;

-- ── Permissions ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_get_merchants_dropdown TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_create_delivery TO authenticated;

-- ── Verification ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_create_delivery_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_calculate_tariff','be_get_merchants_dropdown','be_create_delivery')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_create_delivery_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 72-way-management-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express: 72-way-management-go-live.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.be_way_management_list(
  p_status TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT CASE WHEN v_role IN ('admin','operation_manager') THEN NULL ELSE branch_code END INTO v_branch
  FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN (SELECT json_build_object(
    'rows', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
      SELECT pickup_id, deliver_id, waybill_no, merchant_name, recipient_name, recipient_phone,
             delivery_address, delivery_township, status, payment_method, cod_amount,
             delivery_fee, branch_code, requester_type, created_at, updated_at
      FROM public.be_portal_pickup_requests
      WHERE status != 'DRAFT'
        AND (p_status IS NULL OR status = p_status)
        AND (v_branch IS NULL OR branch_code = v_branch OR p_branch IS NULL)
        AND (p_search IS NULL OR pickup_id ILIKE '%'||p_search||'%' OR recipient_name ILIKE '%'||p_search||'%' OR waybill_no ILIKE '%'||p_search||'%' OR merchant_name ILIKE '%'||p_search||'%')
      ORDER BY updated_at DESC LIMIT p_limit OFFSET p_offset
    ) t), '[]'::json),
    'total', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status != 'DRAFT' AND (p_status IS NULL OR status=p_status) AND (v_branch IS NULL OR branch_code=v_branch))
  ));
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_management_detail(p_pickup_id TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'shipment', row_to_json(p),
    'events', (SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at),'[]'::json) FROM public.be_portal_cargo_events e WHERE e.pickup_id = p_pickup_id)
  ) FROM public.be_portal_pickup_requests p WHERE p.pickup_id = p_pickup_id LIMIT 1);
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_update_status(p_pickup_id TEXT, p_status TEXT, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_old TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT status INTO v_old FROM public.be_portal_pickup_requests WHERE pickup_id = p_pickup_id;
  UPDATE public.be_portal_pickup_requests SET status=p_status, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'STATUS_UPDATE','Status changed from '||v_old||' to '||p_status||'. Reason: '||p_reason, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'old_status',v_old,'new_status',p_status);
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_initiate_return(p_pickup_id TEXT, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET status='RETURN_INITIATED', updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'RETURN_INITIATED','Return to origin initiated. Reason: '||p_reason, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.be_way_management_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_management_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_update_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_initiate_return TO authenticated;

CREATE OR REPLACE FUNCTION public.be_way_management_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_way_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_way_management_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 73-data-entry-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 04: Data Entry / Bulk Upload RPCs

-- Validate a single shipment row (called per CSV row preview)
CREATE OR REPLACE FUNCTION public.be_validate_bulk_row(p_row JSON)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_errors TEXT[] := '{}'; v_merchant_ok BOOLEAN;
BEGIN
  IF p_row->>'recipient_phone' IS NULL OR NOT ((p_row->>'recipient_phone') ~ '^(09|\+959)[0-9]{7,9}$') THEN v_errors := array_append(v_errors,'Invalid phone: '||(p_row->>'recipient_phone')); END IF;
  IF p_row->>'recipient_name' IS NULL OR length(trim(p_row->>'recipient_name'))<2 THEN v_errors := array_append(v_errors,'Recipient name too short'); END IF;
  IF p_row->>'delivery_address' IS NULL OR length(trim(p_row->>'delivery_address'))<5 THEN v_errors := array_append(v_errors,'Delivery address too short'); END IF;
  IF p_row->>'merchant_code' IS NULL THEN v_errors := array_append(v_errors,'merchant_code is required'); END IF;
  IF p_row->>'weight_kg' IS NOT NULL THEN IF (p_row->>'weight_kg')::NUMERIC <= 0 THEN v_errors := array_append(v_errors,'weight_kg must be positive'); END IF; END IF;
  SELECT EXISTS(SELECT 1 FROM public.be_masterdata_merchants WHERE merchant_code=p_row->>'merchant_code' AND status='active') INTO v_merchant_ok;
  IF NOT v_merchant_ok THEN v_errors := array_append(v_errors,'Unknown or inactive merchant: '||(p_row->>'merchant_code')); END IF;
  RETURN json_build_object('valid', array_length(v_errors,1) IS NULL, 'errors', to_json(v_errors));
END;
$$;

-- Get bulk upload history for current user
CREATE OR REPLACE FUNCTION public.be_bulk_upload_history(p_limit INT DEFAULT 20)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_uid UUID := auth.uid();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','data_entry','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.uploaded_at DESC),'[]'::json) FROM (
    SELECT batch_id, original_filename, total_rows, valid_rows, invalid_rows,
           status, error_summary, uploaded_by, uploaded_at
    FROM public.be_bulk_upload_batches
    WHERE uploaded_by = v_uid
    ORDER BY uploaded_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Submit validated bulk batch
CREATE OR REPLACE FUNCTION public.be_bulk_submit_batch(p_rows JSON, p_filename TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_uid UUID := auth.uid();
  v_batch_id TEXT := 'BATCH'||TO_CHAR(NOW(),'MMDD')||'-'||SUBSTR(MD5(RANDOM()::TEXT),1,6);
  v_total INT; v_valid INT := 0; v_invalid INT := 0;
  v_row JSON; v_validation JSON; v_date TEXT; v_code TEXT; v_seq INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','data_entry','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_total := json_array_length(p_rows);
  v_date  := TO_CHAR(NOW(),'MMDD');
  -- Insert batch record
  INSERT INTO public.be_bulk_upload_batches(batch_id,original_filename,total_rows,valid_rows,invalid_rows,status,uploaded_by,uploaded_at)
  VALUES(v_batch_id,p_filename,v_total,0,0,'PROCESSING',v_uid,NOW());
  -- Process each row
  FOR i IN 0..v_total-1 LOOP
    v_row := p_rows->i;
    v_validation := public.be_validate_bulk_row(v_row);
    IF (v_validation->>'valid')::BOOLEAN THEN
      v_code := UPPER(SUBSTRING(v_row->>'merchant_code',1,3));
      SELECT COALESCE(MAX((split_part(pickup_id,'-',3))::INT),0)+1 INTO v_seq
      FROM public.be_portal_pickup_requests WHERE pickup_id LIKE 'P'||v_date||'-'||v_code||'-%';
      INSERT INTO public.be_portal_pickup_requests(
        pickup_id,deliver_id,invoice_no,waybill_no,
        merchant_code,merchant_name,
        recipient_name,recipient_phone,delivery_township,delivery_address,
        service_tier,priority,payment_method,cod_amount,weight_kg,
        status,batch_id,created_by,created_at,updated_at
      )
      SELECT 'P'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             'D'||v_date||'-'||v_code||'-'||LPAD((v_seq+1)::TEXT,3,'0'),
             'I'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             'W'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             v_row->>'merchant_code', m.merchant_name,
             v_row->>'recipient_name', v_row->>'recipient_phone',
             COALESCE(v_row->>'delivery_township',''), COALESCE(v_row->>'delivery_address',''),
             COALESCE(v_row->>'service_tier','Standard'),
             COALESCE(v_row->>'priority','NORMAL'),
             COALESCE(v_row->>'payment_method','COD'),
             COALESCE((v_row->>'cod_amount')::NUMERIC,0),
             COALESCE((v_row->>'weight_kg')::NUMERIC,0),
             'SUBMITTED',v_batch_id,v_uid,NOW(),NOW()
      FROM public.be_masterdata_merchants m WHERE m.merchant_code=v_row->>'merchant_code' LIMIT 1;
      v_valid := v_valid + 1;
    ELSE
      v_invalid := v_invalid + 1;
    END IF;
  END LOOP;
  UPDATE public.be_bulk_upload_batches SET valid_rows=v_valid,invalid_rows=v_invalid,status=CASE WHEN v_invalid=0 THEN 'COMPLETED' ELSE 'COMPLETED_WITH_ERRORS' END, uploaded_at=NOW() WHERE batch_id=v_batch_id;
  RETURN json_build_object('success',true,'batch_id',v_batch_id,'total',v_total,'valid',v_valid,'invalid',v_invalid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_validate_bulk_row TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_bulk_upload_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_bulk_submit_batch TO authenticated;

CREATE OR REPLACE FUNCTION public.be_data_entry_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_validate_bulk_row','be_bulk_upload_history','be_bulk_submit_batch')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_data_entry_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 74-warehouse-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 05: Warehouse Operations RPCs

-- Scan intake (mark as received in warehouse)
CREATE OR REPLACE FUNCTION public.be_warehouse_intake_scan(p_pickup_id TEXT, p_location TEXT DEFAULT 'INTAKE')
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_status TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT status INTO v_status FROM public.be_portal_pickup_requests WHERE pickup_id=p_pickup_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Shipment not found: %', p_pickup_id; END IF;
  IF v_status NOT IN ('SUBMITTED','PICKED_UP') THEN RAISE EXCEPTION 'Cannot intake shipment in status: %', v_status; END IF;
  UPDATE public.be_portal_pickup_requests SET status='IN_WAREHOUSE', warehouse_location=p_location, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'INTAKE_SCAN','Received at warehouse — location: '||p_location, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'location',p_location,'prev_status',v_status);
END;
$$;

-- Sort scan (assign to sort zone / route)
CREATE OR REPLACE FUNCTION public.be_warehouse_sort_scan(p_pickup_id TEXT, p_sort_zone TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET warehouse_location=p_sort_zone, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'SORT_SCAN','Sorted to zone: '||p_sort_zone, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'sort_zone',p_sort_zone);
END;
$$;

-- Dispatch confirmation (mark as dispatched from warehouse)
CREATE OR REPLACE FUNCTION public.be_warehouse_dispatch(p_pickup_ids TEXT[], p_rider_id TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT:=0;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET status='IN_TRANSIT', assigned_rider_id=p_rider_id, updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids) AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  SELECT pid,'DISPATCHED','Dispatched from warehouse to rider: '||p_rider_id, v_role, NOW()
  FROM UNNEST(p_pickup_ids) AS pid;
  RETURN json_build_object('success',true,'dispatched',v_count,'rider_id',p_rider_id);
END;
$$;

-- Warehouse summary
CREATE OR REPLACE FUNCTION public.be_warehouse_summary()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'in_warehouse', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE'),
    'pending_sort', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND (warehouse_location IS NULL OR warehouse_location='INTAKE')),
    'pending_dispatch', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND warehouse_location IS NOT NULL AND warehouse_location!='INTAKE'),
    'zones', (SELECT COALESCE(json_agg(row_to_json(z)),'[]'::json) FROM (
      SELECT warehouse_location AS zone, COUNT(*) AS count
      FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND warehouse_location IS NOT NULL
      GROUP BY warehouse_location ORDER BY count DESC
    ) z)
  ));
END;
$$;

-- List warehouse items with optional zone/status filter
CREATE OR REPLACE FUNCTION public.be_warehouse_list(p_zone TEXT DEFAULT NULL, p_limit INT DEFAULT 50)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, merchant_name, recipient_name, recipient_phone,
           delivery_township, delivery_address, warehouse_location,
           weight_kg, service_tier, status, updated_at
    FROM public.be_portal_pickup_requests
    WHERE status='IN_WAREHOUSE'
      AND (p_zone IS NULL OR warehouse_location=p_zone)
    ORDER BY updated_at ASC LIMIT p_limit
  ) t);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_warehouse_intake_scan TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_sort_scan TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_dispatch TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_list TO authenticated;

CREATE OR REPLACE FUNCTION public.be_warehouse_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_warehouse_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_warehouse_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 75-waybill-invoice-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 06: Waybill & Invoice RPCs

-- Label queue (waybills ready for printing)
CREATE OR REPLACE FUNCTION public.be_label_queue(
  p_status TEXT DEFAULT NULL, p_merchant_code TEXT DEFAULT NULL, p_limit INT DEFAULT 50
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry','finance','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, deliver_id, waybill_no, invoice_no,
           merchant_name, merchant_code,
           recipient_name, recipient_phone, delivery_address, delivery_township,
           service_tier, weight_kg, delivery_fee,
           payment_method, cod_amount, status, waybill_printed_at, created_at
    FROM public.be_portal_pickup_requests
    WHERE (p_status IS NULL OR status=p_status)
      AND (p_merchant_code IS NULL OR merchant_code=p_merchant_code)
    ORDER BY created_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Mark waybill as printed
CREATE OR REPLACE FUNCTION public.be_mark_waybill_printed(p_pickup_ids TEXT[])
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET waybill_printed_at=NOW(), updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('success',true,'updated',v_count,'ts',NOW());
END;
$$;

-- Invoice list for finance review
CREATE OR REPLACE FUNCTION public.be_invoice_list(
  p_status TEXT DEFAULT NULL, p_merchant_code TEXT DEFAULT NULL, p_limit INT DEFAULT 50
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','auditor','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT p.pickup_id, p.invoice_no, p.merchant_name, p.merchant_code,
           p.recipient_name, p.delivery_fee, p.cod_amount, p.payment_method,
           p.status, p.invoice_approved, p.invoice_approved_at, p.created_at,
           p.service_tier, p.weight_kg
    FROM public.be_portal_pickup_requests p
    WHERE (p_status IS NULL OR p.status=p_status)
      AND (p_merchant_code IS NULL OR p.merchant_code=p_merchant_code)
    ORDER BY p.created_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Approve / reject invoice
CREATE OR REPLACE FUNCTION public.be_invoice_approve(p_pickup_id TEXT, p_approved BOOLEAN, p_notes TEXT DEFAULT '')
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET invoice_approved=p_approved,
      invoice_approved_at=CASE WHEN p_approved THEN NOW() ELSE NULL END,
      invoice_notes=p_notes,
      updated_at=NOW()
  WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,CASE WHEN p_approved THEN 'INVOICE_APPROVED' ELSE 'INVOICE_REJECTED' END, COALESCE(p_notes,''), v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'approved',p_approved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_label_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_mark_waybill_printed TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_invoice_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_invoice_approve TO authenticated;

CREATE OR REPLACE FUNCTION public.be_waybill_invoice_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_label_queue','be_mark_waybill_printed','be_invoice_list','be_invoice_approve')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_waybill_invoice_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 76-reporting-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 07: Reporting RPCs

-- Operational report (period summary)
CREATE OR REPLACE FUNCTION public.be_report_operational(p_from DATE, p_to DATE, p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','auditor','finance') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'period', json_build_object('from',p_from,'to',p_to),
    'branch', COALESCE(p_branch,'ALL'),
    'totals', (SELECT row_to_json(t) FROM (
      SELECT COUNT(*) AS total_shipments,
             COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
             COUNT(*) FILTER (WHERE status IN ('FAILED_DELIVERY','RETURN_INITIATED','RETURNED')) AS failed,
             COUNT(*) FILTER (WHERE status='HOLD') AS on_hold,
             ROUND(COUNT(*) FILTER (WHERE status='DELIVERED')::NUMERIC / NULLIF(COUNT(*),0)*100,1) AS delivery_rate_pct,
             COALESCE(SUM(delivery_fee),0) AS total_delivery_fee,
             COALESCE(SUM(cod_amount) FILTER (WHERE payment_method='COD'),0) AS total_cod_collected,
             COALESCE(AVG(weight_kg),0) AS avg_weight_kg
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to
        AND (p_branch IS NULL OR branch_code=p_branch)
    ) t),
    'by_status', (SELECT COALESCE(json_agg(row_to_json(s)),'[]'::json) FROM (
      SELECT status, COUNT(*) AS count,
             ROUND(COUNT(*)::NUMERIC/NULLIF((SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE created_at::DATE BETWEEN p_from AND p_to),0)*100,1) AS pct
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY status ORDER BY count DESC
    ) s),
    'by_day', (SELECT COALESCE(json_agg(row_to_json(d)),'[]'::json) FROM (
      SELECT created_at::DATE AS date,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
             COALESCE(SUM(delivery_fee),0) AS revenue
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY created_at::DATE ORDER BY date
    ) d),
    'by_tier', (SELECT COALESCE(json_agg(row_to_json(ti)),'[]'::json) FROM (
      SELECT service_tier, COUNT(*) AS count, COALESCE(SUM(delivery_fee),0) AS revenue
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY service_tier ORDER BY count DESC
    ) ti)
  ));
END;
$$;

-- Finance report (COD vs Prepaid breakdown)
CREATE OR REPLACE FUNCTION public.be_report_finance(p_from DATE, p_to DATE)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','auditor','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'period', json_build_object('from',p_from,'to',p_to),
    'by_payment', (SELECT COALESCE(json_agg(row_to_json(p)),'[]'::json) FROM (
      SELECT payment_method, COUNT(*) AS count,
             COALESCE(SUM(delivery_fee),0) AS total_fee,
             COALESCE(SUM(cod_amount),0) AS total_cod
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to GROUP BY payment_method
    ) p),
    'by_merchant', (SELECT COALESCE(json_agg(row_to_json(m)),'[]'::json) FROM (
      SELECT merchant_code, merchant_name, COUNT(*) AS shipments,
             COALESCE(SUM(delivery_fee),0) AS total_fee,
             COALESCE(SUM(cod_amount) FILTER (WHERE payment_method='COD'),0) AS cod_amount
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to GROUP BY merchant_code, merchant_name ORDER BY total_fee DESC LIMIT 20
    ) m)
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_report_operational TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_report_finance TO authenticated;

CREATE OR REPLACE FUNCTION public.be_reporting_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_report_operational','be_report_finance')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_reporting_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 77-dispatch-center-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 08: Dispatch Center RPCs

-- Workforce roster (riders/drivers available today)
CREATE OR REPLACE FUNCTION public.be_dispatch_workforce(p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT u.user_id, u.full_name, u.role, u.phone_number, u.branch_code,
           u.vehicle_type, u.license_plate,
           COUNT(p.pickup_id) FILTER (WHERE p.status='IN_TRANSIT') AS active_assignments,
           COUNT(p.pickup_id) FILTER (WHERE p.status='DELIVERED' AND p.created_at::DATE=CURRENT_DATE) AS delivered_today,
           u.status AS availability_status
    FROM public.be_user_account_registry u
    LEFT JOIN public.be_portal_pickup_requests p ON p.assigned_rider_id::TEXT = u.user_id::TEXT
    WHERE u.role IN ('rider','driver') AND u.status='active'
      AND (p_branch IS NULL OR u.branch_code=p_branch)
    GROUP BY u.user_id, u.full_name, u.role, u.phone_number, u.branch_code, u.vehicle_type, u.license_plate, u.status
    ORDER BY active_assignments ASC, u.full_name
  ) t);
END;
$$;

-- Get unassigned shipments ready for dispatch
CREATE OR REPLACE FUNCTION public.be_dispatch_unassigned(p_branch TEXT DEFAULT NULL, p_limit INT DEFAULT 100)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, waybill_no, merchant_name,
           recipient_name, recipient_phone, delivery_address, delivery_township,
           service_tier, priority, payment_method, cod_amount, delivery_fee, branch_code, created_at
    FROM public.be_portal_pickup_requests
    WHERE assigned_rider_id IS NULL
      AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP')
      AND (p_branch IS NULL OR branch_code=p_branch)
    ORDER BY CASE priority WHEN 'SAME_DAY' THEN 1 WHEN 'EXPRESS' THEN 2 ELSE 3 END, created_at ASC
    LIMIT p_limit
  ) t);
END;
$$;

-- Bulk assign shipments to rider/driver
CREATE OR REPLACE FUNCTION public.be_dispatch_assign(
  p_pickup_ids TEXT[], p_assignee_id UUID, p_assignee_name TEXT, p_route_label TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET assigned_rider_id=p_assignee_id, status='IN_TRANSIT', route_label=p_route_label, updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  SELECT pid,'ASSIGNED','Assigned to '||p_assignee_name||(CASE WHEN p_route_label IS NOT NULL THEN ' — route: '||p_route_label ELSE '' END), v_role, NOW()
  FROM UNNEST(p_pickup_ids) AS pid;
  RETURN json_build_object('success',true,'assigned',v_count,'assignee',p_assignee_name,'route',p_route_label);
END;
$$;

-- Dispatch summary counters
CREATE OR REPLACE FUNCTION public.be_dispatch_summary(p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'unassigned', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE assigned_rider_id IS NULL AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP') AND (p_branch IS NULL OR branch_code=p_branch)),
    'in_transit', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_TRANSIT' AND (p_branch IS NULL OR branch_code=p_branch)),
    'delivered_today', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='DELIVERED' AND created_at::DATE=CURRENT_DATE AND (p_branch IS NULL OR branch_code=p_branch)),
    'failed_today', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='FAILED_DELIVERY' AND updated_at::DATE=CURRENT_DATE AND (p_branch IS NULL OR branch_code=p_branch)),
    'active_riders', (SELECT COUNT(*) FROM public.be_user_account_registry WHERE role IN ('rider','driver') AND status='active' AND (p_branch IS NULL OR branch_code=p_branch))
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_dispatch_workforce TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_unassigned TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_assign TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_summary TO authenticated;

CREATE OR REPLACE FUNCTION public.be_dispatch_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_dispatch_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_dispatch_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 78-branch-office-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 09: Branch Office RPCs

-- Branch snapshot (YGN / MDY / NPT)
CREATE OR REPLACE FUNCTION public.be_branch_snapshot(p_branch TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_allowed_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','branch_office','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- Branch office role can only see own branch
  IF v_role = 'branch_office' THEN
    SELECT branch_code INTO v_allowed_branch FROM public.be_user_account_registry WHERE auth_user_id=auth.uid() LIMIT 1;
    IF v_allowed_branch != p_branch THEN RAISE EXCEPTION 'Access denied to branch %', p_branch; END IF;
  END IF;
  RETURN (SELECT json_build_object(
    'branch', p_branch,
    'today', json_build_object(
      'new_shipments', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND created_at::DATE=CURRENT_DATE),
      'delivered', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND updated_at::DATE=CURRENT_DATE),
      'failed', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='FAILED_DELIVERY' AND updated_at::DATE=CURRENT_DATE),
      'in_transit', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='IN_TRANSIT'),
      'revenue', (SELECT COALESCE(SUM(delivery_fee),0) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND updated_at::DATE=CURRENT_DATE)
    ),
    'this_month', json_build_object(
      'new_shipments', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())),
      'delivered', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND DATE_TRUNC('month',updated_at)=DATE_TRUNC('month',NOW())),
      'revenue', (SELECT COALESCE(SUM(delivery_fee),0) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND DATE_TRUNC('month',updated_at)=DATE_TRUNC('month',NOW()))
    ),
    'staff', (SELECT COALESCE(json_agg(row_to_json(u)),'[]'::json) FROM (
      SELECT user_id, full_name, role, phone_number, status FROM public.be_user_account_registry WHERE branch_code=p_branch AND status='active' ORDER BY role, full_name
    ) u),
    'recent_shipments', (SELECT COALESCE(json_agg(row_to_json(s)),'[]'::json) FROM (
      SELECT pickup_id, merchant_name, recipient_name, delivery_township, status, created_at
      FROM public.be_portal_pickup_requests WHERE branch_code=p_branch ORDER BY created_at DESC LIMIT 10
    ) s)
  ));
END;
$$;

-- List all branches with summary
CREATE OR REPLACE FUNCTION public.be_branch_list()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(b)),'[]'::json) FROM (
    SELECT branch_code,
           COUNT(*) AS total_shipments,
           COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
           COUNT(*) FILTER (WHERE status='IN_TRANSIT') AS in_transit,
           COUNT(*) FILTER (WHERE created_at::DATE=CURRENT_DATE) AS today
    FROM public.be_portal_pickup_requests
    GROUP BY branch_code ORDER BY branch_code
  ) b);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_branch_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_list TO authenticated;

CREATE OR REPLACE FUNCTION public.be_branch_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_branch_snapshot','be_branch_list')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_branch_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 79-settings-go-live.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Package 10: Settings RPCs

-- Read tariff master config
CREATE OR REPLACE FUNCTION public.be_settings_get_tariff()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT tier_name, free_allowance_kg, base_fee_mmk, extra_per_kg_mmk, highway_fee_mmk, is_active, updated_at
    FROM public.be_tariff_master ORDER BY tier_name
  ) t);
END;
$$;

-- Update tariff tier
CREATE OR REPLACE FUNCTION public.be_settings_update_tariff(p_tier TEXT, p_base_fee INT, p_extra_per_kg INT, p_free_kg INT, p_highway_fee INT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.be_tariff_master
  SET base_fee_mmk=p_base_fee, extra_per_kg_mmk=p_extra_per_kg, free_allowance_kg=p_free_kg, highway_fee_mmk=p_highway_fee, updated_at=NOW()
  WHERE tier_name=p_tier;
  -- Audit log
  INSERT INTO public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  VALUES('UPDATE','be_tariff_master',p_tier,NULL,json_build_object('tier',p_tier,'base_fee',p_base_fee,'extra',p_extra_per_kg,'free_kg',p_free_kg,'highway',p_highway_fee),auth.uid(),NOW());
  RETURN json_build_object('success',true,'tier',p_tier,'updated_at',NOW());
END;
$$;

-- List users with roles
CREATE OR REPLACE FUNCTION public.be_settings_users(p_role TEXT DEFAULT NULL, p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(u)),'[]'::json) FROM (
    SELECT user_id, full_name, role, email, phone_number, branch_code, status, created_at
    FROM public.be_user_account_registry
    WHERE (p_role IS NULL OR role=p_role)
      AND (p_branch IS NULL OR branch_code=p_branch)
    ORDER BY role, full_name
  ) u);
END;
$$;

-- Toggle user active/inactive
CREATE OR REPLACE FUNCTION public.be_settings_toggle_user(p_user_id UUID, p_status TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_status NOT IN ('active','inactive','suspended') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.be_user_account_registry SET status=p_status, updated_at=NOW() WHERE user_id=p_user_id;
  RETURN json_build_object('success',true,'user_id',p_user_id,'status',p_status);
END;
$$;

-- System config key-value reader
CREATE OR REPLACE FUNCTION public.be_settings_get_config()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(c)),'[]'::json) FROM (
    SELECT config_key, config_value, description, updated_at FROM public.be_system_config ORDER BY config_key
  ) c);
END;
$$;

-- System config upsert
CREATE OR REPLACE FUNCTION public.be_settings_set_config(p_key TEXT, p_value TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO public.be_system_config(config_key,config_value,updated_at) VALUES(p_key,p_value,NOW())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value, updated_at=NOW();
  RETURN json_build_object('success',true,'key',p_key,'value',p_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_settings_get_tariff TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_update_tariff TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_toggle_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_get_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_set_config TO authenticated;

CREATE OR REPLACE FUNCTION public.be_settings_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_settings_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_settings_go_live_verification TO authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 90-master-dropdown-snapshot.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 90-master-dropdown-snapshot.sql
-- Unified backend dropdown snapshot for frontend select controls.
-- ============================================================

create or replace function public.be_master_dropdown_snapshot(p_lang text default 'en')
returns json language sql stable security definer as $$
  select json_build_object(
    'counts', json_build_object(
      'merchants', (select count(*) from public.be_masterdata_merchants where status = 'active'),
      'riders', (select count(*) from public.be_masterdata_riders where lower(status) = 'active'),
      'drivers', (select count(*) from public.be_masterdata_drivers where lower(status) = 'active'),
      'fleet', (select count(*) from public.be_masterdata_fleet where lower(status) in ('active','assigned')),
      'users', (select count(*) from public.be_user_account_registry where status = 'active')
    ),
    'merchants', coalesce((select json_agg(row_to_json(t) order by merchant_name) from (
      select merchant_code as value, merchant_code || ' — ' || merchant_name as label,
             merchant_id, merchant_code, merchant_name, contact_phone, pickup_address, pickup_township, pickup_city,
             payment_profile, service_profile, tariff_tier
      from public.be_masterdata_merchants where status = 'active'
    ) t), '[]'::json),
    'riders', coalesce((select json_agg(row_to_json(t) order by rider_id) from (
      select rider_id as value, rider_id || ' — ' || rider_name as label,
             rider_id, rider_name, phone_primary, assigned_zone, employment_type
      from public.be_masterdata_riders where lower(status) = 'active'
    ) t), '[]'::json),
    'drivers', coalesce((select json_agg(row_to_json(t) order by driver_id) from (
      select driver_id as value, driver_id || ' — ' || driver_name as label,
             driver_id, driver_name, phone_primary, license_no, assigned_fleet_id
      from public.be_masterdata_drivers where lower(status) = 'active'
    ) t), '[]'::json),
    'fleet', coalesce((select json_agg(row_to_json(t) order by fleet_id) from (
      select fleet_id as value, fleet_id || ' — ' || vehicle_no || ' — ' || vehicle_type as label,
             fleet_id, vehicle_no, vehicle_type, capacity_kg, capacity_cbm, assigned_driver_id, zone_note
      from public.be_masterdata_fleet where lower(coalesce(status,'')) in ('active','assigned')
    ) t), '[]'::json)
  );
$$;

create or replace function public.be_master_record_lookup(
  p_record_type text,
  p_search text default null,
  p_limit int default 20,
  p_lang text default 'en'
) returns json language plpgsql stable security definer as $$
begin
  if p_record_type = 'merchant' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select merchant_code as value, merchant_code || ' — ' || merchant_name as label, *
      from public.be_masterdata_merchants
      where status = 'active'
        and (p_search is null or merchant_code ilike '%'||p_search||'%' or merchant_name ilike '%'||p_search||'%')
      order by merchant_name limit p_limit
    ) t);
  elsif p_record_type = 'rider' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select rider_id as value, rider_id || ' — ' || rider_name as label, *
      from public.be_masterdata_riders
      where lower(status) = 'active'
        and (p_search is null or rider_id ilike '%'||p_search||'%' or rider_name ilike '%'||p_search||'%')
      order by rider_id limit p_limit
    ) t);
  elsif p_record_type = 'driver' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select driver_id as value, driver_id || ' — ' || driver_name as label, *
      from public.be_masterdata_drivers
      where lower(status) = 'active'
        and (p_search is null or driver_id ilike '%'||p_search||'%' or driver_name ilike '%'||p_search||'%')
      order by driver_id limit p_limit
    ) t);
  elsif p_record_type in ('vehicle','fleet') then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select fleet_id as value, fleet_id || ' — ' || vehicle_no || ' — ' || vehicle_type as label, *
      from public.be_masterdata_fleet
      where lower(coalesce(status,'')) in ('active','assigned')
        and (p_search is null or fleet_id ilike '%'||p_search||'%' or vehicle_no ilike '%'||p_search||'%' or vehicle_type ilike '%'||p_search||'%')
      order by fleet_id limit p_limit
    ) t);
  end if;

  return '[]'::json;
end;
$$;

grant execute on function public.be_master_dropdown_snapshot(text) to authenticated;
grant execute on function public.be_master_record_lookup(text,text,int,text) to authenticated;

notify pgrst, 'reload schema';
