-- Customer Service schema-cache compatibility fix.
-- Fixes: Could not find the table 'public.cs_pickup_requests' in the schema cache
-- Safe to run repeatedly. Does not insert mock/sample pickup rows.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
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
  add column if not exists updated_at timestamptz default now();

-- Old frontend builds may still query public.cs_pickup_requests.
-- Create a compatibility view only if that relation does not already exist.
do $$
begin
  if to_regclass('public.cs_pickup_requests') is null then
    execute 'create view public.cs_pickup_requests as select * from public.be_portal_pickup_requests';
  end if;
end $$;

create index if not exists idx_be_portal_pickup_requests_created_at
on public.be_portal_pickup_requests (created_at desc);

create index if not exists idx_be_portal_pickup_requests_pickup_id
on public.be_portal_pickup_requests (pickup_id);

create index if not exists idx_be_portal_pickup_requests_merchant_code
on public.be_portal_pickup_requests (merchant_code);

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests
    order by created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) p;
$$;

alter table public.be_portal_pickup_requests enable row level security;

drop policy if exists be_portal_pickup_requests_select_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_insert_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_update_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_delete_auth on public.be_portal_pickup_requests;

create policy be_portal_pickup_requests_select_auth
on public.be_portal_pickup_requests for select to authenticated using (true);

create policy be_portal_pickup_requests_insert_auth
on public.be_portal_pickup_requests for insert to authenticated with check (true);

create policy be_portal_pickup_requests_update_auth
on public.be_portal_pickup_requests for update to authenticated using (true) with check (true);

create policy be_portal_pickup_requests_delete_auth
on public.be_portal_pickup_requests for delete to authenticated using (true);

grant select, insert, update, delete on public.be_portal_pickup_requests to authenticated;
grant execute on function public.be_customer_service_pickup_requests(integer) to authenticated;

do $$
begin
  if to_regclass('public.cs_pickup_requests') is not null then
    execute 'grant select on public.cs_pickup_requests to authenticated';
  end if;
end $$;

-- Ask PostgREST/Supabase API to refresh its schema cache.
notify pgrst, 'reload schema';

-- Verification:
select
  'be_portal_pickup_requests' as object_name,
  to_regclass('public.be_portal_pickup_requests') is not null as exists
union all
select
  'cs_pickup_requests',
  to_regclass('public.cs_pickup_requests') is not null;
