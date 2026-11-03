-- Royal Express tariff catalog -> approved Finance STANDARD tariff synchronization.
-- Do not change historical COD or settled financial records.
-- This migration must be deployed by the approved database migration process.
create or replace function public.be_royal_tariff_finance_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $sync$
declare
  v_lookup text;
  v_existing integer;
  v_id bigint;
  v_zone text;
begin
  if upper(coalesce(new.provider_code,'')) <> 'ROYAL EXPRESS' then
    return new;
  end if;

  -- Only an approved named township may become an active payable tariff.
  v_lookup := public.be_approved_tariff_lookup_key(new.destination_name);
  if new.is_active and v_lookup is null then
    raise exception 'ROYAL_DESTINATION_NOT_APPROVED_FOR_FINANCE: %',new.destination_name
      using errcode='22023';
  end if;
  if new.is_active and (new.standard_rate_mmk is null
      or new.standard_rate_mmk<=0
      or new.standard_rate_mmk<>trunc(new.standard_rate_mmk)) then
    raise exception 'ROYAL_FINANCE_TARIFF_RATE_INVALID' using errcode='22023';
  end if;
  if v_lookup is null then return new; end if;

  -- Do not silently orphan the old finance tariff when a catalog destination
  -- is renamed to a different approved township. A rename requires a reviewed
  -- migration of both tariff records and any associated parcel references.
  if tg_op='UPDATE' then
    if upper(coalesce(old.provider_code,''))='ROYAL EXPRESS'
       and public.be_approved_tariff_lookup_key(old.destination_name)
           is distinct from v_lookup then
      raise exception 'ROYAL_DESTINATION_RENAME_REQUIRES_REVIEW'
        using errcode='22023';
    end if;
  end if;

  -- Serializes concurrent writes against the same canonical destination.
  perform pg_advisory_xact_lock(hashtextextended('ROYAL_FINANCE_STANDARD:'||v_lookup,0));

  select count(*),max(t.id) into v_existing,v_id
  from public.be_parcel_tariffs_v2 t
  where t.customer_tier='STANDARD'
    and t.status='ACTIVE'
    and t.effective_from<=public.be_business_date()
    and (t.effective_to is null or t.effective_to>=public.be_business_date())
    and public.be_approved_tariff_lookup_key(t.township)=v_lookup;

  if v_existing>1 then
    raise exception 'ROYAL_FINANCE_CONFLICTING_ACTIVE_TARIFF: %',new.destination_name
      using errcode='23505';
  end if;

  if not new.is_active then
    if v_existing=1 then
      select tariff_zone_code into v_zone
      from public.be_parcel_tariffs_v2 where id=v_id;
      if v_zone <> 'ROYAL' then
        raise exception 'ROYAL_FINANCE_OTHER_PROVIDER_CONFLICT' using errcode='23505';
      end if;
      update public.be_parcel_tariffs_v2
        set status='INACTIVE',effective_to=public.be_business_date(),
            updated_at=now()
      where id=v_id;
    end if;
    return new;
  end if;

  if v_existing=1 then
    -- Keep previously effective prices immutable. Repricing an existing Royal
    -- tariff must create a new daily version, not rewrite historical terms.
    select tariff_zone_code into v_zone
      from public.be_parcel_tariffs_v2 where id=v_id for update;
    if v_zone<>'ROYAL' then
      raise exception 'ROYAL_FINANCE_OTHER_PROVIDER_CONFLICT' using errcode='23505';
    end if;
    if (select base_tariff from public.be_parcel_tariffs_v2 where id=v_id)
        is distinct from new.standard_rate_mmk::bigint then
      if (select effective_from from public.be_parcel_tariffs_v2 where id=v_id)
          >=public.be_business_date() then
        raise exception 'ROYAL_SAME_DAY_REPRICING_REQUIRES_FINANCE_REVIEW'
          using errcode='23505';
      end if;
      -- Expire the old rate yesterday; it remains historically queryable.
      update public.be_parcel_tariffs_v2
         set effective_to=public.be_business_date()-1,updated_at=now()
       where id=v_id;
      insert into public.be_parcel_tariffs_v2(
        id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,
        included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,
        status,effective_from,note
      )
      select nextval('public.be_parcel_tariffs_v2_id_seq'),t.township,
        'STANDARD',t.tariff_zone,t.tariff_zone_code,new.standard_rate_mmk::bigint,
        t.included_kg,t.extra_per_kg,t.commitment_min_ways,
        t.commitment_refund_per_way,'ACTIVE',public.be_business_date(),
        concat('Royal catalog version published: ',new.destination_key)
      from public.be_parcel_tariffs_v2 t where t.id=v_id;
    end if;
  else
    -- An inactive same-day version cannot be duplicated because the Finance
    -- master is unique on township, tier and effective_from. Reactivate the
    -- same approved Royal row rather than inserting a conflicting version.
    select count(*),max(t.id) into v_existing,v_id
    from public.be_parcel_tariffs_v2 t
    where t.township=new.destination_name
      and t.customer_tier='STANDARD'
      and t.effective_from=public.be_business_date()
      and t.status='INACTIVE';
    if v_existing>1 then
      raise exception 'ROYAL_FINANCE_DUPLICATE_SAME_DAY_VERSION' using errcode='23505';
    end if;
    if v_existing=1 then
      select tariff_zone_code into v_zone
      from public.be_parcel_tariffs_v2 where id=v_id;
      if v_zone<>'ROYAL' then
        raise exception 'ROYAL_FINANCE_OTHER_PROVIDER_CONFLICT' using errcode='23505';
      end if;
      if (select base_tariff from public.be_parcel_tariffs_v2 where id=v_id)
          is distinct from new.standard_rate_mmk::bigint then
        raise exception 'ROYAL_SAME_DAY_REPRICING_REQUIRES_FINANCE_REVIEW'
          using errcode='23505';
      end if;
      update public.be_parcel_tariffs_v2
        set status='ACTIVE',effective_to=null,
            updated_at=now(),
            note=concat('Royal catalog reactivated: ',new.destination_key)
        where id=v_id;
    else
      -- Royal STANDARD convention: 3 kg included and 500 MMK per extra kg.
      -- Never invent ROYAL or COMMITMENT merchant-tier prices.
      insert into public.be_parcel_tariffs_v2(
        id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,
        included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,
        status,effective_from,note
      ) values(
        nextval('public.be_parcel_tariffs_v2_id_seq'),new.destination_name,'STANDARD',
        'ROYAL','ROYAL',new.standard_rate_mmk::bigint,3,500,0,0,
        'ACTIVE',public.be_business_date(),
        concat('Approved Royal catalog synchronized: ',new.destination_key)
      );
    end if;
  end if;
  return new;
end;
$sync$;

-- SECURITY DEFINER trigger must not be directly callable via PostgREST.
-- Invoked by the table trigger under the definer's privileges.
revoke execute on function public.be_royal_tariff_finance_sync_v1() from public, anon, authenticated;

drop trigger if exists be_royal_tariff_finance_sync_trigger_v1
  on public.be_data_entry_tariff_catalog;
create trigger be_royal_tariff_finance_sync_trigger_v1
after insert or update of standard_rate_mmk,is_active,destination_name
on public.be_data_entry_tariff_catalog
for each row execute function public.be_royal_tariff_finance_sync_v1();

-- Repair only the explicitly approved missing destination.
-- Unapproved destination ထန်းခြောက်ပင် is intentionally NOT activated in Finance.
do $backfill$
declare
  v_row public.be_data_entry_tariff_catalog%rowtype;
  v_found integer;
begin
  select * into v_row from public.be_data_entry_tariff_catalog
  where destination_name='ထန်းတပင်' and provider_code='ROYAL EXPRESS' and is_active;
  if not found then raise exception 'EXPECTED_APPROVED_ROYAL_DESTINATION_MISSING'; end if;
  if public.be_approved_tariff_lookup_key(v_row.destination_name)<>'MMR007014'
  then raise exception 'APPROVED_DESTINATION_LOOKUP_CHANGED'; end if;
  select count(*) into v_found from public.be_parcel_tariffs_v2 t
  where t.customer_tier='STANDARD' and t.status='ACTIVE'
    and public.be_approved_tariff_lookup_key(t.township)='MMR007014'
    and t.effective_from<=public.be_business_date()
    and (t.effective_to is null or t.effective_to>=public.be_business_date());
  if v_found>1 then raise exception 'EXISTING_TARIFF_CONFLICT'; end if;
  if v_found=0 then
    insert into public.be_parcel_tariffs_v2(
      id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,
      included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,
      status,effective_from,note
    ) values (
      nextval('public.be_parcel_tariffs_v2_id_seq'),v_row.destination_name,
      'STANDARD','ROYAL','ROYAL',v_row.standard_rate_mmk::bigint,3,500,0,0,
      'ACTIVE',public.be_business_date(),'Backfill approved Royal catalog destination'
    );
  end if;
end $backfill$;
