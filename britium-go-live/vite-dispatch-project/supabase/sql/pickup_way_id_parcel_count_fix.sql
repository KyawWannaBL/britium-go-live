-- PickupWayID parcel-count format fix
-- Required format:
--   P + MMDD + '-' + MERCHANT_CODE + '-' + 3-digit parcel count
-- Example:
--   P0517-BBG-015
--
-- Meaning:
--   P    = Pickup
--   05   = May
--   17   = day of month
--   BBG  = merchant code / merchant ID
--   015  = parcel_count / number of delivery ways for that pickup request
--
-- This fixes the current problem where the last 3 digits are always 001.

create extension if not exists pgcrypto;

create or replace function public.be_clean_merchant_code(p_code text, p_name text default null)
returns text
language plpgsql
immutable
as $$
declare
  v_code text := upper(regexp_replace(coalesce(nullif(trim(p_code), ''), ''), '[^A-Z0-9]', '', 'g'));
  v_words text[];
  v_word text;
  v_initials text := '';
begin
  if v_code <> '' then
    return left(v_code, 12);
  end if;

  -- Fallback: use initials from merchant name only if merchant_code is missing.
  v_words := regexp_split_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Z0-9 ]', ' ', 'g')), '\s+');

  foreach v_word in array v_words loop
    if length(v_word) > 0 then
      v_initials := v_initials || left(v_word, 1);
    end if;
  end loop;

  v_initials := upper(regexp_replace(v_initials, '[^A-Z0-9]', '', 'g'));

  if v_initials = '' then
    v_initials := 'GEN';
  end if;

  return left(v_initials, 12);
end;
$$;

create or replace function public.be_safe_positive_int(p_value text, p_default integer default 1)
returns integer
language plpgsql
immutable
as $$
declare
  v integer;
begin
  begin
    v := floor(coalesce(nullif(trim(p_value), '')::numeric, p_default))::integer;
  exception when others then
    v := p_default;
  end;

  if v is null or v < 1 then
    return p_default;
  end if;

  return v;
end;
$$;

create or replace function public.be_safe_date(p_value text, p_default date default current_date)
returns date
language plpgsql
stable
as $$
declare
  v date;
begin
  begin
    v := nullif(trim(p_value), '')::date;
  exception when others then
    v := p_default;
  end;

  return coalesce(v, p_default);
end;
$$;

create or replace function public.be_make_pickup_way_id(
  p_pickup_date date,
  p_merchant_code text,
  p_parcel_count integer,
  p_merchant_name text default null
)
returns text
language sql
immutable
as $$
  select
    'P'
    || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
    || '-'
    || public.be_clean_merchant_code(p_merchant_code, p_merchant_name)
    || '-'
    || lpad(greatest(coalesce(p_parcel_count, 1), 1)::text, 3, '0');
$$;

create or replace function public.be_pickup_way_id_from_json(p_payload jsonb)
returns text
language plpgsql
stable
as $$
declare
  v_pickup_date date;
  v_merchant_code text;
  v_merchant_name text;
  v_parcel_count integer;
begin
  v_pickup_date := public.be_safe_date(
    coalesce(
      p_payload->>'pickup_date',
      p_payload->>'pickupDate',
      p_payload->>'requested_pickup_date',
      p_payload->>'created_at',
      p_payload->>'createdAt'
    ),
    current_date
  );

  v_merchant_code := coalesce(
    p_payload->>'merchant_code',
    p_payload->>'merchantCode',
    p_payload->>'merchant_id',
    p_payload->>'merchantId',
    p_payload->>'customer_code',
    p_payload->>'customerCode'
  );

  v_merchant_name := coalesce(
    p_payload->>'merchant_name',
    p_payload->>'merchantName',
    p_payload->>'sender_name',
    p_payload->>'senderName'
  );

  v_parcel_count := public.be_safe_positive_int(
    coalesce(
      p_payload->>'parcel_count',
      p_payload->>'parcelCount',
      p_payload->>'package_count',
      p_payload->>'packageCount',
      p_payload->>'total_parcels',
      p_payload->>'totalParcels',
      p_payload->>'pieces',
      p_payload->>'way_count',
      p_payload->>'wayCount'
    ),
    1
  );

  return public.be_make_pickup_way_id(v_pickup_date, v_merchant_code, v_parcel_count, v_merchant_name);
end;
$$;

-- Public helper for frontend/RPC callers.
create or replace function public.be_generate_pickup_way_id(p_payload jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'pickup_id', public.be_pickup_way_id_from_json(p_payload),
    'pickup_way_id', public.be_pickup_way_id_from_json(p_payload),
    'format', 'P-MMDD-MERCHANT-PARCELCOUNT',
    'example', 'P0517-BBG-015'
  );
$$;

-- Trigger: protects new CS/Data Entry pickup inserts even if frontend still sends "...-001".
create or replace function public.be_apply_pickup_way_id_before_write()
returns trigger
language plpgsql
security definer
as $$
declare
  v_payload jsonb := to_jsonb(new);
  v_expected text;
  v_existing text;
  v_existing_suffix text;
  v_expected_suffix text;
begin
  v_expected := public.be_pickup_way_id_from_json(v_payload);
  v_existing := coalesce(v_payload->>'pickup_id', '');
  v_existing_suffix := split_part(v_existing, '-', 3);
  v_expected_suffix := split_part(v_expected, '-', 3);

  -- Always generate when empty/legacy/wrong count. This fixes the current "always 001" bug.
  if v_existing = ''
     or v_existing !~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
     or v_existing_suffix <> v_expected_suffix
  then
    new.pickup_id := v_expected;
  end if;

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'pickup_id'
      and table_name in (
        'be_portal_pickup_requests',
        'cs_pickup_requests',
        'be_customer_service_pickup_requests',
        'pickup_requests'
      )
  loop
    execute format('drop trigger if exists be_pickup_way_id_bi on %I.%I', r.table_schema, r.table_name);
    execute format(
      'create trigger be_pickup_way_id_bi before insert on %I.%I for each row execute function public.be_apply_pickup_way_id_before_write()',
      r.table_schema,
      r.table_name
    );
  end loop;
end $$;

-- Audit view: shows rows whose current pickup_id does not match the new parcel-count rule.
do $$
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $v$
      create or replace view public.be_pickup_way_id_audit as
      select
        j->>'pickup_id' as current_pickup_id,
        public.be_pickup_way_id_from_json(j) as expected_pickup_id,
        j->>'merchant_code' as merchant_code,
        j->>'merchant_name' as merchant_name,
        public.be_safe_positive_int(coalesce(j->>'parcel_count', j->>'parcelCount', j->>'package_count', j->>'pieces'), 1) as parcel_count,
        public.be_safe_date(coalesce(j->>'pickup_date', j->>'created_at'), current_date) as pickup_date,
        ((j->>'pickup_id') is distinct from public.be_pickup_way_id_from_json(j)) as mismatch
      from (
        select to_jsonb(t) as j
        from public.be_portal_pickup_requests t
      ) s
    $v$;
  end if;
end $$;

-- Repair existing rows and cascade the pickup_id into every public table that has a pickup_id column.
-- Rows are skipped when the expected new ID would collide with another existing pickup.
create or replace function public.be_repair_existing_pickup_way_ids()
returns jsonb
language plpgsql
security definer
as $$
declare
  r record;
  v_updated_tables jsonb := '[]'::jsonb;
  v_table_count integer;
  v_parent_count integer := 0;
  v_skipped integer := 0;
begin
  if to_regclass('public.be_portal_pickup_requests') is null then
    return jsonb_build_object('ok', false, 'error', 'public.be_portal_pickup_requests does not exist');
  end if;

  create temp table if not exists __pickup_way_id_map (
    old_id text primary key,
    new_id text not null
  ) on commit drop;

  truncate table __pickup_way_id_map;

  insert into __pickup_way_id_map (old_id, new_id)
  with calc as (
    select
      j->>'pickup_id' as old_id,
      public.be_pickup_way_id_from_json(j) as new_id
    from (
      select to_jsonb(t) as j
      from public.be_portal_pickup_requests t
    ) s
    where coalesce(j->>'pickup_id', '') <> ''
  ),
  ranked as (
    select
      old_id,
      new_id,
      count(*) over (partition by new_id) as same_new_id_count
    from calc
    where old_id is distinct from new_id
  )
  select old_id, new_id
  from ranked r
  where same_new_id_count = 1
    and not exists (
      select 1
      from public.be_portal_pickup_requests x
      where x.pickup_id = r.new_id
        and x.pickup_id <> r.old_id
    );

  -- Count skipped mismatches.
  with calc as (
    select
      j->>'pickup_id' as old_id,
      public.be_pickup_way_id_from_json(j) as new_id
    from (
      select to_jsonb(t) as j
      from public.be_portal_pickup_requests t
    ) s
    where coalesce(j->>'pickup_id', '') <> ''
  )
  select count(*)
  into v_skipped
  from calc c
  where c.old_id is distinct from c.new_id
    and not exists (select 1 from __pickup_way_id_map m where m.old_id = c.old_id);

  -- Update child/related tables first. Your current database mostly uses loose text references,
  -- so this keeps Supervisor, Rider, Data Entry, COD and Finance aligned.
  for r in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'pickup_id'
      and table_name <> 'be_portal_pickup_requests'
    group by table_schema, table_name
    order by table_name
  loop
    begin
      execute format(
        'update %I.%I t set pickup_id = m.new_id from __pickup_way_id_map m where t.pickup_id = m.old_id',
        r.table_schema,
        r.table_name
      );
      get diagnostics v_table_count = row_count;
      v_updated_tables := v_updated_tables || jsonb_build_object(
        'table',
        r.table_schema || '.' || r.table_name,
        'rows',
        v_table_count
      );
    exception when others then
      v_updated_tables := v_updated_tables || jsonb_build_object(
        'table',
        r.table_schema || '.' || r.table_name,
        'error',
        sqlerrm
      );
    end;
  end loop;

  update public.be_portal_pickup_requests t
  set pickup_id = m.new_id
  from __pickup_way_id_map m
  where t.pickup_id = m.old_id;

  get diagnostics v_parent_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'parent_table_updated_rows', v_parent_count,
    'related_tables', v_updated_tables,
    'skipped_due_to_collision_or_duplicate', v_skipped,
    'example', public.be_make_pickup_way_id(date '2026-05-17', 'BBG', 15, 'Baby Genius')
  );
end;
$$;

grant execute on function public.be_clean_merchant_code(text,text) to anon, authenticated;
grant execute on function public.be_make_pickup_way_id(date,text,integer,text) to anon, authenticated;
grant execute on function public.be_pickup_way_id_from_json(jsonb) to anon, authenticated;
grant execute on function public.be_generate_pickup_way_id(jsonb) to anon, authenticated;
grant execute on function public.be_repair_existing_pickup_way_ids() to authenticated;

notify pgrst, 'reload schema';

-- Smoke tests:
-- select public.be_make_pickup_way_id(date '2026-05-17', 'BBG', 15, 'Baby Genius');
-- select public.be_generate_pickup_way_id('{"pickup_date":"2026-05-17","merchant_code":"BBG","merchant_name":"Baby Genius","parcel_count":15}'::jsonb);
-- select * from public.be_pickup_way_id_audit where mismatch = true limit 20;
-- select public.be_repair_existing_pickup_way_ids();
