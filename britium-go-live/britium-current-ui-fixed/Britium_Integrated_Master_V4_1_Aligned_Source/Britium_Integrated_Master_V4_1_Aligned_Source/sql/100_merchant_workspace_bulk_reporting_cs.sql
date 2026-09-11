-- Britium integrated Merchant Workspace
-- Run after merchant_portal_golive_backend.sql.
-- Adds authenticated ownership, Excel/direct registration, period reports,
-- two-way Customer Service messages and merchant notifications.

begin;
create extension if not exists pgcrypto;

create table if not exists public.be_merchant_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  merchant_code text not null,
  merchant_name text not null,
  email text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_code, email)
);

insert into public.be_merchant_accounts(auth_user_id,merchant_code,merchant_name,email,status)
select
  p.id,
  upper(coalesce(nullif(p.employee_id,''),split_part(p.email,'@',1))),
  coalesce(nullif(p.full_name,''),p.email),
  lower(p.email),
  'ACTIVE'
from public.profiles p
where upper(coalesce(p.role,p.app_role,p.user_role,p.role_code,'')) in ('MERCHANT','CUSTOMER')
  and p.id is not null and p.email is not null
on conflict (auth_user_id) do update set
  merchant_code=excluded.merchant_code,merchant_name=excluded.merchant_name,
  email=excluded.email,updated_at=now();

alter table public.be_merchant_portal_pickup_requests
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists cod_type text not null default 'estimated',
  add column if not exists preferred_pickup_at timestamptz;
alter table public.be_merchant_support_tickets
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists pickup_id text;

create table if not exists public.be_merchant_support_messages (
  message_id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.be_merchant_support_tickets(ticket_id) on delete cascade,
  merchant_code text not null,
  sender_user_id uuid not null references auth.users(id),
  sender_role text not null,
  sender_name text,
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists be_merchant_support_messages_ticket_idx
  on public.be_merchant_support_messages(ticket_id, created_at);

create table if not exists public.be_merchant_data_batches (
  batch_id uuid primary key default gen_random_uuid(),
  merchant_code text not null,
  owner_user_id uuid not null references auth.users(id),
  original_filename text not null,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
  status text not null default 'VALIDATING',
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create table if not exists public.be_merchant_data_rows (
  row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.be_merchant_data_batches(batch_id) on delete cascade,
  merchant_code text not null,
  row_number integer not null,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  township text,
  cod_amount numeric not null default 0,
  service_type text not null default 'Normal',
  validation_status text not null,
  validation_errors jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number)
);
create index if not exists be_merchant_data_rows_merchant_idx
  on public.be_merchant_data_rows(merchant_code, created_at desc);

create or replace view public.be_data_entry_merchant_registration_queue as
select
  r.row_id, r.batch_id, r.merchant_code, r.row_number, r.recipient_name,
  r.recipient_phone, r.delivery_address, r.township, r.cod_amount,
  r.service_type, r.validation_status, r.validation_errors, r.payload,
  b.original_filename, b.owner_user_id, b.status as batch_status,
  b.submitted_at, r.created_at
from public.be_merchant_data_rows r
join public.be_merchant_data_batches b using (batch_id)
where r.validation_status='ACCEPTED';

create or replace function public.be_is_merchant_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and upper(coalesce(p.role, p.app_role, p.user_role, p.role_code, '')) in
        ('APP_OWNER','SUPER_ADMIN','ADMIN','OPERATIONS_ADMIN','OPERATIONS_STAFF',
         'CUSTOMER_SERVICE_ADMIN','CUSTOMER_SERVICE','CUSTOMER_SERVICE_STAFF',
         'DATA_ENTRY','DATA_ENTRY_STAFF','FINANCE_ADMIN','FINANCE_STAFF')
  )
$$;

create or replace function public.be_current_merchant_code()
returns text
language sql stable security definer
set search_path = public
as $$
  select merchant_code from public.be_merchant_accounts
  where auth_user_id = auth.uid() and upper(status) = 'ACTIVE'
  limit 1
$$;

create or replace function public.be_merchant_stamp_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null then new.owner_user_id := auth.uid(); end if;
  return new;
end
$$;
drop trigger if exists trg_be_merchant_pickup_owner on public.be_merchant_portal_pickup_requests;
create trigger trg_be_merchant_pickup_owner before insert on public.be_merchant_portal_pickup_requests
for each row execute function public.be_merchant_stamp_owner();
drop trigger if exists trg_be_merchant_ticket_owner on public.be_merchant_support_tickets;
create trigger trg_be_merchant_ticket_owner before insert on public.be_merchant_support_tickets
for each row execute function public.be_merchant_stamp_owner();

alter table public.be_merchant_accounts enable row level security;
alter table public.be_merchant_support_messages enable row level security;
alter table public.be_merchant_data_batches enable row level security;
alter table public.be_merchant_data_rows enable row level security;

-- Remove the earlier prototype policies that exposed every merchant to every
-- authenticated account, then replace them with ownership-scoped policies.
drop policy if exists be_merchant_portal_pickup_requests_all_auth on public.be_merchant_portal_pickup_requests;
drop policy if exists be_merchant_support_tickets_all_auth on public.be_merchant_support_tickets;
drop policy if exists merchant_accounts_own_or_staff on public.be_merchant_accounts;
create policy merchant_accounts_own_or_staff on public.be_merchant_accounts
for select to authenticated using (auth_user_id = auth.uid() or public.be_is_merchant_staff());
drop policy if exists merchant_pickups_own_or_staff on public.be_merchant_portal_pickup_requests;
create policy merchant_pickups_own_or_staff on public.be_merchant_portal_pickup_requests
for all to authenticated
using (owner_user_id = auth.uid() or merchant_code = public.be_current_merchant_code() or public.be_is_merchant_staff())
with check (owner_user_id = auth.uid() or merchant_code = public.be_current_merchant_code() or public.be_is_merchant_staff());
drop policy if exists merchant_tickets_own_or_staff on public.be_merchant_support_tickets;
create policy merchant_tickets_own_or_staff on public.be_merchant_support_tickets
for all to authenticated
using (owner_user_id = auth.uid() or merchant_code = public.be_current_merchant_code() or public.be_is_merchant_staff())
with check (owner_user_id = auth.uid() or merchant_code = public.be_current_merchant_code() or public.be_is_merchant_staff());
drop policy if exists merchant_messages_own_or_staff on public.be_merchant_support_messages;
create policy merchant_messages_own_or_staff on public.be_merchant_support_messages
for all to authenticated
using (
  public.be_is_merchant_staff() or exists (
    select 1 from public.be_merchant_support_tickets t
    where t.ticket_id = be_merchant_support_messages.ticket_id
      and (t.owner_user_id = auth.uid() or t.merchant_code = public.be_current_merchant_code())
  )
)
with check (
  sender_user_id = auth.uid() and (
    public.be_is_merchant_staff() or merchant_code = public.be_current_merchant_code()
  )
);
drop policy if exists merchant_batches_own_or_staff on public.be_merchant_data_batches;
create policy merchant_batches_own_or_staff on public.be_merchant_data_batches
for all to authenticated using (owner_user_id = auth.uid() or public.be_is_merchant_staff())
with check (owner_user_id = auth.uid() or public.be_is_merchant_staff());
drop policy if exists merchant_rows_own_or_staff on public.be_merchant_data_rows;
create policy merchant_rows_own_or_staff on public.be_merchant_data_rows
for select to authenticated using (
  public.be_is_merchant_staff() or exists (
    select 1 from public.be_merchant_data_batches b
    where b.batch_id = be_merchant_data_rows.batch_id and b.owner_user_id = auth.uid()
  )
);

create or replace function public.be_merchant_submit_data_batch(
  p_rows jsonb,
  p_filename text,
  p_merchant_code text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_code text := coalesce(nullif(p_merchant_code,''), public.be_current_merchant_code());
  v_batch uuid;
  v_row jsonb;
  v_index integer := 0;
  v_accepted integer := 0;
  v_errors jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_code is null then raise exception 'Merchant account is not mapped to a merchant code'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one registration row is required';
  end if;
  insert into public.be_merchant_data_batches
    (merchant_code, owner_user_id, original_filename, total_rows)
  values (upper(v_code), auth.uid(), coalesce(nullif(p_filename,''),'merchant-entry'), jsonb_array_length(p_rows))
  returning batch_id into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_errors := '[]'::jsonb;
    if nullif(trim(v_row->>'recipient_name'),'') is null then v_errors := v_errors || '"recipient_name is required"'::jsonb; end if;
    if nullif(trim(v_row->>'recipient_phone'),'') is null then v_errors := v_errors || '"recipient_phone is required"'::jsonb; end if;
    if nullif(trim(v_row->>'delivery_address'),'') is null then v_errors := v_errors || '"delivery_address is required"'::jsonb; end if;
    if jsonb_array_length(v_errors) = 0 then v_accepted := v_accepted + 1; end if;
    insert into public.be_merchant_data_rows (
      batch_id, merchant_code, row_number, recipient_name, recipient_phone,
      delivery_address, township, cod_amount, service_type,
      validation_status, validation_errors, payload
    ) values (
      v_batch, upper(v_code), v_index, v_row->>'recipient_name',
      v_row->>'recipient_phone', v_row->>'delivery_address', v_row->>'township',
      case when coalesce(v_row->>'cod_amount','') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_row->>'cod_amount')::numeric else 0 end,
      coalesce(nullif(v_row->>'service_type',''),'Normal'),
      case when jsonb_array_length(v_errors)=0 then 'ACCEPTED' else 'REJECTED' end,
      v_errors, v_row
    );
  end loop;
  update public.be_merchant_data_batches set
    accepted_rows=v_accepted, rejected_rows=v_index-v_accepted,
    status=case when v_accepted=v_index then 'SUBMITTED' when v_accepted=0 then 'REJECTED' else 'PARTIAL' end,
    submitted_at=now()
  where batch_id=v_batch;

  -- The common registration queue can consume accepted rows from
  -- be_merchant_data_rows. This avoids bypassing staff validation and RLS.
  return jsonb_build_object(
    'ok', true, 'batch_id', v_batch, 'total_rows', v_index,
    'accepted_rows', v_accepted, 'rejected_rows', v_index-v_accepted,
    'status', case when v_accepted=v_index then 'SUBMITTED' when v_accepted=0 then 'REJECTED' else 'PARTIAL' end
  );
end
$$;

create or replace function public.be_merchant_submit_pickup_request(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_code text := public.be_current_merchant_code();
  v_account public.be_merchant_accounts;
  v_payload jsonb;
begin
  if auth.uid() is null or v_code is null then raise exception 'Active merchant account mapping required'; end if;
  select * into v_account from public.be_merchant_accounts where auth_user_id=auth.uid();
  v_payload := coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
    'merchant_code',v_account.merchant_code,'merchant_name',v_account.merchant_name,
    'submitted_by_user_id',auth.uid(),'submitted_by_email',v_account.email
  );
  return public.be_merchant_create_pickup_request(v_payload,v_account.email);
end
$$;

create or replace function public.be_merchant_open_support_ticket(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_account public.be_merchant_accounts;
  v_result jsonb;
  v_ticket_id uuid;
begin
  select * into v_account from public.be_merchant_accounts
  where auth_user_id=auth.uid() and upper(status)='ACTIVE';
  if not found then raise exception 'Active merchant account mapping required'; end if;
  v_result := public.be_merchant_create_support_ticket(
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
      'merchant_code',v_account.merchant_code,'merchant_name',v_account.merchant_name
    ),v_account.email
  );
  v_ticket_id := (v_result#>>'{ticket,ticket_id}')::uuid;
  update public.be_merchant_support_tickets
  set owner_user_id=auth.uid(),pickup_id=nullif(p_payload->>'pickup_id','')
  where ticket_id=v_ticket_id;
  return v_result;
end
$$;

create or replace function public.be_merchant_reply_support_ticket(
  p_ticket_id uuid,
  p_message text
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ticket public.be_merchant_support_tickets;
  v_role text := case when public.be_is_merchant_staff() then 'customer_service' else 'merchant' end;
  v_name text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_ticket from public.be_merchant_support_tickets where ticket_id=p_ticket_id;
  if not found then raise exception 'Support ticket not found or not permitted'; end if;
  if nullif(trim(p_message),'') is null then raise exception 'Message is required'; end if;
  select coalesce(full_name,email) into v_name from public.profiles where id=auth.uid();
  insert into public.be_merchant_support_messages
    (ticket_id, merchant_code, sender_user_id, sender_role, sender_name, message)
  values (p_ticket_id, v_ticket.merchant_code, auth.uid(), v_role, v_name, trim(p_message))
  returning message_id into v_id;
  update public.be_merchant_support_tickets
  set status=case when v_role='merchant' then 'awaiting_cs' else 'awaiting_merchant' end,
      updated_at=now()
  where ticket_id=p_ticket_id;
  return jsonb_build_object('ok',true,'message_id',v_id,'ticket_id',p_ticket_id);
end
$$;

create or replace function public.be_merchant_workspace_snapshot(
  p_merchant_code text default null,
  p_user_email text default null,
  p_limit integer default 500
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_code text := coalesce(public.be_current_merchant_code(), public.be_merchant_portal_resolve_code(p_merchant_code,p_user_email));
  v_base jsonb;
  v_tickets jsonb;
  v_messages jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_batches jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.be_is_merchant_staff() and v_code is distinct from public.be_current_merchant_code() then
    raise exception 'Merchant scope mismatch';
  end if;
  v_base := public.be_merchant_snapshot(v_code, p_user_email, least(coalesce(p_limit,500),1000));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc),'[]'::jsonb)
    into v_tickets from public.be_merchant_support_tickets t
    where t.merchant_code=v_code;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb)
    into v_messages from public.be_merchant_support_messages m
    where m.merchant_code=v_code;
  if to_regclass('public.be_app_notifications') is not null then
    execute $q$select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb)
      from public.be_app_notifications n where n.target_user_id=$1 limit $2$q$
      into v_notifications using auth.uid(), least(coalesce(p_limit,500),1000);
  end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]'::jsonb)
    into v_batches from public.be_merchant_data_batches b where b.merchant_code=v_code;
  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'merchant_code',v_code,'tickets',v_tickets,'messages',v_messages,
    'notifications',v_notifications,'data_batches',v_batches
  );
end
$$;

create or replace function public.be_merchant_period_report(
  p_from date,
  p_to date,
  p_service text default 'ALL'
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_rows jsonb;
  v_from date := coalesce(p_from, date_trunc('month',current_date)::date);
  v_to date := coalesce(p_to,current_date);
begin
  if v_to < v_from then raise exception 'Report end date must be on or after start date'; end if;
  v_snapshot := public.be_merchant_workspace_snapshot(public.be_current_merchant_code(), null, 1000);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(v_snapshot->'waybills',v_snapshot->'pickups','[]'::jsonb)) x
  where coalesce(nullif(left(coalesce(x->>'delivered_at',x->>'created_at',x->>'updated_at',''),10),''),v_from::text)::date
        between v_from and v_to
    and (upper(coalesce(p_service,'ALL'))='ALL'
      or upper(coalesce(x->>'service_type',x->>'delivery_type','NORMAL'))=upper(p_service));
  return jsonb_build_object(
    'merchant_code',public.be_current_merchant_code(),'from',v_from,'to',v_to,
    'service',coalesce(p_service,'ALL'),'rows',v_rows,
    'summary',jsonb_build_object(
      'total',jsonb_array_length(v_rows),
      'delivered',(select count(*) from jsonb_array_elements(v_rows) r
        where upper(coalesce(r->>'delivery_status',r->>'status','')) in ('DELIVERED','COMPLETED','DELIVERY_COMPLETED')),
      'cod_total',(select coalesce(sum(case when coalesce(r->>'cod_amount',r->>'final_cod','') ~ '^[0-9]+([.][0-9]+)?$'
        then coalesce(nullif(r->>'cod_amount',''),r->>'final_cod')::numeric else 0 end),0)
        from jsonb_array_elements(v_rows) r)
    ),
    'generated_at',now()
  );
end
$$;

create or replace function public.be_notify_merchant_on_cs_reply()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ticket public.be_merchant_support_tickets;
  v_account public.be_merchant_accounts;
begin
  if lower(new.sender_role) not in ('merchant','customer') then
    select * into v_ticket from public.be_merchant_support_tickets where ticket_id=new.ticket_id;
    select * into v_account from public.be_merchant_accounts
      where merchant_code=v_ticket.merchant_code and upper(status)='ACTIVE' limit 1;
    if v_account.auth_user_id is not null and to_regclass('public.be_app_notifications') is not null then
      begin
        execute $q$insert into public.be_app_notifications
          (target_user_id,target_user_code,target_email,target_role,notification_type,
           title,message,status,is_read,created_at)
          values ($1,$2,$3,'merchant','CS_REPLY','Customer Service replied',
                  $4,'unread',false,now())$q$
        using v_account.auth_user_id,v_account.merchant_code,v_account.email,
          'A reply was added to ticket '||new.ticket_id::text;
      exception when others then
        raise warning 'Merchant reply notification was not inserted: %',sqlerrm;
      end;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_be_notify_merchant_on_cs_reply on public.be_merchant_support_messages;
create trigger trg_be_notify_merchant_on_cs_reply
after insert on public.be_merchant_support_messages
for each row execute function public.be_notify_merchant_on_cs_reply();

grant select on public.be_merchant_accounts, public.be_merchant_support_messages,
  public.be_merchant_data_batches, public.be_merchant_data_rows to authenticated;
grant select on public.be_data_entry_merchant_registration_queue to authenticated;
grant insert on public.be_merchant_support_messages to authenticated;
grant execute on function public.be_merchant_submit_data_batch(jsonb,text,text) to authenticated;
grant execute on function public.be_merchant_submit_pickup_request(jsonb) to authenticated;
grant execute on function public.be_merchant_open_support_ticket(jsonb) to authenticated;
grant execute on function public.be_merchant_reply_support_ticket(uuid,text) to authenticated;
grant execute on function public.be_merchant_workspace_snapshot(text,text,integer) to authenticated;
grant execute on function public.be_merchant_period_report(date,date,text) to authenticated;
grant execute on function public.be_current_merchant_code() to authenticated;

revoke execute on function public.be_merchant_snapshot(text,text,integer) from public, authenticated;
revoke execute on function public.be_merchant_create_pickup_request(jsonb,text) from public, authenticated;
revoke execute on function public.be_merchant_create_support_ticket(jsonb,text) from public, authenticated;
revoke execute on function public.be_merchant_submit_data_batch(jsonb,text,text) from public;
revoke execute on function public.be_merchant_submit_pickup_request(jsonb) from public;
revoke execute on function public.be_merchant_open_support_ticket(jsonb) from public;
revoke execute on function public.be_merchant_reply_support_ticket(uuid,text) from public;
revoke execute on function public.be_merchant_workspace_snapshot(text,text,integer) from public;
revoke execute on function public.be_merchant_period_report(date,date,text) from public;

do $$
begin
  alter table public.be_merchant_portal_pickup_requests replica identity full;
  alter table public.be_merchant_support_tickets replica identity full;
  alter table public.be_merchant_support_messages replica identity full;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='be_merchant_portal_pickup_requests') then
    alter publication supabase_realtime add table public.be_merchant_portal_pickup_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='be_merchant_support_tickets') then
    alter publication supabase_realtime add table public.be_merchant_support_tickets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='be_merchant_support_messages') then
    alter publication supabase_realtime add table public.be_merchant_support_messages;
  end if;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
