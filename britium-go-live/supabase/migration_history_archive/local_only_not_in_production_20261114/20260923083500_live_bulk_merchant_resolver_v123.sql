-- V123: consolidated BBB/BLK merchant resolution must follow the live merchant master.
-- Historical source Way IDs remain preserved separately and are not regenerated from current merchant codes.

create or replace function public.be_resolve_bulk_merchant_name(p_name text)
returns text
language sql
stable
set search_path to 'pg_catalog','public','pg_temp'
as $function$
with candidates as (
  select distinct upper(btrim(m.merchant_code)) as code
  from public.be_merchant_master m
  where nullif(btrim(m.merchant_code),'') is not null
    and (
      lower(btrim(m.merchant_name)) = lower(btrim(coalesce(p_name,'')))
      or upper(btrim(m.merchant_code)) = upper(btrim(coalesce(p_name,'')))
    )
),
resolved as (
  select count(distinct code) as code_count, max(code) as code
  from candidates
)
select case when code_count=1 then code else null end
from resolved;
$function$;

comment on function public.be_resolve_bulk_merchant_name(text)
is 'V123: resolve consolidated source merchant names/codes from live be_merchant_master; returns null when no unique approved mapping exists.';
