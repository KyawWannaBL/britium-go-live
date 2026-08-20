-- Britium Express canonical tariff wiring for Data Entry and Tariff screen
-- Build: FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03
-- Scope: township identity crosswalk, canonical tariff catalogue RPC and resolver only.
-- No tariff amount, parcel, merchant profile, mutation mode or financial-write flag is changed.

rollback;
begin;

do $preflight$
begin
  if to_regclass('public.be_parcel_tariffs_v2') is null then
    raise exception 'ABORT: be_parcel_tariffs_v2 is missing.';
  end if;
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'ABORT: be_calculate_parcel_financial_v2 is missing.';
  end if;
  if to_regprocedure('public.be_financial_v2_township_key_v61_4_1(text)') is null then
    raise exception 'ABORT: existing township resolver is missing.';
  end if;
  if to_regclass('public.be_data_entry_financial_v2_runtime_v58') is null then
    raise exception 'ABORT: Financial V2 runtime control is missing.';
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: expected MUTATION_SHADOW before V61.7.';
  end if;
end
$preflight$;

create table if not exists public.be_financial_v2_function_backup_v61_7 (
  backup_id bigserial primary key,
  build text not null,
  function_signature text not null,
  function_definition text not null,
  definition_md5 text not null,
  backed_up_at timestamptz not null default now()
);

insert into public.be_financial_v2_function_backup_v61_7(
  build,function_signature,function_definition,definition_md5
)
select
  'PRE_FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03',
  'public.be_financial_v2_township_key_v61_4_1(text)',
  pg_get_functiondef('public.be_financial_v2_township_key_v61_4_1(text)'::regprocedure),
  md5(pg_get_functiondef('public.be_financial_v2_township_key_v61_4_1(text)'::regprocedure))
where not exists (
  select 1 from public.be_financial_v2_function_backup_v61_7
  where build='PRE_FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03'
);

create table if not exists public.be_township_identity_v61_7 (
  township_code text primary key,
  township_name_en text not null,
  township_name_mm text not null,
  city text,
  state_region_name_en text,
  state_region_name_mm text,
  normalized_en text not null default '',
  normalized_mm text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.be_financial_v2_normalize_township_text_v61_7(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $normalize$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p_value,'')), '[[:punct:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$normalize$;

insert into public.be_township_identity_v61_7(
  township_code,township_name_en,township_name_mm,city,state_region_name_en,state_region_name_mm
)
values
  ('MMR017024','Bogale','ဘိုကလေး','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017022','Danubyu','ဓနုဖြူ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017026','Dedaye','ဒေးဒရဲ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017015','Einme','အိမ်မဲ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017008','Hinthada','ဟင်္သာတ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017013','Ingapu','အင်္ဂပူ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017002','Kangyidaunt','ကန်ကြီးထောင့်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017025','Kyaiklat','ကျိုက်လတ်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017012','Kyangin','ကြံခင်း','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017007','Kyaunggon','ကျောင်းကုန်း','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017005','Kyonpyaw','ကျုံပျော်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017016','Labutta','လပွတ္တာ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017010','Lemyethna','လေးမျက်နှာ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017019','Maubin','မအူပင်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017018','Mawlamyinegyun','မော်လမြိုင်ကျွန်း','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017011','Myanaung','မြန်အောင်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017014','Myaungmya','မြောင်းမြ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017004','Ngapudaw','ငပုတော','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017021','Nyaungdon','ညောင်တုန်း','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017020','Pantanaw','ပန်းတနော်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017001','Pathein','ပုသိမ်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017023','Pyapon','ဖျာပုံ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017003','Thabaung','သာပေါင်း','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017017','Wakema','ဝါးခယ်မ','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017006','Yegyi','ရေကြည်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR017009','Zalun','ဇလွန်','Pathein','Ayeyarwady','ဧရာဝတီတိုင်းဒေသကြီး'),
  ('MMR007001','Bago','ပဲခူး','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007007','Daik-U','ဒိုက်ဦး','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008014','Gyobingauk','ကြို့ပင်ကောက်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007014','Htantabin','ထန်းတပင်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007003','Kawa','ကဝ','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007011','Kyaukkyi','ကျောက်ကြီး','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007006','Kyauktaga','ကျောက်တံခါး','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008008','Letpadan','လက်ပံတန်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008009','Minhla','မင်းလှ','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008013','Monyo','မိုးညို','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008012','Nattalin','နတ်တလင်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007005','Nyaunglebin','ညောင်လေးပင်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008010','Okpho','အုတ်ဖို','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007013','Oktwin','အုတ်တွင်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008003','Padaung','ပန်းတောင်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008002','Paukkhaung','ပေါက်ခေါင်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008004','Paungde','ပေါင်းတည်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007012','Phyu','ဖြူး','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008001','Pyay','ပြည်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008006','Shwedaung','ရွှေတောင်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007008','Shwegyin','ရွှေကျင်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007009','Taungoo','တောင်ငူ','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007002','Thanatpin','သနပ်ပင်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008007','Thayarwady','သာယာဝတီ','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008005','Thegon','သဲကုန်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007004','Waw','ဝေါ','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR007010','Yedashe','ရေတာရှည်','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR008011','Zigon','ဇီးကုန်း','Bago','Bago','ပဲခူးတိုင်းဒေသကြီး'),
  ('MMR004001','Falam','ဖလမ်း','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004002','Hakha','ဟားခါး','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004008','Kanpetlet','ကန်ပက်လက်','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004007','Matupi','မတူပီ','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004006','Mindat','မင်းတပ်','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004009','Paletwa','ပလက်ဝ','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004004','Tedim','တီးတိန်','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004003','Thantlang','ထန်တလန်','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR004005','Tonzang','တွန်းဇန်','Teetain','Chin','ချင်းပြည်နယ်'),
  ('MMR001010','Bhamo','ဗန်းမော်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001005','Chipwi','ချီ​ဖွေ','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001009','Hpakant','ဖားကန့်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001003','Injangyang','အင်ဂျန်းယန်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001018','Khaunglanhpu','ခေါင်လန်ဖူး','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001016','Machanbaw','မချမ်းဘော','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001013','Mansi','မံစီ','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001008','Mogaung','မိုးကောင်း','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001007','Mohnyin','မိုးညှင်း','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001012','Momauk','မိုးမောက်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001001','Myitkyina','မြစ်ကြီးနား','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001017','Nawngmun','နောင်မွန်း','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001014','Puta-O','ပူတာအို','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001011','Shwegu','ရွှေကူ','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001015','Sumprabum','ဆွမ်ပရာဘွမ်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001004','Tanai','တနိုင်း','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001006','Tsawlaw','ဆော့လော်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR001002','Waingmaw','ဝိုင်းမော်','Myitkyina','Kachin','ကချင်ပြည်နယ်'),
  ('MMR002005','Bawlake','ဘောလခဲ','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002002','Demoso','ဒီးမော့ဆို','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002006','Hpasawng','ဖားဆောင်း','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002003','Hpruso','ဖရူဆို','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002001','Loikaw','လွိုင်ကော်','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002007','Mese','မယ်စဲ့','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR002004','Shadaw','ရှားတော','Loikaw','Kayah','ကယားပြည်နယ်'),
  ('MMR003002','Hlaingbwe','လှိုင်းဘွဲ့','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003001','Hpa-An','ဘားအံ','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003003','Hpapun','ဖာပွန်','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003006','Kawkareik','ကော့ကရိတ်','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003007','Kyainseikgyi','ကြာအင်းဆိပ်ကြီး','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003005','Myawaddy','မြဝတီ','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR003004','Thandaunggyi','သံတောင်ကြီး','Loikaw','Kayin','ကရင်ပြည်နယ်'),
  ('MMR009016','Aunglan','အောင်လံ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009003','Chauk','ချောက်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009023','Gangaw','ဂန့်ဂေါ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009015','Kamma','ကံမ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009001','Magway','မကွေး','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009007','Minbu','မင်းဘူး','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009014','Mindon','မင်းတုန်း','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009013','Minhla','မင်းလှ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009020','Myaing','မြိုင်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009005','Myothit','မြို့သစ်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009006','Natmauk','နတ်မောက်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009009','Ngape','ငဖဲ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009018','Pakokku','ပခုက္ကူ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009021','Pauk','ပေါက်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009008','Pwintbyu','ပွင့်ဖြူ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009010','Salin','စလင်း','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009025','Saw','ဆော','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009022','Seikphyu','ဆိပ်ဖြူ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009011','Sidoktaya','စေတုတ္ထရာ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009017','Sinbaungwe','ဆင်ပေါင်ဝဲ','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009004','Taungdwingyi','တောင်တွင်းကြီး','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009012','Thayet','သရက်','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009024','Tilin','ထီးလင်း','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009002','Yenangyaung','ရေနံချောင်း','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR009019','Yesagyo','ရေစကြို','Magway','Magway','မကွေးတိုင်းဒေသကြီး'),
  ('MMR010006','Amarapura','အမရပူရ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010001','Aungmyaythazan','အောင်မြေသာစံ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010002','Chanayethazan','ချမ်းအေးသာစံ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010004','Chanmyathazi','ချမ်းမြသာစည်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010020','Kyaukpadaung','ကျောက်ပန်းတောင်း','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010013','Kyaukse','ကျောက်ဆည်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010009','Madaya','မတ္တရာ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010003','Mahaaungmyay','မဟာအောင်မြေ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010029','Mahlaing','မလှိုင်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010028','Meiktila','မိတ္ထီလာ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010011','Mogoke','မိုးကုတ်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010017','Myingyan','မြင်းခြံ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010015','Myittha','မြစ်သား','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010019','Natogyi','နွားထိုးကြီး','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010021','Ngazun','ငါန်းဇွန်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010022','Nyaung-U','ညောင်ဦး','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010007','Patheingyi','ပုသိမ်ကြီး','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010024','Pyawbwe','ပျော်ဘွယ်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010005','Pyigyitagon','ပြည်ကြီးတံခွန်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010008','Pyinoolwin','ပြင်ဦးလွင်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010010','Singu','စဉ့်ကူး','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010014','Sintgaing','စဉ့်ကိုင်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010016','Tada-U','တံတားဦး','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010018','Taungtha','တောင်သာ','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010012','Thabeikkyin','သပိတ်ကျင်း','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010030','Thazi','သာစည်','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010031','Wundwin','ဝမ်းတွင်း','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR010023','Yamethin','ရမည်းသင်း','Mandalay','Mandalay','မန္တလေးတိုင်းဒေသကြီး'),
  ('MMR011010','Bilin','ဘီးလင်း','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011003','Chaungzon','ချောင်းဆုံ','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011002','Kyaikmaraw','ကျိုက်မရော','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011009','Kyaikto','ကျိုက်ထို','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011001','Mawlamyine','မော်လမြိုင်','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011005','Mudon','မုဒုံ','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011008','Paung','ပေါင်','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011004','Thanbyuzayat','သံဖြူဇရပ်','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011007','Thaton','သထုံ','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR011006','Ye','ရေး','Mawlamyine','Mon','မွန်ပြည်နယ်'),
  ('MMR018004','Det Khi Na Thi Ri','ဒက္ခိဏသီရိ','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018007','Lewe','လယ်ဝေး','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018008','Oke Ta Ra Thi Ri','ဥတ္တရသီရိ','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018005','Poke Ba Thi Ri','ပုဗ္ဗသီရိ','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018006','Pyinmana','ပျဉ်းမနား','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018003','Tatkon','တပ်ကုန်း','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018002','Za Bu Thi Ri','ဇမ္ဗူသီရိ','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR018001','Zay Yar Thi Ri','ဇေယျာသီရိ','Naypyitaw','Nay Pyi Taw','နေပြည်တော်'),
  ('MMR012014','Ann','အမ်း','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012010','Buthidaung','ဘူးသီးတောင်','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012017','Gwa','ဂွ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012011','Kyaukpyu','ကျောက်ဖြူ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012004','Kyauktaw','ကျောက်တော်','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012009','Maungdaw','မောင်တော','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012005','Minbya','မင်းပြား','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012003','Mrauk-U','မြောက်ဦး','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012012','Munaung','မာန်အောင်','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012006','Myebon','မြေပုံ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012007','Pauktaw','ပေါက်တော','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012002','Ponnagyun','ပုဏ္ဏားကျွန်း','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012013','Ramree','ရမ်းဗြဲ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012008','Rathedaung','ရသေ့တောင်','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012001','Sittwe','စစ်တွေ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012015','Thandwe','သံတွဲ','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR012016','Toungup','တောင်ကုတ်','Sittway','Rakhine','ရခိုင်ပြည်နယ်'),
  ('MMR005014','Ayadaw','အရာတော်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005023','Banmauk','ဗန်းမောက်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005013','Budalin','ဘုတလင်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005015','Chaung-U','ချောင်းဦး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005033','Hkamti','ခန္တီး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005034','Homalin','ဟုမ္မလင်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005021','Indaw','အင်းတော်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005027','Kale','ကလေး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005028','Kalewa','ကလေးဝ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005007','Kanbalu','ကန့်ဘလူ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005017','Kani','ကနီ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005020','Katha','ကသာ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005024','Kawlin','ကောလင်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005005','Khin-U','ခင်ဦး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005008','Kyunhla','ကျွန်းလှ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005036','Lahe','လဟယ်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005035','Layshi','လေရှီး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005031','Mawlaik','မော်လိုက်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005029','Mingin','မင်းကင်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005012','Monywa','မုံရွာ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005003','Myaung','မြောင်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005002','Myinmu','မြင်းမူ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005037','Nanyun','နန်းယွန်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005019','Pale','ပုလဲ','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005032','Paungbyin','ဖောင်းပြင်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005026','Pinlebu','ပင်လည်ဘူး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005001','Sagaing','စစ်ကိုင်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005018','Salingyi','ဆားလင်းကြီး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005004','Shwebo','ရွှေဘို','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005010','Tabayin','ဒီပဲယင်း','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005030','Tamu','တမူး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005011','Taze','တန့်ဆည်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005022','Tigyaing','ထီးချိုင့်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005006','Wetlet','ဝက်လက်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005025','Wuntho','ဝန်းသို','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005009','Ye-U','ရေဦး','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR005016','Yinmarbin','ယင်းမာပင်','Monwya','Sagaing','စစ်ကိုင်းတိုင်းဒေသကြီး'),
  ('MMR015311','Aik Chan (Ai'' Chun)','အိုက်ချန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015203','Chinshwehaw Sub-township (Kokang SAZ)','ချင်းရွှေဟော်မြို့နယ်ခွဲ (အထူးဒေသ ၁)','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015306','Hkun Mar (Hkwin Ma)','ခွန်းမား','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016320','Ho Tawng (Ho Tao)','ဟိုတောင်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015021','Hopang','ဟိုပန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014003','Hopong','ဟိုပုံး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015305','Hsawng Hpa (Saun Pha)','ဆောင်ဖ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015002','Hseni','သိန္နီ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014004','Hsihseng','ဆီဆိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015014','Hsipaw','သီပေါ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015310','Ka Lawng Hpar','ကလောင်ဖါ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014005','Kalaw','ကလော','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015304','Kawng Min Hsang','ကောင်မင်ဆန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016001','Kengtung','ကျိုင်းတုံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015023','Konkyan','ကုန်းကြမ်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015201','Konkyan (Kokang SAZ)','ကုန်းကြမ်း (အထူးဒေသ ၁)','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014014','Kunhing','ကွန်ဟိန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015020','Kunlong','ကွမ်းလုံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015011','Kutkai','ကွတ်ခိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015012','Kyaukme','ကျောက်မဲ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014015','Kyethi','ကျေးသီး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014012','Laihka','လဲချား','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014018','Langkho','လင်းခေး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015001','Lashio','လားရှိုး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015022','Laukkaing','လောက်ကိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015202','Laukkaing (Kokang SAZ)','လောက်ကိုင် (အထူးဒေသ ၁)','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014008','Lawksawk','ရပ်စောက်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015309','Lin Haw','လင်ဟော်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014011','Loilen','လွိုင်လင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015307','Long Htan','လုံထန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015018','Mabein','မဘိမ်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015313','Man Man Hseng','မန်မန်ဆိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015303','Man Tun','မန်တွန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015019','Manton','မန်တုံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015024','Matman','မက်မန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014020','Mawkmai','မောက်မယ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016319','Mong Hpen','မိုင်းဖျန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016322','Mong Kar','မိုင်းကာ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016321','Mong Pawk','မိုင်းပေါက်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016010','Monghpyak','မိုင်းဖြတ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016006','Monghsat','မိုင်းဆတ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014017','Monghsu','မိုင်းရှူး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014016','Mongkaing','မိုင်းကိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016002','Mongkhet','မိုင်းခတ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016005','Mongla','မိုင်းလား','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015008','Mongmao','မိုင်းမော','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015017','Mongmit','မိုးမိတ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014019','Mongnai','မိုးနဲ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014021','Mongpan','မိုင်းပန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016007','Mongping','မိုင်းပျဉ်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016008','Mongton','မိုင်းတုံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015003','Mongyai','မိုင်းရယ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016003','Mongyang','မိုင်းယန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016011','Mongyawng','မိုင်းယောင်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015009','Muse','မူဆယ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015315','Nam Hkam Wu','နမ်ခမ်းဝူး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016323','Nam Hpai','နမ့်ဖိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015301','Nam Tit','နမ့် တစ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015010','Namhkan','နမ့်ခမ်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015016','Namhsan','နမ့်ဆန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015015','Namtu','နမ္မတူ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014013','Nansang','နမ့်စန်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015316','Nar Kawng','နားကောင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015302','Nar Wee (Na Wi)','နာဝီး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015006','Narphan','နားဖန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015314','Nawng Hkit','နောင်ခစ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015013','Nawnghkio','နောင်ချို','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014002','Nyaungshwe','ညောင်ရွှေ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015317','Pang Hkam','ပန်ခမ့်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015318','Pang Yang','ပန်ယန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015005','Pangsang (Panghkam)','ပန်ဆန်း (ပန်ခမ်း)','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015007','Pangwaun','ပန်ဝိုင်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014010','Pekon','ဖယ်ခုံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014006','Pindaya','ပင်းတယ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014009','Pinlaung','ပင်လောင်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR016009','Tachileik','တာချီလိတ်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015004','Tangyan','တန့်ယန်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014001','Taunggyi','တောင်ကြီး','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015308','Yawng Lin','ယောင်လင်း','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR015312','Yin Pang','ရင်ဖန့်','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR014007','Ywangan','ရွာငံ','Taunggyi','Shan','ရှမ်းပြည်နယ်'),
  ('MMR006010','Bokpyin','ဘုတ်ပြင်း','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006001','Dawei','ထားဝယ်','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006009','Kawthoung','ကော့သောင်း','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006006','Kyunsu','ကျွန်းစု','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006002','Launglon','လောင်းလုံး','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006005','Myeik','မြိတ်','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006007','Palaw','ပုလော','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006008','Tanintharyi','တနင်္သာရီ','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006003','Thayetchaung','သရက်ချောင်း','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR006004','Yebyu','ရေဖြူ','Kawthaung','Tanintharyi','တနင်္သာရီတိုင်းဒေသကြီး'),
  ('MMR013037','Ahlone','အလုံ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013044','Bahan','ဗဟန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013017','Botahtaung','ဗိုလ်တထောင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013032','Cocokyun','ကိုကိုးကျွန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013043','Dagon','ဒဂုံ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013020','Dagon Myothit (East)','ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013019','Dagon Myothit (North)','ဒဂုံမြို့သစ် (မြောက်ပိုင်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013021','Dagon Myothit (Seikkan)','ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013018','Dagon Myothit (South)','ဒဂုံမြို့သစ် (တောင်ပိုင်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013030','Dala','ဒလ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013014','Dawbon','ဒေါပုံ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013040','Hlaing','လှိုင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013046','Hlaingtharya (East)','လှိုင်သာယာ (အရှေ့ပိုင်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013047','Hlaingtharya (West)','လှိုင်သာယာ (အနောက်ပိုင်း)','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013004','Hlegu','လှည်းကူး','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013003','Hmawbi','မှော်ဘီ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013006','Htantabin','ထန်းတပင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013001','Insein','အင်းစိန်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013041','Kamaryut','ကမာရွတ်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013028','Kawhmu','ကော့မှူး','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013026','Kayan','ခရမ်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013029','Kungyangon','ကွမ်းခြံကုန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013033','Kyauktada','ကျောက်တံတား','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013024','Kyauktan','ကျောက်တန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013038','Kyeemyindaing','ကြည့်မြင်တိုင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013035','Lanmadaw','လမ်းမတော်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013036','Latha','လသာ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013042','Mayangone','မရမ်းကုန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013002','Mingaladon','မင်္ဂလာဒုံ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013022','Mingalartaungnyunt','မင်္ဂလာတောင်ညွန့်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013012','North Okkalapa','မြောက်ဥက္ကလာပ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013034','Pabedan','ပန်းဘဲတန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013016','Pazundaung','ပုဇွန်တောင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013039','Sanchaung','စမ်းချောင်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013031','Seikgyikanaungto','ဆိပ်ကြီး/ခနောင်တို','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013007','Shwepyithar','ရွှေပြည်သာ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013011','South Okkalapa','တောင်ဥက္ကလာပ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013005','Taikkyi','တိုက်ကြီး','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013015','Tamwe','တာမွေ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013013','Thaketa','သာကေတ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013023','Thanlyin','သန်လျင်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013009','Thingangyun','သင်္ဃန်းကျွန်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013025','Thongwa','သုံးခွ','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013027','Twantay','တွံတေး','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး'),
  ('MMR013010','Yankin','ရန်ကင်း','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး')
on conflict (township_code) do update set
  township_name_en=excluded.township_name_en,
  township_name_mm=excluded.township_name_mm,
  city=excluded.city,
  state_region_name_en=excluded.state_region_name_en,
  state_region_name_mm=excluded.state_region_name_mm,
  updated_at=now();

update public.be_township_identity_v61_7
set normalized_en=public.be_financial_v2_normalize_township_text_v61_7(township_name_en),
    normalized_mm=public.be_financial_v2_normalize_township_text_v61_7(township_name_mm),
    updated_at=now()
where normalized_en is distinct from public.be_financial_v2_normalize_township_text_v61_7(township_name_en)
   or normalized_mm is distinct from public.be_financial_v2_normalize_township_text_v61_7(township_name_mm);

create index if not exists be_township_identity_v61_7_en_idx on public.be_township_identity_v61_7(normalized_en);
create index if not exists be_township_identity_v61_7_mm_idx on public.be_township_identity_v61_7(normalized_mm);

create or replace function public.be_financial_v2_township_code_v61_7(p_value text)
returns text
language plpgsql
stable
parallel safe
set search_path = public, pg_temp
as $resolver$
declare
  v text := public.be_financial_v2_normalize_township_text_v61_7(p_value);
  v_code text;
begin
  if v = '' then return null; end if;

  select t.township_code into v_code
  from public.be_township_identity_v61_7 t
  where lower(t.township_code)=v
     or t.normalized_en=v
     or t.normalized_mm=v
  order by case when lower(t.township_code)=v then 0 when t.normalized_en=v then 1 else 2 end
  limit 1;
  if v_code is not null then return v_code; end if;

  -- Handles bilingual display values such as "တောင်ဥက္ကလာပ — South Okkalapa"
  -- and longer legacy labels containing Township/Tsp suffixes.
  select t.township_code into v_code
  from public.be_township_identity_v61_7 t
  where (length(t.normalized_en) >= 4 and position(t.normalized_en in v) > 0)
     or (length(t.normalized_mm) >= 2 and position(t.normalized_mm in v) > 0)
  order by greatest(length(t.normalized_en),length(t.normalized_mm)) desc, t.township_code
  limit 1;

  return v_code;
end
$resolver$;

comment on function public.be_financial_v2_township_code_v61_7(text)
is 'V61.7 canonical township identity resolver using the 356-row code/English/Myanmar crosswalk. Accepts code, English, Myanmar and bilingual display labels.';

-- Preserve the existing dependency name used by the verified V61.5 calculation engine.
create or replace function public.be_financial_v2_township_key_v61_4_1(p_value text)
returns text
language sql
stable
parallel safe
set search_path = public, pg_temp
as $compat$
  select public.be_financial_v2_township_code_v61_7(p_value);
$compat$;

comment on function public.be_financial_v2_township_key_v61_4_1(text)
is 'Compatibility entrypoint upgraded by V61.7. Returns the canonical township code for code, English, Myanmar and bilingual labels.';

create or replace function public.be_tariff_catalog_v61_7()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $catalog$
  with active as (
    select
      t.id,
      public.be_financial_v2_township_code_v61_7(t.township) as township_code,
      t.township as stored_township,
      t.customer_tier,
      t.tariff_zone,
      t.tariff_zone_code,
      t.base_tariff,
      t.included_kg,
      t.extra_per_kg,
      t.commitment_min_ways,
      t.commitment_refund_per_way,
      t.note,
      t.status,
      t.effective_from,
      t.effective_to,
      t.updated_at
    from public.be_parcel_tariffs_v2 t
    where t.status='ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date())
  ), rows as (
    select
      a.id,
      a.township_code,
      coalesce(i.township_name_en,a.stored_township) as township,
      i.township_name_mm,
      i.city,
      i.state_region_name_en as region,
      i.state_region_name_mm as region_mm,
      a.customer_tier,
      a.tariff_zone as zone,
      a.tariff_zone_code,
      a.base_tariff as base_fee,
      a.included_kg,
      a.extra_per_kg,
      a.commitment_min_ways,
      a.commitment_refund_per_way,
      a.status,
      a.note,
      a.effective_from,
      a.effective_to,
      a.updated_at,
      'be_parcel_tariffs_v2'::text as source
    from active a
    left join public.be_township_identity_v61_7 i on i.township_code=a.township_code
  )
  select jsonb_build_object(
    'ok',true,
    'build','TARIFF_CATALOG_V61_7_2026_08_03',
    'source','be_parcel_tariffs_v2',
    'generated_at',now(),
    'row_count',(select count(*) from rows),
    'township_count',(select count(distinct township_code) from rows),
    'unresolved_tariff_rows',(select count(*) from rows where township_code is null),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by township,customer_tier) from rows),'[]'::jsonb),
    'data',jsonb_build_object(
      'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by township,customer_tier) from rows),'[]'::jsonb),
      'source','be_parcel_tariffs_v2'
    )
  );
$catalog$;

revoke all on function public.be_tariff_catalog_v61_7() from public;
grant execute on function public.be_tariff_catalog_v61_7() to authenticated, service_role;

-- Every active tariff row must resolve through the shared township identity crosswalk.
do $coverage$
declare
  v_unresolved integer;
  v_examples text;
begin
  select count(*), string_agg(t.township, ', ' order by t.township)
  into v_unresolved, v_examples
  from (
    select distinct township
    from public.be_parcel_tariffs_v2
    where status='ACTIVE'
      and effective_from <= public.be_business_date()
      and (effective_to is null or effective_to >= public.be_business_date())
      and public.be_financial_v2_township_code_v61_7(township) is null
    limit 20
  ) t;
  if coalesce(v_unresolved,0) > 0 then
    raise exception 'ABORT: active tariff township identities remain unresolved: %', v_examples;
  end if;
end
$coverage$;

-- Production failure reproduced in the browser: South Okkalapa, STANDARD, 10 kg.
do $south_okkalapa_test$
declare
  v_en jsonb;
  v_mm jsonb;
  v_bilingual jsonb;
  v_code jsonb;
begin
  v_en := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_mm := public.be_calculate_parcel_financial_v2('တောင်ဥက္ကလာပ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_bilingual := public.be_calculate_parcel_financial_v2('တောင်ဥက္ကလာပ — South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_code := public.be_calculate_parcel_financial_v2('MMR013011','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);

  if v_en->>'validation_status' <> 'OK'
     or (v_en->>'base_tariff')::bigint <> 4000
     or (v_en->>'included_kg')::numeric <> 3
     or (v_en->>'extra_kg')::numeric <> 7
     or (v_en->>'extra_per_kg')::bigint <> 500
     or (v_en->>'weight_surcharge')::bigint <> 3500
     or (v_en->>'cod_amount')::bigint <> 59500
     or (v_en->>'net_system_delivery_charge')::bigint <> 7500
     or (v_en->>'merchant_final_settlement_amount')::bigint <> 52000 then
    raise exception 'ABORT: South Okkalapa canonical calculation failed: %', v_en;
  end if;
  if (v_mm->>'base_tariff')::bigint <> (v_en->>'base_tariff')::bigint
     or (v_bilingual->>'base_tariff')::bigint <> (v_en->>'base_tariff')::bigint
     or (v_code->>'base_tariff')::bigint <> (v_en->>'base_tariff')::bigint
     or v_mm->>'validation_status' <> 'OK'
     or v_bilingual->>'validation_status' <> 'OK'
     or v_code->>'validation_status' <> 'OK' then
    raise exception 'ABORT: South Okkalapa aliases do not resolve to the same tariff. EN %, MM %, BI %, CODE %', v_en, v_mm, v_bilingual, v_code;
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: mutation mode changed.';
  end if;
end
$south_okkalapa_test$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select
  'FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7',
  'tariff_catalog',
  'be_parcel_tariffs_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03',
    'township_identity_rows',(select count(*) from public.be_township_identity_v61_7),
    'tariff_source','be_parcel_tariffs_v2',
    'south_okkalapa_code','MMR013011',
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false,
    'mutation_mode','MUTATION_SHADOW'
  ),
  now()
where to_regclass('public.be_audit_events') is not null
  and not exists (
    select 1 from public.be_audit_events
    where action='FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7'
      and resource_id='be_parcel_tariffs_v2'
  );

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03',
  'next_gate','INSTALL_BUILD_AND_DEPLOY_TARIFF_WIRING_V61_7_FRONTEND',
  'canonical_tariff_source','be_parcel_tariffs_v2',
  'township_identity_rows',(select count(*) from public.be_township_identity_v61_7),
  'active_tariff_rows',(public.be_tariff_catalog_v61_7()->>'row_count')::integer,
  'active_tariff_townships',(public.be_tariff_catalog_v61_7()->>'township_count')::integer,
  'unresolved_active_tariff_rows',(public.be_tariff_catalog_v61_7()->>'unresolved_tariff_rows')::integer,
  'south_okkalapa_standard_result',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0),
  'english_myanmar_bilingual_code_same_tariff',true,
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false
));
