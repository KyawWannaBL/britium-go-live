begin;

create or replace function public.be_finance_cod_policy_v2(
  p_payment_type text,
  p_cod_amount numeric,
  p_parcel_count integer default 1
)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_raw text := btrim(coalesce(p_payment_type,''));
  v_type text := upper(replace(replace(v_raw,' ','_'),'-','_'));
  v_amount numeric := greatest(coalesce(p_cod_amount,0),0);
  v_parcels integer := greatest(coalesce(p_parcel_count,1),1);
  v_rate numeric := 0;
  v_fee numeric := 0;
  v_status text;
  v_applies boolean;
begin
  if v_type='KBZPAY' then v_type:='KBZ_PAY'; end if;
  if v_type='BANK' then v_type:='BANK_TRANSFER'; end if;
  if v_type in ('','POD','PAY_ON_DELIVERY') then v_type:='COD'; end if;

  v_applies := v_type in (
    'COD','CASH_ADVANCE_ON','CASH_ADVANCE_OFF','CASH_ADVANCE','PAY_ON_DELIVERY'
  );

  if not v_applies then
    return jsonb_build_object(
      'payment_type',coalesce(nullif(v_raw,''),v_type),
      'normalized_payment_type',v_type,
      'cod_requested',false,'eligible',true,
      'cod_policy_status','NOT_APPLICABLE',
      'finance_status','NOT_REQUIRED','finance_required',false,
      'cod_amount',v_amount,'parcel_count',v_parcels,
      'fee_rate',0,'fee_amount',0,
      'policy_version','COD_FEE_2026_09_30'
    );
  end if;

  if v_amount <= 100000 then
    v_status := 'COD_FEE_FREE_0_TO_100000';
  elsif v_amount <= 300000 then
    v_status := 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000';
    v_fee := 200 * v_parcels;
  else
    v_status := 'COD_FEE_0_2_PERCENT_ABOVE_300000';
    v_rate := 0.002;
    v_fee := round(v_amount * v_rate,0);
  end if;

  return jsonb_build_object(
    'payment_type',coalesce(nullif(v_raw,''),v_type),
    'normalized_payment_type',v_type,
    'cod_requested',true,'eligible',true,
    'cod_policy_status',v_status,
    'finance_status','AUTO_APPROVED','finance_required',false,
    'cod_amount',v_amount,'parcel_count',v_parcels,
    'fee_rate',v_rate,'fee_amount',v_fee,
    'policy_version','COD_FEE_2026_09_30'
  );
end;
$$;

create or replace function public.be_finance_cod_policy_v1(
  p_payment_type text,
  p_item_value numeric,
  p_delivery_region text
)
returns jsonb
language sql
immutable
set search_path=public,pg_temp
as $$
  select public.be_finance_cod_policy_v2(p_payment_type,p_item_value,1)
         || jsonb_build_object('delivery_region',coalesce(p_delivery_region,''));
$$;

create or replace function public.be_pickup_cod_policy_sync_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_type text := coalesce(
    nullif(btrim(new.payment_type),''),
    nullif(btrim(new.payment_method),''),
    nullif(btrim(new.payment_terms),''),
    'COD'
  );
  v_value numeric := greatest(
    coalesce(new.total_cod,0),coalesce(new.cod_amount,0),
    coalesce(new.declared_item_value,0),
    coalesce(nullif(new.metadata->>'declared_item_value','')::numeric,0),0
  );
  v_parcels integer := greatest(coalesce(new.parcel_count,new.expected_parcels,1),1);
  v_policy jsonb;
begin
  v_policy := public.be_finance_cod_policy_v2(v_type,v_value,v_parcels);
  new.cod_policy_status := coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED');
  new.cod_service_fee_rate := coalesce((v_policy->>'fee_rate')::numeric,0);
  new.cod_service_fee_amount := coalesce((v_policy->>'fee_amount')::numeric,0);
  new.finance_pre_dispatch_status := coalesce(v_policy->>'finance_status','NOT_REQUIRED');
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('cod_fee_policy',v_policy);
  return new;
end;
$$;

alter table public.be_data_entry_parcel_details
  add column if not exists cod_service_fee_rate numeric not null default 0,
  add column if not exists cod_service_fee_amount numeric not null default 0,
  add column if not exists cod_fee_policy_status text not null default 'NOT_EVALUATED';

create or replace function public.be_parcel_cod_service_fee_sync_v1()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_cod numeric := greatest(coalesce(new.actual_collect,0),coalesce(new.cod_amount,0),0);
  v_policy jsonb;
begin
  v_policy := public.be_finance_cod_policy_v2('COD',v_cod,1);
  new.cod_service_fee_rate := coalesce((v_policy->>'fee_rate')::numeric,0);
  new.cod_service_fee_amount := coalesce((v_policy->>'fee_amount')::numeric,0);
  new.cod_fee_policy_status := coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED');
  return new;
end;
$$;

drop trigger if exists trg_be_parcel_cod_service_fee_sync_v1 on public.be_data_entry_parcel_details;
create trigger trg_be_parcel_cod_service_fee_sync_v1
before insert or update of actual_collect,cod_amount
on public.be_data_entry_parcel_details
for each row execute function public.be_parcel_cod_service_fee_sync_v1();

alter table public.be_portal_pickup_requests
  add column if not exists pickup_service_fee_amount numeric not null default 0,
  add column if not exists pickup_same_day_eligible boolean not null default false,
  add column if not exists pickup_cutoff_status text not null default 'NOT_EVALUATED',
  add column if not exists pickup_policy_version text not null default 'PICKUP_2026_09_30';

create or replace function public.be_pickup_service_policy_v1(
  p_pickup_township text,
  p_parcel_count integer,
  p_requested_at timestamptz,
  p_pickup_date date
)
returns jsonb
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_township text := lower(btrim(coalesce(p_pickup_township,'')));
  v_count integer := greatest(coalesce(p_parcel_count,1),1);
  v_local_ts timestamp := coalesce(p_requested_at,now()) at time zone 'Asia/Yangon';
  v_local_date date := v_local_ts::date;
  v_local_time time := v_local_ts::time;
  v_pickup_date date := coalesce(p_pickup_date,v_local_date);
  v_special boolean := (
    v_township like '%east dagon%' or v_township like '%north dagon%'
    or v_township like '%ဒဂုံမြို့သစ်အရှေ့ပိုင်း%'
    or v_township like '%ဒဂုံမြို့သစ်မြောက်ပိုင်း%'
    or v_township like '%အရှေ့ဒဂုံ%' or v_township like '%မြောက်ဒဂုံ%'
  );
  v_fee numeric;
  v_same_day boolean;
  v_cutoff text;
begin
  v_fee := case when v_special or v_count>=3 then 0 else 1500 end;

  if v_pickup_date > v_local_date then
    v_same_day := false; v_cutoff := 'SCHEDULED_FUTURE';
  elsif v_pickup_date < v_local_date then
    v_same_day := false; v_cutoff := 'PAST_DATE_REVIEW_REQUIRED';
  elsif v_local_time < time '13:00' then
    v_same_day := true; v_cutoff := 'SAME_DAY_ELIGIBLE_BEFORE_13_00';
  else
    v_same_day := false; v_cutoff := 'NEXT_DAY_REQUIRED_AFTER_13_00';
  end if;

  return jsonb_build_object(
    'pickup_township',coalesce(p_pickup_township,''),
    'parcel_count',v_count,'pickup_fee_amount',v_fee,
    'same_day_eligible',v_same_day,'cutoff_status',v_cutoff,
    'cutoff_local_time','13:00','timezone','Asia/Yangon',
    'item_list_required',true,'voucher_photo_required',true,
    'advance_viber_submission_required',true,'viber','09-897447744',
    'policy_version','PICKUP_2026_09_30'
  );
end;
$$;

create or replace function public.be_pickup_service_policy_sync_v1()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_policy jsonb;
begin
  v_policy := public.be_pickup_service_policy_v1(
    coalesce(nullif(new.pickup_township,''),nullif(new.township,'')),
    greatest(coalesce(new.parcel_count,new.expected_parcels,1),1),
    coalesce(new.created_at,now()),
    new.pickup_date
  );
  new.pickup_service_fee_amount := coalesce((v_policy->>'pickup_fee_amount')::numeric,0);
  new.pickup_same_day_eligible := coalesce((v_policy->>'same_day_eligible')::boolean,false);
  new.pickup_cutoff_status := coalesce(v_policy->>'cutoff_status','NOT_EVALUATED');
  new.pickup_policy_version := coalesce(v_policy->>'policy_version','PICKUP_2026_09_30');
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('pickup_service_policy',v_policy);
  return new;
end;
$$;

drop trigger if exists trg_be_pickup_service_policy_sync_v1 on public.be_portal_pickup_requests;
create trigger trg_be_pickup_service_policy_sync_v1
before insert or update of pickup_township,township,parcel_count,expected_parcels,pickup_date
on public.be_portal_pickup_requests
for each row execute function public.be_pickup_service_policy_sync_v1();

insert into public.be_system_config(config_key,config_value,description,updated_at)
values
('service_policy_delivery_sla','{"yangon_days_min":1,"yangon_days_max":3,"other_city_days_min":3,"other_city_days_max":5,"estimate_only":true,"delay_exceptions":["traffic","weather","fuel_shortage"]}','Delivery SLA policy effective 2026-09-30',now()),
('service_policy_pod_return','{"pod_methods":["recipient_signature","driver_app_verification","handover_photo","otp"],"address_change_extra_charge":true,"redelivery":{"yangon_days":7,"other_city_days":15,"max_free_attempts":3},"return_charge":"FULL_ONE_WAY_DELIVERY_FEE","return_auto_deduction_hours":24,"storage_days":14,"abandonment_threshold_days":30,"abandonment_actions":["destroy","auction"]}','Proof of delivery, re-delivery, return and abandonment policy effective 2026-09-30',now()),
('service_policy_payout','{"normal_non_advance_payouts_per_week":2,"outstation_cod_transfer_hours":24,"late_penalty_exceptions":["KPay_outage","Wave_outage","CB_outage","KBZPay_outage","bank_holiday","internet_outage"]}','Financial payout policy effective 2026-09-30',now()),
('service_policy_liability_claims','{"liability_cap_mmk":300000,"compensation_basis":"LOWER_OF_DECLARED_OR_ORIGINAL_VALUE_AND_CAP","high_value_pre_notification_required":true,"claim_window_days":7,"pre_litigation_resolution_days":14,"excluded_losses":["indirect_loss","lost_profit","natural_disaster","emergency_event"]}','Liability and claims policy effective 2026-09-30',now()),
('customer_service_channels','{"call_center":["09-897447755","09-897447766"],"viber":"09-897447744","facebook":"Britium Express Official"}','Customer service channels shown in Britium Express apps',now())
on conflict (config_key) do update set
  config_value=excluded.config_value,
  description=excluded.description,
  updated_at=excluded.updated_at;


update public.be_portal_pickup_requests
set
  cod_policy_status = coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(payment_type,''),nullif(payment_method,''),nullif(payment_terms,''),'COD'),
    greatest(coalesce(total_cod,0),coalesce(cod_amount,0),coalesce(declared_item_value,0),0),
    greatest(coalesce(parcel_count,expected_parcels,1),1)
  )->>'cod_policy_status'),'NOT_EVALUATED'),
  cod_service_fee_rate = coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(payment_type,''),nullif(payment_method,''),nullif(payment_terms,''),'COD'),
    greatest(coalesce(total_cod,0),coalesce(cod_amount,0),coalesce(declared_item_value,0),0),
    greatest(coalesce(parcel_count,expected_parcels,1),1)
  )->>'fee_rate')::numeric,0),
  cod_service_fee_amount = coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(payment_type,''),nullif(payment_method,''),nullif(payment_terms,''),'COD'),
    greatest(coalesce(total_cod,0),coalesce(cod_amount,0),coalesce(declared_item_value,0),0),
    greatest(coalesce(parcel_count,expected_parcels,1),1)
  )->>'fee_amount')::numeric,0),
  finance_pre_dispatch_status = coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(payment_type,''),nullif(payment_method,''),nullif(payment_terms,''),'COD'),
    greatest(coalesce(total_cod,0),coalesce(cod_amount,0),coalesce(declared_item_value,0),0),
    greatest(coalesce(parcel_count,expected_parcels,1),1)
  )->>'finance_status'),'NOT_REQUIRED'),
  pickup_service_fee_amount = coalesce((public.be_pickup_service_policy_v1(
    coalesce(nullif(pickup_township,''),nullif(township,'')),
    greatest(coalesce(parcel_count,expected_parcels,1),1),
    coalesce(created_at,now()),
    pickup_date
  )->>'pickup_fee_amount')::numeric,0),
  pickup_same_day_eligible = coalesce((public.be_pickup_service_policy_v1(
    coalesce(nullif(pickup_township,''),nullif(township,'')),
    greatest(coalesce(parcel_count,expected_parcels,1),1),
    coalesce(created_at,now()),
    pickup_date
  )->>'same_day_eligible')::boolean,false),
  pickup_cutoff_status = coalesce((public.be_pickup_service_policy_v1(
    coalesce(nullif(pickup_township,''),nullif(township,'')),
    greatest(coalesce(parcel_count,expected_parcels,1),1),
    coalesce(created_at,now()),
    pickup_date
  )->>'cutoff_status'),'NOT_EVALUATED'),
  pickup_policy_version='PICKUP_2026_09_30',
  metadata = coalesce(metadata,'{}'::jsonb)
    || jsonb_build_object(
      'cod_fee_policy',
      public.be_finance_cod_policy_v2(
        coalesce(nullif(payment_type,''),nullif(payment_method,''),nullif(payment_terms,''),'COD'),
        greatest(coalesce(total_cod,0),coalesce(cod_amount,0),coalesce(declared_item_value,0),0),
        greatest(coalesce(parcel_count,expected_parcels,1),1)
      ),
      'pickup_service_policy',
      public.be_pickup_service_policy_v1(
        coalesce(nullif(pickup_township,''),nullif(township,'')),
        greatest(coalesce(parcel_count,expected_parcels,1),1),
        coalesce(created_at,now()),
        pickup_date
      )
    ),
  updated_at=now();

update public.be_data_entry_parcel_details
set
  cod_service_fee_rate = coalesce((public.be_finance_cod_policy_v2(
    'COD',greatest(coalesce(actual_collect,0),coalesce(cod_amount,0),0),1
  )->>'fee_rate')::numeric,0),
  cod_service_fee_amount = coalesce((public.be_finance_cod_policy_v2(
    'COD',greatest(coalesce(actual_collect,0),coalesce(cod_amount,0),0),1
  )->>'fee_amount')::numeric,0),
  cod_fee_policy_status = coalesce((public.be_finance_cod_policy_v2(
    'COD',greatest(coalesce(actual_collect,0),coalesce(cod_amount,0),0),1
  )->>'cod_policy_status'),'NOT_EVALUATED'),
  updated_at=now();

commit;
