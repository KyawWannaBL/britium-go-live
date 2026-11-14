
create table if not exists private.be_oct24_skf_pending_owner_attestation_v1(
 delivery_way_id text primary key,
 merchant_name text not null default 'Tsukki Fashion',
 recipient_name text not null,
 recipient_phone text,
 ground_destination text,
 ground_address text,
 item_price_mmk numeric not null,
 delivery_fee_mmk numeric not null,
 expected_cod_plus_fee_mmk numeric not null,
 driver_name text,
 rider_or_helper_name text,
 vehicle_plate text,
 ground_delivery_status text not null default 'PENDING_NOT_DELIVERED' check(ground_delivery_status='PENDING_NOT_DELIVERED'),
 original_exception text,
 planned_retry_date date,
 confirmation_basis text not null default 'OWNER_GROUND_REPORT_2026_10_24',
 received_cod_confirmed boolean not null default false,
 actual_settlement_allowed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint skf_ground_amount_consistency check(expected_cod_plus_fee_mmk=item_price_mmk+delivery_fee_mmk)
);
alter table private.be_oct24_skf_pending_owner_attestation_v1 enable row level security;
revoke all on private.be_oct24_skf_pending_owner_attestation_v1 from public,anon,authenticated;
