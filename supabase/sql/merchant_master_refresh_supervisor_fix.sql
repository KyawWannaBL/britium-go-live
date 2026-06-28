-- Merchant Master refresh + Customer Service address auto-fill + Supervisor warning fix
-- Generated from uploaded merchantmaster1.csv (53 merchant rows).
-- Run this in Supabase SQL Editor.
-- This deletes existing public.merchant_master rows and inserts the attached CSV merchant master.

create extension if not exists pgcrypto;

-- =========================
-- 1) MERCHANT MASTER TABLE
-- =========================
create table if not exists public.merchant_master (
  id uuid primary key default gen_random_uuid(),
  merchant_code text unique not null,
  merchant_name text not null,
  business_type text,
  payment_terms text default 'COD',
  phone_primary text,
  sender_phone text,
  email text,
  address_line_1 text,
  pickup_address text,
  sender_address text,
  township text,
  city text,
  city_region text,
  region_state text,
  assigned_branch text,
  approval_note text,
  is_active boolean default true,
  created_by text,
  approved_by text,
  created_at timestamptz default now(),
  approved_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.merchant_master
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists business_type text,
  add column if not exists payment_terms text default 'COD',
  add column if not exists phone_primary text,
  add column if not exists sender_phone text,
  add column if not exists email text,
  add column if not exists address_line_1 text,
  add column if not exists pickup_address text,
  add column if not exists sender_address text,
  add column if not exists township text,
  add column if not exists city text,
  add column if not exists city_region text,
  add column if not exists region_state text,
  add column if not exists assigned_branch text,
  add column if not exists approval_note text,
  add column if not exists is_active boolean default true,
  add column if not exists created_by text,
  add column if not exists approved_by text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.merchant_master'::regclass
      and conname = 'merchant_master_merchant_code_key'
  ) then
    alter table public.merchant_master add constraint merchant_master_merchant_code_key unique (merchant_code);
  end if;
exception when others then
  -- If an older duplicate dataset blocks the unique constraint, the DELETE below will clear it.
  null;
end $$;

-- Delete existing merchant master rows as requested.
delete from public.merchant_master;

with src as (
  select *
  from jsonb_to_recordset('[{"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "FALSE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "ALN", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Gon Gon", "payment_terms": "COD", "phone_primary": "09448088835", "address_line_1": "No. (1526), Ward (45), Zawgyi Road, North Dagon"}, {"city": "Yangon", "email": "", "township": "Tamwe", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "APA", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Wai Zin Phyo", "payment_terms": "COD", "phone_primary": "09888867040", "address_line_1": "No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower"}, {"city": "Yangon", "email": "", "township": "Thaketa", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "APS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Ei Zar", "payment_terms": "COD", "phone_primary": "09752660008", "address_line_1": "No. (7), beside Ayeyarwun Main Road, Kwe Ma Housing, 10th Ward"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "BBG", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Lin Lin Htet", "payment_terms": "COD", "phone_primary": "09766482813", "address_line_1": "No. (284/979), Bo Moe Kyo Road, Ward (9), East Dagon"}, {"city": "Yangon", "email": "", "township": "Shwe Pyi Thar", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "BBK", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Hlaing Hlaing Oo", "payment_terms": "COD", "phone_primary": "09796491867", "address_line_1": "No. (115-Ka), Ward (9), Yuzana Road, Shwe Pyi Thar"}, {"city": "Yangon", "email": "", "township": "Kamayut", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "BBR", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ei Htet Htet Min", "payment_terms": "COD", "phone_primary": "09977730920", "address_line_1": "No. (2), Ground Floor, Maha Bawga Road, Hledan"}, {"city": "Yangon", "email": "", "township": "Mingala Taung Nyunt", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "BBT", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Dawn No No Ko", "payment_terms": "COD", "phone_primary": "09699468766", "address_line_1": "No. (23), corner of 130th Street and Thone Myaung Road, Mingalar Taung Nyunt"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "CUY", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Su Wint Htet", "payment_terms": "COD", "phone_primary": "09776527618", "address_line_1": "No. (896), Aung Thiri (2) Street, Ward (28)"}, {"city": "Yangon", "email": "", "township": "Yankin", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "CUY(YK)", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Curvy Yankin", "payment_terms": "COD", "phone_primary": "09-772233150", "address_line_1": "No. (217), Thitsar Road, Ward (13), Yankin"}, {"city": "Yangon", "email": "", "township": "Kamayut", "is_active": "FALSE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "CUY(JS)", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Curvy Junction Square", "payment_terms": "COD", "phone_primary": "09-754614522", "address_line_1": "Junction Square Shopping Mall, First Floor, Pyay Road and Kyun Taw Road, Kamayut"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "DDC", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Zinmar", "payment_terms": "COD", "phone_primary": "0969793443", "address_line_1": "No. (422), Bo Myat Tun Road, corner of Zizawar Road, Ward (47)"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "FALSE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "DSD", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Daw Sanda", "payment_terms": "COD", "phone_primary": "09776110406", "address_line_1": "No. (439), Nay Kyar 1 Street, Ward (50), North Dagon, Yangon"}, {"city": "Yangon", "email": "", "township": "Insein", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "ETE", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Ei Tone", "payment_terms": "COD", "phone_primary": "095409045", "address_line_1": "Building No. (31), Room 6, West Kyo Kone Yeiktha, second street after Kyo Kone Flower Market, unnamed street on the road to Insein RTAD"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "HAM", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Si Kyaw Si Thu", "payment_terms": "COD", "phone_primary": "0424426681", "address_line_1": "No. (665), Bo Saw Aung Road, Ward (9), East Dagon Township, Yangon Region"}, {"city": "Yangon", "email": "", "township": "Thingangyun", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "HMS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ko Tun", "payment_terms": "COD", "phone_primary": "09264365636", "address_line_1": "No. (542), Lay Daunk Kan Ward, Kandaw Road, Thingangyun"}, {"city": "Yangon", "email": "", "township": "North Okkalapa", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "JLS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Thae Thae", "payment_terms": "COD", "phone_primary": "09698793840", "address_line_1": "No. (232), Sakkawat (3) Street, Zay Market, North Okkalapa"}, {"city": "Yangon", "email": "", "township": "Thingangyun", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "KKK", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ko Kyaw Clothing", "payment_terms": "COD", "phone_primary": "09988198263", "address_line_1": "No. (23), Lutlatyay Lane (1), Ward (Ga), Thingangyun"}, {"city": "Yangon", "email": "", "township": "Mingala Taung Nyunt", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "LOS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Zin Mar Nwe", "payment_terms": "COD", "phone_primary": "09981435810", "address_line_1": "No. (63), Pho Mye Road, on Myanmar Gon Yi Road, Mingalar Taung Nyunt"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "MBO", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Myint Zu", "payment_terms": "COD", "phone_primary": "09893341595", "address_line_1": "No. (825/B), Saw Yan Paing Road, Ward (29), North Dagon"}, {"city": "Mandalay", "email": "", "township": "Mandalay", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "MDY", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Khin Nyein Chan", "payment_terms": "COD", "phone_primary": "09765540091", "address_line_1": "House No. (B/4), 65th Street, between 30th and 31st Streets, Mandalay"}, {"city": "Yangon", "email": "", "township": "Shwe Pyi Thar", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "MEL", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Win Pa Pa Htay", "payment_terms": "COD", "phone_primary": "09799737996", "address_line_1": "No. (2212), Maha Bandula Road, Hlawga Lower Gate Bus Stop, Shwe Pyi Thar"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NDN", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Shan Noe", "payment_terms": "COD", "phone_primary": "09890334723", "address_line_1": "No. (1000), Anawrahta Road, Ward (38)"}, {"city": "Yangon", "email": "", "township": "South Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NFS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Nwe", "payment_terms": "COD", "phone_primary": "09777099242", "address_line_1": "No. (57), Sipin Road, Ward 19(A), South Dagon"}, {"city": "Yangon", "email": "", "township": "South Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NFT", "region_state": "Mandalay Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Kyal Sin", "payment_terms": "COD", "phone_primary": "09794908400", "address_line_1": "Block 14(B), Ayar Chan Thar Condo, Dagon Seikkan Township, Ayeyarwun Main Road"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "TRUE", "created_at": "2026-05-08T14:11:23.04783+00:00", "created_by": "", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NHT", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Nan Htike Tan", "payment_terms": "COD", "phone_primary": "09764881098", "address_line_1": "No. (689), Mayu (4) Street, Ward (6), East Dagon"}, {"city": "Yangon", "email": "", "township": "Nay Pyi Taw", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NPT", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Moh Moh Thant", "payment_terms": "COD", "phone_primary": "09782326699", "address_line_1": "No. (5), Aung Zabu Ward (9), in front of Naypyidaw Council, Zabuthiri Township, Naypyidaw"}, {"city": "Yangon", "email": "", "township": "Alone", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PLE", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Aye Pwint Phyu", "payment_terms": "COD", "phone_primary": "09740908663", "address_line_1": "No. (57), Ngu Wah Road, Ahlone"}, {"city": "Yangon", "email": "", "township": "Shwe Pyi Thar", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "POC", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Ko Thet Oo", "payment_terms": "COD", "phone_primary": "09420093957", "address_line_1": "No. (97/B), Mya Marlar Road, Ward (9), Shwe Pyi Thar"}, {"city": "Yangon", "email": "", "township": "North Okkalapa", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PPL", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Moe Thuzar Aye", "payment_terms": "COD", "phone_primary": "09253420220", "address_line_1": "Between Streets 11 and 12, on Ayar Main Road, Nya Ward, North Okkalapa"}, {"city": "Yangon", "email": "", "township": "Thaketa", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PRE", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Than Than Soe", "payment_terms": "COD", "phone_primary": "09260644879", "address_line_1": "No. (299-A), Mya Marlar Road, Thaketa Industrial Zone"}, {"city": "Yangon", "email": "", "township": "Kyimyindaing", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PSO", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Aye Pwint Phyu", "payment_terms": "COD", "phone_primary": "09740908663", "address_line_1": "No. (57), Ngu Wah Road, Ahlone"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PTB", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Sayar Kyaw", "payment_terms": "COD", "phone_primary": "09257060323", "address_line_1": "No. (1170), Min Ye Kyaw Swar Main Road, Ward (133), East Dagon Township, Yangon"}, {"city": "Yangon", "email": "", "township": "Bahan", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PTP", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Yoon Yadana Lwin", "payment_terms": "COD", "phone_primary": "095191464", "address_line_1": "No. (47/B1), Pho Sein Road, Bahan"}, {"city": "Yangon", "email": "", "township": "Bahan", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PYT", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Zin Mar Htay", "payment_terms": "COD", "phone_primary": "09669716499", "address_line_1": "Police Staff Housing, Mahasi Sasana Yeiktha Road, Bahan"}, {"city": "Yangon", "email": "", "township": "Thaketa", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SEN", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Shwe Eaint", "payment_terms": "COD", "phone_primary": "09944436600", "address_line_1": "No. (25), Aung Thapyay West (5) Street, Ward (7), Thaketa"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SHS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Mya Thida", "payment_terms": "COD", "phone_primary": "09975538286", "address_line_1": "No. (815), Anawrahta Road, Ward (9), East Dagon"}, {"city": "Yangon", "email": "", "township": "South Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SMH", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Pan Ei Wai", "payment_terms": "COD", "phone_primary": "09777759111", "address_line_1": "No. (1235), corner of Min Road and Min Road (2), Ward (55), South Dagon"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SSF", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Su Su", "payment_terms": "COD", "phone_primary": "09786872727", "address_line_1": "Building (1), A1, Ward (42), U Wisara Main Road, in front of Maha Myaing Housing, North Dagon"}, {"city": "Yangon", "email": "", "township": "Shwe Pyi Thar", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "STZ", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Hnin Wai Zin", "payment_terms": "COD", "phone_primary": "09799951012", "address_line_1": "No. (1074), Htan Chauk Pin, Thiri Mingalar Circular Road, in front of Kyan Taing Aung Pagoda, Phaya Lay Road, Shwe Pyi Thar"}, {"city": "Yangon", "email": "", "township": "Hlaing Thar Yar", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SYE", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Shwe Yee", "payment_terms": "COD", "phone_primary": "09752882403", "address_line_1": "Near Dagon Ayar Highway, Sein Tharaphu (2) Street, opposite Pattamyar Nwe Phone Shop"}, {"city": "Yangon", "email": "", "township": "Thingangyun", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "TGK", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Aye Thuzar Aung", "payment_terms": "COD", "phone_primary": "09424596830", "address_line_1": "No. (114/B), Pyitawaye Road, Lay Daunk Kan Ward, Thingangyun"}, {"city": "Yangon", "email": "", "township": "Tamwe", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "UQD", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Ma Wai Zin Phyo", "payment_terms": "COD", "phone_primary": "09888867040", "address_line_1": "No. (7), San Pale (7) Street, Bo Lein Aung Mingalar Ward, west of Yuzana Plaza, APAC Tower"}, {"city": "Yangon", "email": "", "township": "East Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "BBW", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Ma Htet Htet Hlaing", "payment_terms": "COD", "phone_primary": "09759791826", "address_line_1": "No. (22), Bo Hmu Ba Htoo Road, Ward (6), East Dagon"}, {"city": "Yangon", "email": "", "township": "South Okkalapa", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SFH", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Nan Nan", "payment_terms": "COD", "phone_primary": "09451578299", "address_line_1": "No. (879), Metta Road, in front of 13 Market, in front of Ngwe Yamone Market, South Okkalapa"}, {"city": "Yangon", "email": "", "township": "Shwe Pyi Thar", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "ZZE", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Zan Zan Soe", "payment_terms": "COD", "phone_primary": "09673648505", "address_line_1": "No. (159-B), Thiri Mingalar Circular Road, Ward 5/6, Shwe Pyi Thar"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "FFU", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Food For U", "payment_terms": "COD", "phone_primary": "099777809039", "address_line_1": "No. (1265), Ground Floor, Bo Min Yaung Road, Ward (41), North Dagon"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SOS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Hnin Thiri", "payment_terms": "COD", "phone_primary": "09250050750", "address_line_1": "No. (716/A), Maha Bandula Road, also known as Mandalay Road, Ward (46), North Dagon"}, {"city": "Yangon", "email": "", "township": "South Okkalapa", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "AK", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Ma Jar Li", "payment_terms": "COD", "phone_primary": "09-978939591", "address_line_1": "No. (125/B), Ward 14/3, Thandumar Main Road, near Okkalapa Pagoda, South Okkalapa"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "SLN", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "SLN", "payment_terms": "COD", "phone_primary": "09-954033833", "address_line_1": "On Bayint Naung Main Road, in front of Pinlon City Mall, Pinlon Hill, Second Floor, North Dagon"}, {"city": "Yangon", "email": "", "township": "South Okkalapa", "is_active": "TRUE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "TZ", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Khaing Thazin Han", "payment_terms": "COD", "phone_primary": "09-981381635", "address_line_1": "No. (266), Metta Road, Ward (10), South Okkalapa"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "TRUE", "created_at": "2026-05-20T06:52:26.250384+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "KWY", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "retail", "merchant_name": "Win Win May", "payment_terms": "COD", "phone_primary": "09-765144772", "address_line_1": "No. (40)/(Ta-173), Min Ye Kyaw Swar Road, Ward (40), North Dagon"}, {"city": "Yangon", "email": "", "township": "North Dagon", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "PP", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Pann Pann", "payment_terms": "COD", "phone_primary": "09-791596959", "address_line_1": "No. (383), Sein Pan Road, Ward (40), North Dagon"}, {"city": "Yangon", "email": "", "township": "South Okkalapa", "is_active": "FALSE", "created_at": "2026-05-19T21:31:10.378093+00:00", "created_by": "95780372-8836-4abc-a277-8a32c7c969b6", "updated_at": "2026-05-20T12:09:38.883048+00:00", "approved_at": "", "approved_by": "", "merchant_code": "NKS", "region_state": "Yangon Region", "approval_note": "APPROVE", "business_type": "Online Shop", "merchant_name": "Willian Hein", "payment_terms": "COD", "phone_primary": "09-5199004", "address_line_1": "No. (698), Baya Thingyan Road, Ward (10), South Okkalapa"}]'::jsonb) as x(
    city text,
    email text,
    township text,
    is_active text,
    created_at text,
    created_by text,
    updated_at text,
    approved_at text,
    approved_by text,
    merchant_code text,
    region_state text,
    approval_note text,
    business_type text,
    merchant_name text,
    payment_terms text,
    phone_primary text,
    address_line_1 text
  )
)
insert into public.merchant_master (
  merchant_code,
  merchant_name,
  business_type,
  payment_terms,
  phone_primary,
  sender_phone,
  email,
  address_line_1,
  pickup_address,
  sender_address,
  township,
  city,
  city_region,
  region_state,
  assigned_branch,
  approval_note,
  is_active,
  created_by,
  approved_by,
  created_at,
  approved_at,
  updated_at
)
select
  nullif(trim(merchant_code), ''),
  nullif(trim(merchant_name), ''),
  nullif(trim(business_type), ''),
  coalesce(nullif(trim(payment_terms), ''), 'COD'),
  nullif(trim(phone_primary), ''),
  nullif(trim(phone_primary), ''),
  nullif(trim(email), ''),
  nullif(trim(address_line_1), ''),
  nullif(trim(address_line_1), ''),
  nullif(trim(address_line_1), ''),
  nullif(trim(township), ''),
  nullif(trim(city), ''),
  nullif(trim(city), ''),
  nullif(trim(region_state), ''),
  case
    when lower(coalesce(city, '')) like '%mandalay%' then 'MDY'
    when lower(coalesce(city, '')) like '%naypy%' then 'NPT'
    else 'YGN'
  end,
  nullif(trim(approval_note), ''),
  case when upper(coalesce(is_active, 'TRUE')) in ('TRUE','T','YES','Y','1') then true else false end,
  case
  when nullif(trim(created_by), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then trim(created_by)::uuid
  else null
end,
  case
  when nullif(trim(approved_by), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then trim(approved_by)::uuid
  else null
end,
  nullif(created_at, '')::timestamptz,
  nullif(approved_at, '')::timestamptz,
  coalesce(nullif(updated_at, '')::timestamptz, now())
from src
where nullif(trim(merchant_code), '') is not null
  and nullif(trim(merchant_name), '') is not null;

create index if not exists idx_merchant_master_code on public.merchant_master(merchant_code);
create index if not exists idx_merchant_master_name on public.merchant_master(merchant_name);
create index if not exists idx_merchant_master_active on public.merchant_master(is_active);
create index if not exists idx_merchant_master_township on public.merchant_master(township);

-- =========================
-- 2) CUSTOMER SERVICE MERCHANT OPTIONS
-- =========================
create or replace function public.be_customer_service_merchant_options(p_limit integer default 1000)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.merchant_name), '[]'::jsonb)
  from (
    select
      id::text as id,
      merchant_code,
      merchant_name,
      merchant_name as sender_name,
      coalesce(sender_phone, phone_primary) as sender_phone,
      coalesce(pickup_address, address_line_1, sender_address) as pickup_address,
      coalesce(pickup_address, address_line_1, sender_address) as address_line_1,
      coalesce(pickup_address, address_line_1, sender_address) as address,
      township,
      city as city_region,
      city,
      region_state,
      coalesce(payment_terms, 'COD') as payment_terms,
      ''::text as tariff_code,
      coalesce(assigned_branch,
        case
          when lower(coalesce(city, '')) like '%mandalay%' then 'MDY'
          when lower(coalesce(city, '')) like '%naypy%' then 'NPT'
          else 'YGN'
        end
      ) as assigned_branch,
      business_type,
      is_active
    from public.merchant_master
    order by merchant_name
    limit greatest(coalesce(p_limit, 1000), 1)
  ) m;
$$;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  source text,
  requester_type text,
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  township text,
  city_region text,
  branch_code text,
  parcel_count integer default 1,
  cod_amount numeric default 0,
  status text default 'DATA_ENTRY_IN_PROGRESS',
  payment_terms text default 'COD',
  tariff_code text,
  priority text default 'Normal',
  special_instructions text,
  pickup_date text,
  pickup_time text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists source text,
  add column if not exists requester_type text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists city_region text,
  add column if not exists branch_code text,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists status text default 'DATA_ENTRY_IN_PROGRESS',
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text,
  add column if not exists priority text default 'Normal',
  add column if not exists special_instructions text,
  add column if not exists pickup_date text,
  add column if not exists pickup_time text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests p
    order by p.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) p;
$$;

create or replace function public.be_customer_service_create_pickup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text;
  v_inserted public.be_portal_pickup_requests;
begin
  if nullif(trim(coalesce(p_payload->>'pickup_address', '')), '') is null then
    raise exception 'Pickup address is required from merchant master data.';
  end if;

  v_pickup_id := coalesce(
    nullif(p_payload->>'pickup_id', ''),
    'P' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(coalesce(nullif(p_payload->>'merchant_code',''), 'CS'))
  );

  insert into public.be_portal_pickup_requests (
    pickup_id, source, requester_type, merchant_code, merchant_name, sender_name, sender_phone,
    pickup_address, township, city_region, branch_code, parcel_count, cod_amount, status,
    payment_terms, tariff_code, priority, special_instructions, pickup_date, pickup_time, updated_at
  ) values (
    v_pickup_id,
    'customer_service',
    coalesce(nullif(p_payload->>'requester_type', ''), 'Merchant'),
    p_payload->>'merchant_code',
    p_payload->>'merchant_name',
    p_payload->>'sender_name',
    p_payload->>'sender_phone',
    p_payload->>'pickup_address',
    p_payload->>'township',
    p_payload->>'city_region',
    p_payload->>'assigned_branch',
    coalesce(nullif(p_payload->>'parcel_count','')::integer, 1),
    coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0),
    'DATA_ENTRY_IN_PROGRESS',
    coalesce(nullif(p_payload->>'payment_terms',''), 'COD'),
    p_payload->>'tariff_code',
    coalesce(nullif(p_payload->>'priority',''), 'Normal'),
    p_payload->>'special_instructions',
    p_payload->>'pickup_date',
    p_payload->>'pickup_time',
    now()
  ) returning * into v_inserted;

  return to_jsonb(v_inserted);
end;
$$;

-- =========================
-- 3) MASTER DATA CRUD RPCS
-- =========================
create or replace function public.be_master_data_merchant_list(p_search text default null, p_limit integer default 1000)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.merchant_name), '[]'::jsonb)
  from (
    select *
    from public.merchant_master m
    where nullif(trim(coalesce(p_search, '')), '') is null
       or m.merchant_code ilike '%' || p_search || '%'
       or m.merchant_name ilike '%' || p_search || '%'
       or coalesce(m.phone_primary, '') ilike '%' || p_search || '%'
       or coalesce(m.township, '') ilike '%' || p_search || '%'
       or coalesce(m.address_line_1, m.pickup_address, '') ilike '%' || p_search || '%'
    order by m.merchant_name
    limit greatest(coalesce(p_limit, 1000), 1)
  ) m;
$$;

create or replace function public.be_master_data_upsert_merchant(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(trim(coalesce(p_payload->>'merchant_code', '')));
  v_row public.merchant_master;
begin
  if v_code = '' then
    raise exception 'Merchant code is required.';
  end if;
  if nullif(trim(coalesce(p_payload->>'merchant_name', '')), '') is null then
    raise exception 'Merchant name is required.';
  end if;
  if nullif(trim(coalesce(p_payload->>'address_line_1', p_payload->>'pickup_address', '')), '') is null then
    raise exception 'Pickup address is required.';
  end if;

  insert into public.merchant_master (
    merchant_code, merchant_name, business_type, payment_terms, phone_primary, sender_phone, email,
    address_line_1, pickup_address, sender_address, township, city, city_region, region_state,
    assigned_branch, approval_note, is_active, updated_at
  ) values (
    v_code,
    trim(p_payload->>'merchant_name'),
    nullif(trim(coalesce(p_payload->>'business_type', '')), ''),
    coalesce(nullif(trim(coalesce(p_payload->>'payment_terms', '')), ''), 'COD'),
    nullif(trim(coalesce(p_payload->>'phone_primary', p_payload->>'sender_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'sender_phone', p_payload->>'phone_primary', '')), ''),
    nullif(trim(coalesce(p_payload->>'email', '')), ''),
    nullif(trim(coalesce(p_payload->>'address_line_1', p_payload->>'pickup_address', '')), ''),
    nullif(trim(coalesce(p_payload->>'pickup_address', p_payload->>'address_line_1', '')), ''),
    nullif(trim(coalesce(p_payload->>'pickup_address', p_payload->>'address_line_1', '')), ''),
    nullif(trim(coalesce(p_payload->>'township', '')), ''),
    nullif(trim(coalesce(p_payload->>'city', p_payload->>'city_region', '')), ''),
    nullif(trim(coalesce(p_payload->>'city_region', p_payload->>'city', '')), ''),
    nullif(trim(coalesce(p_payload->>'region_state', '')), ''),
    coalesce(nullif(trim(coalesce(p_payload->>'assigned_branch', '')), ''), 'YGN'),
    nullif(trim(coalesce(p_payload->>'approval_note', '')), ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    now()
  )
  on conflict (merchant_code) do update set
    merchant_name = excluded.merchant_name,
    business_type = excluded.business_type,
    payment_terms = excluded.payment_terms,
    phone_primary = excluded.phone_primary,
    sender_phone = excluded.sender_phone,
    email = excluded.email,
    address_line_1 = excluded.address_line_1,
    pickup_address = excluded.pickup_address,
    sender_address = excluded.sender_address,
    township = excluded.township,
    city = excluded.city,
    city_region = excluded.city_region,
    region_state = excluded.region_state,
    assigned_branch = excluded.assigned_branch,
    approval_note = excluded.approval_note,
    is_active = excluded.is_active,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_master_data_delete_merchant(p_merchant_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(trim(coalesce(p_merchant_code, '')));
  v_count integer;
begin
  if v_code = '' then
    raise exception 'Merchant code is required.';
  end if;

  delete from public.merchant_master where merchant_code = v_code;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'merchant_code', v_code, 'deleted_count', v_count);
end;
$$;

-- =========================
-- 4) SUPERVISOR WARNING FIXES
-- =========================
-- Remove conflicting overloaded function candidates.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, p.proname as function_name, oidvectortypes(p.proargtypes) as arg_types
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_supervisor_portal_snapshot'
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.schema_name, r.function_name, r.arg_types);
  end loop;
end $$;

create table if not exists public.be_supervisor_job_assignments (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  job_type text,
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  status text default 'assigned',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_supervisor_job_assignments
  add column if not exists pickup_id text,
  add column if not exists job_type text,
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists status text default 'assigned',
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_order_picking_jobs (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  assigned_to text,
  status text default 'assigned',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_order_picking_jobs
  add column if not exists pickup_id text,
  add column if not exists assigned_to text,
  add column if not exists status text default 'assigned',
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text,
  pickup_id text,
  status text default 'assigned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_delivery_jobs
  add column if not exists wayplan_id text,
  add column if not exists pickup_id text,
  add column if not exists status text default 'assigned',
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  route_id text,
  wayplan_id text,
  status text default 'planned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  route_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_routes
  add column if not exists route_id text,
  add column if not exists wayplan_id text,
  add column if not exists status text default 'planned',
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists route_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_wayplans (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text,
  status text default 'planned',
  pickup_count integer default 0,
  stop_count integer default 0,
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_wayplans
  add column if not exists wayplan_id text,
  add column if not exists status text default 'planned',
  add column if not exists pickup_count integer default 0,
  add column if not exists stop_count integer default 0,
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create or replace function public.be_supervisor_portal_snapshot(p_search text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pickups jsonb;
  v_assignments jsonb;
  v_order_jobs jsonb;
  v_delivery_jobs jsonb;
  v_routes jsonb;
  v_wayplans jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  into v_pickups
  from (
    select * from public.be_portal_pickup_requests p
    where v_search is null
       or p.pickup_id ilike '%' || v_search || '%'
       or coalesce(p.merchant_name, '') ilike '%' || v_search || '%'
       or coalesce(p.sender_phone, '') ilike '%' || v_search || '%'
    order by p.created_at desc
    limit 500
  ) p;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_assignments
  from (select * from public.be_supervisor_job_assignments order by created_at desc limit 500) a;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  into v_order_jobs
  from (select * from public.be_order_picking_jobs order by created_at desc limit 500) o;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
  into v_delivery_jobs
  from (select * from public.be_delivery_jobs order by created_at desc limit 500) d;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_routes
  from (select * from public.delivery_routes order by created_at desc limit 500) r;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb)
  into v_wayplans
  from (select * from public.be_wayplans order by created_at desc limit 500) w;

  return jsonb_build_object(
    'pickups', v_pickups,
    'job_assignments', v_assignments,
    'order_picking_jobs', v_order_jobs,
    'delivery_jobs', v_delivery_jobs,
    'delivery_routes', v_routes,
    'wayplans', v_wayplans,
    'workforce', '[]'::jsonb,
    'metrics', jsonb_build_object(
      'pending_wayplan', jsonb_array_length(v_pickups),
      'active_rows', jsonb_array_length(v_delivery_jobs),
      'exceptions', 0,
      'fleet_ready', 0
    )
  );
end;
$$;

-- =========================
-- 5) RLS FOR AUTH USERS
-- =========================
alter table public.merchant_master enable row level security;
alter table public.be_portal_pickup_requests enable row level security;
alter table public.be_supervisor_job_assignments enable row level security;
alter table public.be_order_picking_jobs enable row level security;
alter table public.be_delivery_jobs enable row level security;
alter table public.delivery_routes enable row level security;
alter table public.be_wayplans enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'merchant_master',
    'be_portal_pickup_requests',
    'be_supervisor_job_assignments',
    'be_order_picking_jobs',
    'be_delivery_jobs',
    'delivery_routes',
    'be_wayplans'
  ] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);
    execute format('drop policy if exists %I_insert_auth on public.%I', t, t);
    execute format('drop policy if exists %I_update_auth on public.%I', t, t);
    execute format('drop policy if exists %I_delete_auth on public.%I', t, t);
    execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert_auth on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update_auth on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy %I_delete_auth on public.%I for delete to authenticated using (true)', t, t);
  end loop;
end $$;

-- Final checks
select count(*) as merchant_master_rows from public.merchant_master;
select merchant_code, merchant_name, township, pickup_address, assigned_branch
from public.merchant_master
where merchant_code = 'BBG';
