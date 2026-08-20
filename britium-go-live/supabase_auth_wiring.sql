-- Optional backend support for must-change-password and signup requests.
-- Run only after checking your existing schema names.

alter table if exists public.be_user_account_registry
  add column if not exists must_change_password boolean default false,
  add column if not exists force_password_change boolean default false,
  add column if not exists password_changed_at timestamptz;

alter table if exists public.be_mobile_workforce_accounts
  add column if not exists must_change_password boolean default false,
  add column if not exists force_password_change boolean default false,
  add column if not exists password_changed_at timestamptz;

create table if not exists public.be_signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  requested_role text not null,
  signup_mode text not null default 'portal',
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create or replace function public.be_submit_signup_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.be_signup_requests (
    full_name,
    email,
    phone,
    requested_role,
    signup_mode,
    status
  )
  values (
    p_payload->>'full_name',
    p_payload->>'email',
    p_payload->>'phone',
    p_payload->>'requested_role',
    coalesce(p_payload->>'signup_mode', 'portal'),
    coalesce(p_payload->>'status', 'PENDING')
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'PENDING');
end;
$$;

create or replace function public.be_complete_password_change(p_mode text default 'portal')
returns jsonb
language plpgsql
security definer
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_mode = 'rider' then
    update public.be_mobile_workforce_accounts
    set must_change_password = false,
        force_password_change = false,
        password_changed_at = now()
    where auth_user_id = v_uid;
  else
    update public.be_user_account_registry
    set must_change_password = false,
        force_password_change = false,
        password_changed_at = now()
    where auth_user_id = v_uid;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
