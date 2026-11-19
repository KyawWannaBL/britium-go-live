-- Candidate only. Do NOT execute on production until UAT schema replay and review pass.
-- Provider handover locations must be physically verified and explicitly linked.
-- No implicit Royal Express site and no fabricated latitude/longitude.
create table if not exists public.be_provider_handover_sites_v1 (
  provider_code text not null references public.be_data_entry_service_providers(provider_code),
  origin_branch_code text not null,
  location_code text not null references public.be_wayplan_service_locations(location_code),
  active boolean not null default false,
  verified_at timestamptz,
  verified_by uuid,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_code,origin_branch_code,location_code),
  constraint be_provider_handover_verified_active
    check (not active or (verified_at is not null and verified_by is not null
      and length(btrim(coalesce(verification_note,''))) >= 8))
);
alter table public.be_provider_handover_sites_v1 enable row level security;
revoke all on table public.be_provider_handover_sites_v1 from public, anon, authenticated;
-- No policies by default: only trusted server-side, reviewed procedures may access.
-- Operational users must not insert arbitrary coordinates, toggle active rows, or
-- forge a provider handover to bypass custody verification.
--
-- Preparation for route planning:
-- JOIN active provider site to be_wayplan_service_locations with s.active=true,
-- latitude between 9 and 29, longitude between 92 and 102;
-- branch must match the authorized origin branch;
-- do not use the recipient's remote location as a local handover stop.
--
-- Sites are intentionally NOT seeded. Royal, DK and terminal handover sites
-- require an Operations-approved location before any transfer Wayplan can be created.
