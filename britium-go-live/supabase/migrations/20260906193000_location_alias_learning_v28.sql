create table if not exists public.be_location_aliases (
  id bigint generated always as identity primary key,
  alias_key text not null,
  township_key text not null default '',
  merchant_id text not null default '',
  address_alias text not null,
  address_english text not null default '',
  township text not null default '',
  postal_code text not null default '',
  postal_match_level text not null default 'UNRESOLVED',
  latitude numeric(11,8) not null,
  longitude numeric(11,8) not null,
  provider_label text not null default '',
  match_level text not null default 'MANUAL',
  confidence numeric(5,4) not null default 1,
  coordinate_source text not null default 'DATA_ENTRY_ACCEPTED_LOCATION',
  usage_count bigint not null default 1,
  verified_by uuid,
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  constraint be_location_alias_lat_ck check (latitude between 9 and 29),
  constraint be_location_alias_lng_ck check (longitude between 92 and 102),
  constraint be_location_alias_confidence_ck check (confidence between 0 and 1),
  constraint be_location_alias_usage_ck check (usage_count > 0),
  constraint be_location_alias_unique unique (alias_key,township_key,merchant_id)
);

create index if not exists be_location_alias_township_lookup_idx
  on public.be_location_aliases (township_key,last_verified_at desc);

alter table public.be_location_aliases enable row level security;
revoke all on table public.be_location_aliases from public,anon,authenticated;
grant select on table public.be_location_aliases to authenticated;
grant select,insert,update,delete on table public.be_location_aliases to service_role;
grant usage,select on sequence public.be_location_aliases_id_seq to service_role;

drop policy if exists be_location_alias_read_v28 on public.be_location_aliases;
create policy be_location_alias_read_v28
on public.be_location_aliases for select
to authenticated
using (private.be_location_editor_allowed_v10());

create or replace function private.be_location_alias_normalize_v28(p_value text)
returns text
language sql
immutable
security invoker
set search_path=pg_catalog,pg_temp
as $$
  select lower(btrim(regexp_replace(coalesce(p_value,''),'[[:space:][:punct:]၊။]+',' ','g')));
$$;

revoke all on function private.be_location_alias_normalize_v28(text) from public,anon,authenticated;

create or replace function private.be_delivery_location_learn_alias_v28()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_alias_key text := private.be_location_alias_normalize_v28(new.address_original);
  v_township_key text := private.be_location_alias_normalize_v28(new.township);
begin
  if new.review_status<>'ACCEPTED'
     or v_alias_key=''
     or new.latitude is null
     or new.longitude is null then
    return new;
  end if;

  insert into public.be_location_aliases(
    alias_key,township_key,merchant_id,address_alias,address_english,township,
    postal_code,postal_match_level,latitude,longitude,provider_label,match_level,
    confidence,coordinate_source,usage_count,verified_by,last_verified_at
  ) values (
    v_alias_key,v_township_key,'',new.address_original,new.address_english,new.township,
    coalesce(new.postal_code,''),coalesce(new.postal_match_level,'UNRESOLVED'),
    new.latitude,new.longitude,new.provider_label,new.match_level,
    greatest(new.confidence,0.95),new.coordinate_source,1,new.updated_by,now()
  )
  on conflict (alias_key,township_key,merchant_id) do update set
    address_alias=excluded.address_alias,
    address_english=excluded.address_english,
    township=excluded.township,
    postal_code=excluded.postal_code,
    postal_match_level=excluded.postal_match_level,
    latitude=case when excluded.confidence>=be_location_aliases.confidence then excluded.latitude else be_location_aliases.latitude end,
    longitude=case when excluded.confidence>=be_location_aliases.confidence then excluded.longitude else be_location_aliases.longitude end,
    provider_label=case when excluded.confidence>=be_location_aliases.confidence then excluded.provider_label else be_location_aliases.provider_label end,
    match_level=case when excluded.confidence>=be_location_aliases.confidence then excluded.match_level else be_location_aliases.match_level end,
    confidence=greatest(be_location_aliases.confidence,excluded.confidence),
    coordinate_source=case when excluded.confidence>=be_location_aliases.confidence then excluded.coordinate_source else be_location_aliases.coordinate_source end,
    usage_count=be_location_aliases.usage_count+1,
    verified_by=excluded.verified_by,
    last_verified_at=now();
  return new;
end;
$$;

revoke all on function private.be_delivery_location_learn_alias_v28() from public,anon,authenticated;

drop trigger if exists be_delivery_location_learn_alias_v28 on public.be_delivery_location_registry;
create trigger be_delivery_location_learn_alias_v28
after insert or update of address_original,township,latitude,longitude,review_status
on public.be_delivery_location_registry
for each row execute function private.be_delivery_location_learn_alias_v28();

insert into public.be_location_aliases(
  alias_key,township_key,merchant_id,address_alias,address_english,township,
  postal_code,postal_match_level,latitude,longitude,provider_label,match_level,
  confidence,coordinate_source,usage_count,verified_by,first_verified_at,last_verified_at
)
select alias_key,township_key,'',address_original,address_english,township,postal_code,
  postal_match_level,latitude,longitude,provider_label,match_level,confidence,
  coordinate_source,duplicate_count,updated_by,created_at,updated_at
from (
  select
    private.be_location_alias_normalize_v28(r.address_original) as alias_key,
    private.be_location_alias_normalize_v28(r.township) as township_key,
    r.address_original,r.address_english,r.township,coalesce(r.postal_code,'') as postal_code,
    coalesce(r.postal_match_level,'UNRESOLVED') as postal_match_level,
    r.latitude,r.longitude,r.provider_label,r.match_level,greatest(r.confidence,0.95) as confidence,
    r.coordinate_source,r.updated_by,r.created_at,r.updated_at,
    count(*) over (
      partition by private.be_location_alias_normalize_v28(r.address_original),
                   private.be_location_alias_normalize_v28(r.township)
    ) as duplicate_count,
    row_number() over (
      partition by private.be_location_alias_normalize_v28(r.address_original),
                   private.be_location_alias_normalize_v28(r.township)
      order by r.confidence desc,r.updated_at desc,r.delivery_way_id desc
    ) as choice_rank
  from public.be_delivery_location_registry r
  where r.review_status='ACCEPTED'
    and btrim(r.address_original)<>''
    and r.latitude is not null
    and r.longitude is not null
) ranked
where choice_rank=1
on conflict (alias_key,township_key,merchant_id) do update set
  latitude=case when excluded.confidence>=be_location_aliases.confidence then excluded.latitude else be_location_aliases.latitude end,
  longitude=case when excluded.confidence>=be_location_aliases.confidence then excluded.longitude else be_location_aliases.longitude end,
  confidence=greatest(be_location_aliases.confidence,excluded.confidence),
  usage_count=greatest(be_location_aliases.usage_count,excluded.usage_count),
  last_verified_at=greatest(be_location_aliases.last_verified_at,excluded.last_verified_at);

create or replace function public.be_location_alias_resolve_v28(
  p_address text,
  p_township text default ''
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,private,pg_temp
as $$
declare
  v_address_key text := lower(btrim(regexp_replace(coalesce(p_address,''),'[[:space:][:punct:]၊။]+',' ','g')));
  v_township_key text := lower(btrim(regexp_replace(coalesce(p_township,''),'[[:space:][:punct:]၊။]+',' ','g')));
  v_row public.be_location_aliases;
begin
  if v_address_key='' then
    return jsonb_build_object('ok',true,'location',null);
  end if;
  select a.* into v_row
  from public.be_location_aliases a
  where a.alias_key=v_address_key
    and (v_township_key='' or a.township_key=v_township_key)
  order by
    case when a.township_key=v_township_key then 0 else 1 end,
    a.confidence desc,a.usage_count desc,a.last_verified_at desc
  limit 1;
  return jsonb_build_object(
    'ok',true,
    'location',case when v_row.id is null then null else to_jsonb(v_row) end,
    'build','DATA_ENTRY_LOCATION_ALIAS_LEARNING_V28_20260906'
  );
end;
$$;

revoke all on function public.be_location_alias_resolve_v28(text,text) from public,anon;
grant execute on function public.be_location_alias_resolve_v28(text,text) to authenticated,service_role;

comment on table public.be_location_aliases is
  'V28 reusable accepted delivery-address aliases. Corrections and exact accepted pins are learned automatically; RLS limits reads to authorized location editors.';
comment on function public.be_location_alias_resolve_v28(text,text) is
  'V28 exact normalized address/township lookup used before Google Maps to avoid repeated review and API work.';

notify pgrst,'reload schema';
