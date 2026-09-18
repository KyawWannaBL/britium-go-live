begin;

create table if not exists public.be_workforce_status_history (
 id uuid primary key default gen_random_uuid(),
 workforce_type text not null,
 workforce_id text not null,
 old_status text,
 new_status text not null,
 effective_date timestamptz not null default now(),
 reason text,
 changed_by uuid,
 created_at timestamptz not null default now()
);

create table if not exists public.be_workforce_audit_logs (
 id uuid primary key default gen_random_uuid(),
 workforce_type text not null,
 workforce_id text not null,
 field_name text not null,
 old_value text,
 new_value text,
 reason text,
 changed_by uuid,
 created_at timestamptz not null default now()
);

create table if not exists public.be_workforce_branch_transfers (
 id uuid primary key default gen_random_uuid(),
 workforce_type text not null,
 workforce_id text not null,
 from_branch text,
 to_branch text not null,
 status text not null default 'PENDING',
 effective_date timestamptz,
 requested_by uuid,
 approved_by uuid,
 created_at timestamptz not null default now()
);

create or replace view public.be_active_workforce_view as
select
 rider_id as workforce_id,
 rider_code as workforce_code,
 rider_name as workforce_name,
 'RIDER'::text as workforce_type,
 branch_code,
 employment_type,
 status
from public.be_master_riders
where lower(status)='active'
union all
select
 helper_id,
 helper_code,
 helper_name,
 'HELPER'::text,
 branch_code,
 employment_type,
 status
from public.be_master_helpers
where lower(status)='active'
union all
select
 driver_id,
 driver_code,
 driver_name,
 'DRIVER'::text,
 branch_code,
 null::text,
 status
from public.be_master_drivers
where lower(status)='active';

create index if not exists idx_workforce_status_history_lookup
on public.be_workforce_status_history(workforce_type, workforce_id, created_at desc);

create index if not exists idx_workforce_audit_lookup
on public.be_workforce_audit_logs(workforce_type, workforce_id, created_at desc);

create index if not exists idx_workforce_transfer_lookup
on public.be_workforce_branch_transfers(workforce_type, workforce_id, created_at desc);

commit;
