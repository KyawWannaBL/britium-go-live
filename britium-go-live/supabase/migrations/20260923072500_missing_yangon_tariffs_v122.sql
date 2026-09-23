-- V122: reconcile approved Yangon township tariffs used by Financial V2.
-- Source of truth: britium_tariff_current_master active/Ready rows.
-- Adds only missing STANDARD rows and the slash-less Seikgyikanaungto alias.

insert into public.be_tariff_location_alias_v61_7_1 (
  normalized_alias,
  alias_value,
  location_key,
  township_code,
  location_kind,
  canonical_label,
  created_at,
  updated_at
)
values (
  public.be_financial_v2_normalize_township_text_v61_7('ဆိပ်ကြီးခနောင်တို'),
  'ဆိပ်ကြီးခနောင်တို',
  'MMR013031',
  'MMR013031',
  'TOWNSHIP',
  'Seikgyikanaungto / ဆိပ်ကြီး/ခနောင်တို',
  now(),
  now()
)
on conflict (normalized_alias) do update set
  alias_value=excluded.alias_value,
  location_key=excluded.location_key,
  township_code=excluded.township_code,
  location_kind=excluded.location_kind,
  canonical_label=excluded.canonical_label,
  updated_at=now();

insert into public.be_parcel_tariffs_v2 (
  id,
  township,
  customer_tier,
  tariff_zone,
  tariff_zone_code,
  base_tariff,
  included_kg,
  extra_per_kg,
  commitment_min_ways,
  commitment_refund_per_way,
  note,
  status,
  effective_from,
  effective_to,
  created_at,
  updated_at
)
select
  nextval('public.be_parcel_tariffs_v2_id_seq'),
  x.township,
  'STANDARD',
  'YANGON',
  'YANGON',
  4000,
  3.000,
  500,
  0,
  0,
  'V122 reconciliation from active Ready britium_tariff_current_master row; Standard tier mirrors current Yangon Standard tariff policy.',
  'ACTIVE',
  public.be_business_date(),
  null,
  now(),
  now()
from (values
  ('Thanlyin'),
  ('Seikgyikanaungto')
) as x(township)
where not exists (
  select 1
  from public.be_parcel_tariffs_v2 t
  where public.be_approved_tariff_lookup_key(t.township)=public.be_approved_tariff_lookup_key(x.township)
    and t.customer_tier='STANDARD'
    and t.status='ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date())
);

do $verify$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from (values ('Thanlyin'),('Seikgyikanaungto'),('ဆိပ်ကြီးခနောင်တို')) x(label)
  where public.be_approved_tariff_lookup_key(x.label) is null
     or not exists (
       select 1
       from public.be_parcel_tariffs_v2 t
       where public.be_approved_tariff_lookup_key(t.township)=public.be_approved_tariff_lookup_key(x.label)
         and t.customer_tier='STANDARD'
         and t.status='ACTIVE'
         and t.effective_from <= public.be_business_date()
         and (t.effective_to is null or t.effective_to >= public.be_business_date())
     );
  if v_bad<>0 then
    raise exception 'V122 verification failed for % approved Yangon tariff labels',v_bad;
  end if;
end
$verify$;
