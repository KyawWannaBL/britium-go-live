-- User-authorized merchant name/code directory; Phoenixilion explicitly approved as BRV.
create or replace function public.be_resolve_bulk_merchant_name(p_name text)
returns text language sql immutable security invoker set search_path=pg_catalog,public,pg_temp as $resolve$
with directory(name,code) as (values ('2B1 Clothing','TBO'),
('2K Clothing','TKC'),
('3 & 6 Wholesale','TSW'),
('A.T.M GYM','ATM'),
('Alnoor','ALN'),
('APAC','APA'),
('Aurea Brand','AUR'),
('Aung Pyae Sone','APS'),
('Aung Lay/ Aung Group','ALG'),
('Bear Moonlight','BML'),
('Baby Genius','BBG'),
('Baby Kyaw','BBK'),
('Baby World','BBW'),
('BabyTop','BBT'),
('BC လူသုံးကုန်','BCA'),
('BC2','BCT'),
('Best Buy in Rangoon','BBR'),
('Blackpick Fashion','BPF'),
('Britium Gallery','BRG'),
('Billionaire Clothing','BLC'),
('Chi 21 Myanmar','CHI'),
('Chuu May May','CMM'),
('Classix Men Fashion','CMF'),
('CM Hair Product','CMH'),
('Curvy','CUY'),
('Daw Sanda','DSD'),
('DDC BC','DDC'),
('DND','DND'),
('Dressy','DSY'),
('Dressy','DRS'),
('Ei Tone','ETE'),
('EM Fashion','EMF'),
('Food For U','FFY'),
('Giggling Platypus','GPP'),
('GRS Express','GRS'),
('HAIM','HAM'),
('Kan Toe','KTE'),
('Honey Baby & Beauty Store','HBB'),
('Hsu Wai အထည်','HWC'),
('I Mark','IMK'),
('Ingyin San','IGS'),
('July Sis','JLS'),
('KS Cosmetic','KSC'),
('Kyal Sin Fitness','KSF'),
('Khin Lay','KHL'),
('Kyaw Aung','KYA'),
('Lady OS','LOS'),
('Lynxiee''s Little Shop','LXE'),
('Ma Ma Myat','MMM'),
('Ma Myat Lay','MML'),
('MaBel OS','MBO'),
('May Fashion','MAY'),
('May Ya min Myat','YMM'),
('Mini Products for You','MPU'),
('Mee Lay','MEL'),
('Moe Audio','MAU'),
('Moe Hijab Diary','MHD'),
('Mommy Top Choice','MTC'),
('My Heart Cosmetic','MHC'),
('The Gadget Store','GGS'),
('Nay Nay Lay','NNL'),
('NDN','NDN'),
('Nfinity','NFT'),
('Other','OTH'),
('Pack It Best','PIB'),
('ph level 7','PHS'),
('Phyu Sin OS','PSO'),
('Pleasure','PLE'),
('PO Clothing','POC'),
('Poe Poe OS','POE'),
('Poe Poe Lay','PPL'),
('Puffy & Co','PYC'),
('Royal Poe','RYP'),
('PREMIER','PRE'),
('Sheila Collections','SLC'),
('Shwe Sin','SHS'),
('Shwe Yee','SYE'),
('Shu''s Collection','SHC'),
('Singapore Store','SGP'),
('Soul Things','SOU'),
('Su Su Fashion','SSF'),
('Sweety Fashion','STF'),
('Sweety Pie','STP'),
('Thazin OS','TOS'),
('Twin Soul Collection','TSC'),
('Tone X','TEX'),
('U Lay Moy','ULM'),
('Unique/Diva','UQD'),
('WahLah','WLH'),
('Yadanar Clothing','YDC'),
('Zar အထည်','ZAR'),
('Z Square','ZSQ'),
('Xing Nora','XNR'),
('ကိန္နရီ','KNY'),
('ကိုကျော် အထည်','KKK'),
('ခင့်အလှူ','KAL'),
('မေသော်တာမြင့်','MTM'),
('မေသျှား','SHA'),
('ကောင်းစံ','KAS'),
('ကံ့ကော်မေ','KKM'),
('စကားဝါ','SKW'),
('ဆောင်းသဇင်','STZ'),
('နတ်ပြည်မွှေး','NPM'),
('နန်းထိုက်တန်','NHT'),
('နွယ် Fashion','NFS'),
('နေပြည်တော် ရုံးခွဲ','NPT'),
('ပန်းသရဖီ','PTP'),
('ပီတိစာပေ','PTB'),
('ပုရစ်ကလေး','PYT'),
('မန္တလေး ရုံးခွဲ','MDY'),
('မိတ်ကောင်းမွန်','MKM'),
('မြန်မာ့အလှ','MMA'),
('ရွှေမဟာ','SMH'),
('ရွှေအိမ့်','SEN'),
('လှမေတ္တာရှင်','HMS'),
('ဝင့်ဝါသဇင်','WTZ'),
('သင်္ဃန်းကျွန်း ရုံးခွဲ','TGK'),
('ချစ်သွန်းသီရိ မေမေ','CTM'),
('The Pretty Supply','TPS'),
('မရွှေအိ','MSE'),
('မစိမ်းစိမ်း','MSS'),
('အေးချမ်းအောင်မြင်','ACA'),
('ငွေစင်သွန်း','NZT'),
('ဇာခြည်သန်း','ZCT'),
('Jessica Sue','JSC'),
('စက်ရုံတိုက်ရိုက်','SDW'),
('Britium Ventures','BRV'),
('ကျော်စိုးဟိန်း','KSH'),
('Golden Gate  Condo','GGC'),
('PS Hnin Htet','PSH'),
('ရှင်မင်း','SHM'),
('ရှု့မဝ','SMW'),
('ယွန်းထက်','YOH'),
('NEW MERCHANT 6','NM6'),
('NEW MERCHANT 7','NM7'),
('NEW MERCHANT 8','NM8'),
('NEW MERCHANT 9','NM9'),
('Phoenixilion','BRV')),
matches as (select code from directory where lower(btrim(name))=lower(btrim(p_name)))
select case when count(distinct code)=1 then max(code) else null end from matches;
$resolve$;
revoke all on function public.be_resolve_bulk_merchant_name(text) from public;
grant execute on function public.be_resolve_bulk_merchant_name(text) to authenticated,service_role;
do $patch$
declare d text; start_at integer; end_at integer;
begin
select pg_get_functiondef('public.be_data_entry_financial_v2_calculate(jsonb)'::regprocedure) into d;
start_at:=strpos(d,'  -- Resolve only an exact, unique active master match.');
end_at:=strpos(d,'  v_result := public.be_data_entry_financial_v2_calculate_v21_legacy(v_payload);');
if start_at=0 or end_at<=start_at then raise exception 'Unexpected calculator definition'; end if;
d:=left(d,start_at-1)||$replacement$
  if v_merchant='BLK' then
    v_merchant:=public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name');
    if v_merchant is null then
      return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('code','CONSOLIDATED_SOURCE_MERCHANT_REQUIRED','field','source_merchant_name','message','Original merchant "'||coalesce(v_payload->>'source_merchant_name','')||'" needs a unique approved name/code mapping.')));
    end if;
    v_payload:=v_payload||jsonb_build_object('merchant_id',v_merchant,'container_merchant_code','BLK');
  end if;
$replacement$||substring(d from end_at);
execute d;
select pg_get_functiondef('public.be_data_entry_financial_v2_save(jsonb)'::regprocedure) into d;
if strpos(d,'  v_access := public.be_data_entry_require_access_v57(''create'',false);')=0 then raise exception 'Unexpected save definition'; end if;
d:=replace(d,'  v_access := public.be_data_entry_require_access_v57(''create'',false);',
$save$
  v_access := public.be_data_entry_require_access_v57('create',false);
  if upper(btrim(coalesce(v_payload->>'merchant_id','')))='BLK' then
    if public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name') is null then
      return jsonb_build_object('ok',false,'persisted',false,'errors',jsonb_build_array(jsonb_build_object('code','CONSOLIDATED_SOURCE_MERCHANT_REQUIRED','message','Original merchant needs a unique approved name/code mapping.')));
    end if;
    v_payload:=v_payload||jsonb_build_object('merchant_id',public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name'),'container_merchant_code','BLK');
  end if;
$save$);
execute d;
end $patch$;