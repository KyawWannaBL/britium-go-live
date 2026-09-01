-- BRITIUM_MERCHANT_PORTAL_SECURITY_V1_20260823
-- Merchant-scoped API. Apply with a reviewed Supabase migration.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.be_current_merchant_identity_impl()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
  v_uid uuid:=auth.uid(); v_email text; v_code text; v_name text; v_uuid uuid;
  v_staff_name text; v_staff_role text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=v_uid;
  select s.merchant_code,s.staff_name,s.role into v_code,v_staff_name,v_staff_role
  from public.be_merchant_portal_staff s
  where lower(coalesce(s.email,''))=v_email and lower(coalesce(s.status,'active'))='active'
  order by s.updated_at desc nulls last limit 1;
  if nullif(v_code,'') is null then
    select m.merchant_id,m.merchant_name into v_code,v_name from public.merchant_master m
    where lower(coalesce(m.email,''))=v_email order by m.merchant_id limit 1;
  end if;
  if nullif(v_code,'') is null then
    raise exception 'No active merchant account is linked to this sign-in' using errcode='42501';
  end if;
  select coalesce(b.merchant_name,v_name),b.id into v_name,v_uuid from public.be_merchants b
  where upper(coalesce(b.merchant_code,''))=upper(v_code) order by b.id limit 1;
  if nullif(v_name,'') is null then
    select m.merchant_name into v_name from public.be_merchant_master m
    where upper(m.merchant_code::text)=upper(v_code) limit 1;
  end if;
  return jsonb_build_object('auth_user_id',v_uid,'email',v_email,'merchant_code',v_code,
    'merchant_uuid',v_uuid,'merchant_name',coalesce(v_name,v_code),
    'staff_name',coalesce(v_staff_name,split_part(v_email,'@',1)),
    'staff_role',coalesce(v_staff_role,'merchant_user'));
end $$;
revoke all on function private.be_current_merchant_identity_impl() from public,anon;
grant execute on function private.be_current_merchant_identity_impl() to authenticated;
create or replace function private.be_merchant_portal_v1_snapshot_impl(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,private as $$
declare
  v_identity jsonb:=private.be_current_merchant_identity_impl();
  v_code text; v_name text; v_uuid uuid;
  v_limit integer:=least(greatest(coalesce((p_payload->>'limit')::integer,100),1),500);
  v_pickups jsonb:='[]'; v_shipments jsonb:='[]'; v_settlements jsonb:='[]';
  v_invoices jsonb:='[]'; v_tickets jsonb:='[]'; v_profile jsonb:='{}';
begin
  v_code:=v_identity->>'merchant_code'; v_name:=v_identity->>'merchant_name';
  v_uuid:=nullif(v_identity->>'merchant_uuid','')::uuid;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_pickups from (
    select * from public.be_merchant_portal_pickup_requests p
    where upper(coalesce(p.merchant_code,''))=upper(v_code) order by p.created_at desc limit v_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_shipments from (
    select * from public.be_data_entry_register_rows r
    where upper(coalesce(r.merchant_code,''))=upper(v_code) order by r.created_at desc limit v_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_settlements from (
    select * from public.be_financial_settlements s
    where upper(coalesce(s.merchant_code,''))=upper(v_code)
       or (nullif(s.merchant_code,'') is null and lower(coalesce(s.merchant_name,''))=lower(v_name))
    order by s.created_at desc limit v_limit) x;
  if v_uuid is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_invoices from (
      select * from public.merchant_invoices i where i.merchant_id=v_uuid
      order by i.created_at desc limit v_limit) x;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_tickets from (
    select * from public.be_merchant_support_tickets t
    where upper(coalesce(t.merchant_code,''))=upper(v_code) order by t.created_at desc limit v_limit) x;
  select coalesce(to_jsonb(p),'{}') into v_profile from public.be_merchant_profiles p
  where p.id=auth.uid() or (v_uuid is not null and p.id=v_uuid)
  order by case when p.id=auth.uid() then 0 else 1 end limit 1;
  return jsonb_build_object('ok',true,'identity',v_identity,'profile',coalesce(v_profile,'{}'),
    'pickups',v_pickups,'shipments',v_shipments,'settlements',v_settlements,
    'invoices',v_invoices,'tickets',v_tickets);
end $$;
revoke all on function private.be_merchant_portal_v1_snapshot_impl(jsonb) from public,anon;
grant execute on function private.be_merchant_portal_v1_snapshot_impl(jsonb) to authenticated;
create or replace function private.be_merchant_portal_v1_create_ticket_impl(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,private as $$
declare
  v_identity jsonb:=private.be_current_merchant_identity_impl();
  v_subject text:=trim(coalesce(p_payload->>'subject',''));
  v_description text:=trim(coalesce(p_payload->>'description',''));
  v_row public.be_merchant_support_tickets;
begin
  if length(v_subject)<3 then raise exception 'Support subject is required'; end if;
  if length(v_description)<5 then raise exception 'Support description is required'; end if;
  insert into public.be_merchant_support_tickets
    (merchant_code,merchant_name,subject,description,priority,status,submitted_by_email,payload)
  values(v_identity->>'merchant_code',v_identity->>'merchant_name',v_subject,v_description,
    coalesce(nullif(p_payload->>'priority',''),'Medium'),'open',v_identity->>'email',coalesce(p_payload,'{}'))
  returning * into v_row;
  return jsonb_build_object('ok',true,'ticket',to_jsonb(v_row));
end $$;
revoke all on function private.be_merchant_portal_v1_create_ticket_impl(jsonb) from public,anon;
grant execute on function private.be_merchant_portal_v1_create_ticket_impl(jsonb) to authenticated;
create or replace function public.be_merchant_portal_v1_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.be_merchant_portal_v1_snapshot_impl(coalesce(p_payload,'{}'::jsonb)) $$;
revoke all on function public.be_merchant_portal_v1_snapshot(jsonb) from public,anon;
grant execute on function public.be_merchant_portal_v1_snapshot(jsonb) to authenticated;
create or replace function public.be_merchant_portal_v1_create_ticket(p_payload jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.be_merchant_portal_v1_create_ticket_impl(coalesce(p_payload,'{}'::jsonb)) $$;
revoke all on function public.be_merchant_portal_v1_create_ticket(jsonb) from public,anon;
grant execute on function public.be_merchant_portal_v1_create_ticket(jsonb) to authenticated;
do $$ begin
  if to_regprocedure('public.be_merchant_portal_snapshot(jsonb)') is not null then
    execute 'revoke all on function public.be_merchant_portal_snapshot(jsonb) from public, anon, authenticated';
  end if;
end $$;
commit;
