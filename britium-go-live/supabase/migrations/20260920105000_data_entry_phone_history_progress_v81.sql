-- V81: Data Entry historical phone autofill.
-- Returns the latest normalized registrations matching a receiver/contact phone.
create or replace function public.be_data_entry_phone_history_v81(
  p_phone text,
  p_limit integer default 3
)
returns table (
  history_rank integer,
  recipient_name text,
  recipient_phone text,
  secondary_phone text,
  township text,
  city text,
  region_state text,
  recipient_address text,
  merchant_id text,
  delivery_way_id text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  with input as (
    select regexp_replace(coalesce(p_phone,''), '\D', '', 'g') as normalized
  ),
  matches as (
    select
      d.recipient_name,
      d.contact_no_1,
      d.contact_no_2,
      d.township,
      d.city,
      d.region_state,
      d.recipient_address,
      d.merchant_id,
      d.delivery_way_id,
      d.saved_at,
      row_number() over (
        order by d.saved_at desc nulls last, d.updated_at desc nulls last, d.created_at desc nulls last
      )::integer as history_rank
    from public.be_data_entry_parcel_details d
    cross join input i
    where length(i.normalized) >= 6
      and (
        regexp_replace(coalesce(d.contact_no_1,''), '\D', '', 'g') = i.normalized
        or regexp_replace(coalesce(d.contact_no_2,''), '\D', '', 'g') = i.normalized
      )
  )
  select
    m.history_rank,
    m.recipient_name,
    coalesce(nullif(m.contact_no_1,''), nullif(m.contact_no_2,''), p_phone),
    m.contact_no_2,
    m.township,
    m.city,
    m.region_state,
    m.recipient_address,
    m.merchant_id,
    m.delivery_way_id,
    m.saved_at
  from matches m
  order by m.history_rank
  limit greatest(1,least(coalesce(p_limit,3),10));
$function$;

revoke all on function public.be_data_entry_phone_history_v81(text,integer) from public;
grant execute on function public.be_data_entry_phone_history_v81(text,integer) to authenticated;
