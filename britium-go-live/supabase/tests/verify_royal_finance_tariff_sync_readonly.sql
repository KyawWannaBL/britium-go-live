-- Read-only Royal finance tariff validation. Run after the reviewed migration.
-- Expected: approved Thantabin obtains one active STANDARD finance tariff
-- at its existing catalog price. Unapproved Than Chauk Pin remains blocked.
with royal as (
  select c.destination_name,c.standard_rate_mmk,
         public.be_approved_tariff_lookup_key(c.destination_name) lookup_key
  from public.be_data_entry_tariff_catalog c
  where c.provider_code='ROYAL EXPRESS' and c.is_active
),
checks as (
  select r.destination_name,r.standard_rate_mmk,r.lookup_key,
         (select count(*) from public.be_parcel_tariffs_v2 t
          where t.customer_tier='STANDARD' and t.status='ACTIVE'
            and t.effective_from<=public.be_business_date()
            and (t.effective_to is null or t.effective_to>=public.be_business_date())
            and public.be_approved_tariff_lookup_key(t.township)=r.lookup_key) active_count,
         (select max(t.base_tariff) from public.be_parcel_tariffs_v2 t
          where t.customer_tier='STANDARD' and t.status='ACTIVE'
            and t.effective_from<=public.be_business_date()
            and (t.effective_to is null or t.effective_to>=public.be_business_date())
            and public.be_approved_tariff_lookup_key(t.township)=r.lookup_key) finance_rate
  from royal r
)
select count(*) as total_royal_destinations,
       count(*) filter(where lookup_key is null) as needs_township_approval,
       count(*) filter(where lookup_key is not null and active_count=0) as missing_active_finance,
       count(*) filter(where lookup_key is not null and active_count>1) as conflicting_finance,
       count(*) filter(where lookup_key is not null and active_count=1 and finance_rate<>standard_rate_mmk) as rate_mismatch
from checks;
-- The pre-existing catalog-only destination is not an authorized alias.
-- Do not assign that destination's Royal rate to a different township.
