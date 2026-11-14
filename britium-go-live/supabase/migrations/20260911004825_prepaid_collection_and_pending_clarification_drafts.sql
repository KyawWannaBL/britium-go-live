
create or replace function public.be_normalize_prepaid_input(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb:=coalesce(p,'{}'); t text:=upper(coalesce(p->>'amount_entry_type','')); i text:=nullif(btrim(p->>'item_price'),''); d text:=nullif(btrim(p->>'delivery_charges'),'');
begin
 if t not in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY') then return v; end if;
 if i in ('-','—') then i:=null; end if; if d in ('-','—') then d:=null; end if;
 if (i is null or t='DELIVERY_CHARGE_ONLY') and d is null then
   return v||jsonb_build_object('amount_entry_type','EXACT_COLLECTION_AMOUNT','merchant_stated_total_amount',0,'item_price',null,'delivery_charges',null,'prepaid_to_merchant',true);
 elsif i is null or t='DELIVERY_CHARGE_ONLY' then
   return v||jsonb_build_object('amount_entry_type','DELIVERY_CHARGE_ONLY','item_price',null,'delivery_charges',d::bigint,'prepaid_item',true);
 elsif d is null then
   return v||jsonb_build_object('amount_entry_type','ITEM_PRICE_PLUS_DECLARED_DELIVERY','delivery_charges',0,'prepaid_delivery',true);
 end if; return v;
end $$;
revoke all on function public.be_normalize_prepaid_input(jsonb) from public;
grant execute on function public.be_normalize_prepaid_input(jsonb) to authenticated,service_role;
do $$
declare f text; n text;
begin
 foreach n in array array['be_data_entry_financial_v2_calculate','be_data_entry_financial_v2_save'] loop
 select pg_get_functiondef(oid) into f from pg_proc where oid=('public.'||n||'(jsonb)')::regprocedure;
 if position('be_normalize_prepaid_input' in f)=0 then
 f:=replace(f,'v_payload jsonb := coalesce(p_payload,''{}''::jsonb);','v_payload jsonb := public.be_normalize_prepaid_input(p_payload);');
 if n='be_data_entry_financial_v2_calculate' then
 f:=replace(f,'v_type text := upper(nullif(btrim(coalesce(p_payload->>''amount_entry_type'','''')),''''));','v_type text := upper(v_payload->>''amount_entry_type'');');
 end if;
 execute f;
 end if;
 end loop;
end $$;
update public.be_parcel_tariffs_v2 old set status='INACTIVE',updated_at=now()
where old.status='ACTIVE' and old.customer_tier='STANDARD'
and exists(select 1 from public.be_parcel_tariffs_v2 approved where approved.status='ACTIVE' and approved.customer_tier=old.customer_tier and approved.id<>old.id
and approved.note like 'User-approved standard tariff reconciliation%' 
and public.be_approved_tariff_lookup_key(approved.township)=public.be_approved_tariff_lookup_key(old.township)
and approved.effective_from>old.effective_from);

create table public.be_data_entry_pending_drafts (
 owner_id uuid not null default auth.uid(), pickup_id text not null,
 parcel_sequence integer not null check(parcel_sequence>0),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 skipped boolean not null default true, updated_at timestamptz not null default now(),
 primary key(owner_id,pickup_id,parcel_sequence)
);
alter table public.be_data_entry_pending_drafts enable row level security;
create policy own_authorized_drafts on public.be_data_entry_pending_drafts for all to authenticated
using(owner_id=auth.uid() and coalesce((public.be_data_entry_actor_access_v57('create',false)->>'allowed')::boolean,false))
with check(owner_id=auth.uid() and coalesce((public.be_data_entry_actor_access_v57('create',false)->>'allowed')::boolean,false));
revoke all on public.be_data_entry_pending_drafts from public,anon;
grant select,insert,update,delete on public.be_data_entry_pending_drafts to authenticated;
