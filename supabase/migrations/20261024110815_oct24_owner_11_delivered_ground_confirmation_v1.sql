create table if not exists private.be_oct24_owner_11_delivery_confirmation_v1(
 delivery_way_id text primary key, recipient_name text, merchant_name text,
 delivery_outcome text not null default 'OWNER_CONFIRMED_DELIVERED',
 payment_instruction text not null,
 destination_note text, vehicle_plate text,
 ground_amount_mmk numeric,
 test_finance_status text not null default 'OWNER_ATTESTED_HYBRID_NON_POSTING',
 confirmed_at timestamptz not null default now(),
 attestation text not null default 'OWNER_SUPERADMIN_GROUND_CONFIRMATION_2026_10_24'
);
alter table private.be_oct24_owner_11_delivery_confirmation_v1 enable row level security;
revoke all on private.be_oct24_owner_11_delivery_confirmation_v1 from public,anon,authenticated;