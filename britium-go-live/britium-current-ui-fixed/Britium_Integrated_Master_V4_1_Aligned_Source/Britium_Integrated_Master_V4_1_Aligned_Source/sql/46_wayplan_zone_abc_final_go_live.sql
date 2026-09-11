create extension if not exists pgcrypto;

create table if not exists public.be_wayplan_zone_resources (
  route_code text primary key,
  route_label text not null,
  resource_type text not null,
  zone_name text,
  branch_node text,
  is_active boolean default true,
  sort_order integer default 100,
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_zone_rules (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_normalized text not null,
  route_code text not null references public.be_wayplan_zone_resources(route_code),
  is_active boolean default true,
  priority integer default 100,
  updated_at timestamptz default now()
);

create unique index if not exists idx_be_wayplan_zone_rules_alias
on public.be_wayplan_zone_rules(alias_normalized);

insert into public.be_wayplan_zone_resources(route_code, route_label, resource_type, zone_name, branch_node, sort_order) values
('AHLONE','Ahlone Branch Rider','RIDER_POOL','Downtown Core','AHLONE',10),
('HQRIDERS','HQ Rider Pool','RIDER_POOL','Eastern Cluster','HO',20),
('VAN1','Van 1 (Delivery) - Zone A / North-East Corridor','DELIVERY_VAN','Zone A','HO',30),
('VAN2','Van 2 (Delivery) - Zone B / North-West Industrial','DELIVERY_VAN','Zone B','HO',40),
('VAN3','Van 3 (Delivery) - Zone C / Northern Outer Rim','DELIVERY_VAN','Zone C','HO',50),
('VAN4','Van 4 (Pickup & Aung Mingalar Highway)','PICKUP_VAN','Aung Mingalar Highway','HO',60),
('VAN5','Van 5 (Pickup & Hlaing Thar Yar Highway)','PICKUP_VAN','Dagon Ayar / Hlaing Thar Yar Highway','HO',70),
('OUT_OF_SERVICE','OUT_OF_SERVICE / Supervisor Review','SUPERVISOR_REVIEW','Supervisor Review','HO',999)
on conflict(route_code) do update set
route_label=excluded.route_label, resource_type=excluded.resource_type, zone_name=excluded.zone_name,
branch_node=excluded.branch_node, sort_order=excluded.sort_order, is_active=true, updated_at=now();

create or replace function public.be_wayplan_norm(p_text text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(p_text, ''), '\s+', '', 'g'));
$$;

create or replace function public.be_wayplan_seed_rule(p_alias text, p_route_code text, p_priority integer default 100)
returns void language plpgsql as $$
begin
  insert into public.be_wayplan_zone_rules(alias, alias_normalized, route_code, priority, is_active, updated_at)
  values(p_alias, public.be_wayplan_norm(p_alias), p_route_code, p_priority, true, now())
  on conflict(alias_normalized) do update set
    alias=excluded.alias, route_code=excluded.route_code, priority=excluded.priority, is_active=true, updated_at=now();
end;
$$;

select public.be_wayplan_seed_rule(x,'AHLONE',10) from unnest(array[
'ကျောက်တံတား','kyauktada','kyauktadar','ပန်းဘဲတန်း','pabedan','လမ်းမတော်','lanmadaw','လသာ','latha','ဒဂုံ','dagon',
'ဗိုလ်တထောင်','botahtaung','botataung','မင်္ဂလာတောင်ညွန့်','mingalataungnyunt','mingalartaungnyunt','အလုံ','ahlone','ahlon',
'စမ်းချောင်း','sanchaung','ဆိပ်ကမ်း','seikkan','တာမွေ','tamwe','tarmwe','ကြည့်မြင်တိုင်','kyimyindaing','kyeemyindaing','ပုဇွန်တောင်','pazundaung'
]) x;

select public.be_wayplan_seed_rule(x,'HQRIDERS',20) from unnest(array[
'မြောက်ဥက္ကလာပ','northokkalapa','nokkalapa','တောင်ဥက္ကလာပ','southokkalapa','sokkalapa','ရန်ကင်း','yankin','သင်္ဃန်းကျွန်း','thingangyun',
'တောင်ဒဂုံ','southdagon','sdagon','မြောက်ဒဂုံ','northdagon','ndagon','အရှေ့ဒဂုံ','eastdagon','edagon','ဒဂုံဆိပ်ကမ်း','dagonseikkan','dagonseikan'
]) x;

select public.be_wayplan_seed_rule(x,'VAN1',30) from unnest(array['မရမ်းကုန်း','mayangone','mayangon','မင်္ဂလာဒုံ','mingaladon','mingalardon']) x;
select public.be_wayplan_seed_rule(x,'VAN2',40) from unnest(array['လှိုင်','hlaing','လှိုင်သာယာ','hlaingtharyar','hlaingthaya']) x;
select public.be_wayplan_seed_rule(x,'VAN3',50) from unnest(array['အင်းစိန်','insein','ရွှေပြည်သာ','shwepyitha','shwepyithar']) x;

create or replace function public.be_wayplan_determine_route(p_township text, p_address text default '', p_is_highway boolean default null)
returns jsonb language plpgsql stable as $$
declare
  t text := public.be_wayplan_norm(p_township);
  a text := public.be_wayplan_norm(p_address);
  r public.be_wayplan_zone_resources%rowtype;
  code text;
  hw boolean := coalesce(p_is_highway, false);
begin
  if not hw then
    hw := t like '%ဒဂုံဧရာ%' or a like '%ဒဂုံဧရာ%' or t like '%လှိုင်သာယာအဝေးပြေး%' or a like '%လှိုင်သာယာအဝေးပြေး%'
       or t like '%အောင်မင်္ဂလာ%' or a like '%အောင်မင်္ဂလာ%' or t like '%aungmingalar%' or a like '%aungmingalar%'
       or t like '%dagonayar%' or a like '%dagonayar%' or t like '%highway%' or a like '%highway%';
  end if;

  if hw then
    code := case when t like '%ဒဂုံဧရာ%' or a like '%ဒဂုံဧရာ%' or t like '%လှိုင်သာယာအဝေးပြေး%' or a like '%လှိုင်သာယာအဝေးပြေး%' or t like '%dagonayar%' or a like '%dagonayar%' then 'VAN5' else 'VAN4' end;
  else
    select route_code into code from public.be_wayplan_zone_rules where alias_normalized=t and is_active=true order by priority limit 1;
    code := coalesce(code, 'OUT_OF_SERVICE');
  end if;

  select * into r from public.be_wayplan_zone_resources where route_code=code;
  return jsonb_build_object('route_code', r.route_code, 'route_label', r.route_label, 'resource_type', r.resource_type, 'zone_name', r.zone_name, 'is_highway', hw);
end;
$$;

select public.be_wayplan_determine_route('Mayangone','',false);
select public.be_wayplan_determine_route('Hlaing Tharyar','',false);
select public.be_wayplan_determine_route('Insein','',false);
select public.be_wayplan_determine_route('North Dagon','',false);
select public.be_wayplan_determine_route('Latha','',false);
select public.be_wayplan_determine_route('', 'Dagon Ayar highway station', true);
select public.be_wayplan_determine_route('', 'Aung Mingalar highway station', true);
