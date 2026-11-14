create table if not exists public.be_parcel_provider_overrides_v1 (
  delivery_way_id text primary key,
  automatic_provider_code text not null,
  override_provider_code text not null references public.be_data_entry_service_providers(provider_code),
  override_reason text not null check (length(btrim(override_reason)) >= 12),
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  revision integer not null default 1
);
create table if not exists public.be_parcel_provider_override_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  previous_provider_code text,
  new_provider_code text not null,
  reason text not null,
  actor_id uuid not null,
  changed_at timestamptz not null default now()
);
alter table public.be_parcel_provider_overrides_v1 enable row level security;
alter table public.be_parcel_provider_override_audit_v1 enable row level security;
revoke all on public.be_parcel_provider_overrides_v1,public.be_parcel_provider_override_audit_v1 from anon,authenticated;
