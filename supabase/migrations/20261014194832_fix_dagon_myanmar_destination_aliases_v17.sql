CREATE OR REPLACE FUNCTION public.be_data_entry_destination_key_v17(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select regexp_replace(
      replace(replace(replace(replace(replace(replace(
        regexp_replace(lower(btrim(coalesce(p_value,''))),'(royal[[:space:]]*express|royal|dk[[:space:]]*delivery|npt[[:space:]]*branch|grs)','','g'),
        'မြို့နယ်',''),'မြို့',''),'တိုင်းဒေသကြီး',''),'ပြည်ထောင်စုနယ်မြေ',''),'township',''),'city',''),
      '[[:space:]()（）.,၊။/|·_-]+','','g') as destination_key
  )
  select case destination_key
    when 'northdagon' then 'မြောက်ဒဂုံ'
    when 'dagonmyothitnorth' then 'မြောက်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်မြောက်ပိုင်း' then 'မြောက်ဒဂုံ'
    when 'ဒဂုံသစ်မြောက်ပိုင်း' then 'မြောက်ဒဂုံ'
    when 'southdagon' then 'တောင်ဒဂုံ'
    when 'dagonmyothitsouth' then 'တောင်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်တောင်ပိုင်း' then 'တောင်ဒဂုံ'
    when 'ဒဂုံသစ်တောင်ပိုင်း' then 'တောင်ဒဂုံ'
    when 'eastdagon' then 'အရှေ့ဒဂုံ'
    when 'dagonmyothiteast' then 'အရှေ့ဒဂုံ'
    when 'ဒဂုံမြို့သစ်အရှေ့ပိုင်း' then 'အရှေ့ဒဂုံ'
    when 'ဒဂုံသစ်အရှေ့ပိုင်း' then 'အရှေ့ဒဂုံ'
    when 'dagonseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'dagonmyothitseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'ဒဂုံမြို့သစ်ဆိပ်ကမ်း' then 'ဒဂုံဆိပ်ကမ်း'
    when 'hlaingtharya' then 'လှိုင်သာယာ'
    when 'hlaingtharyar' then 'လှိုင်သာယာ'
    when 'hlaingthaya' then 'လှိုင်သာယာ'
    when 'hlaingthayar' then 'လှိုင်သာယာ'
    when 'hlaingtharyaeast' then 'လှိုင်သာယာ'
    when 'hlaingtharyawest' then 'လှိုင်သာယာ'
    when 'hlaingtharyareast' then 'လှိုင်သာယာ'
    when 'hlaingtharyarwest' then 'လှိုင်သာယာ'
    when 'hlaingthayaeast' then 'လှိုင်သာယာ'
    when 'hlaingthayawest' then 'လှိုင်သာယာ'
    when 'hlaingthayareast' then 'လှိုင်သာယာ'
    when 'hlaingthayarwest' then 'လှိုင်သာယာ'
    when 'kyimyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyimyindine' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindine' then 'ကြည့်မြင်တိုင်'
    when 'mingalataungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'mingalartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'minglartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    else destination_key
  end from normalized;
$function$
