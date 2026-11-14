-- Normalize equivalent application role spellings before authorizing location edits.
-- This keeps the existing role boundary intact while accepting values such as
-- SUPERADMIN, SUPER_ADMIN, and "Super Administrator".
create or replace function private.be_location_editor_allowed_v10()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select auth.uid()) is not null
    and regexp_replace(
      upper(coalesce(public.be_current_user_role(), '')),
      '[^A-Z0-9]',
      '',
      'g'
    ) in (
      'APPOWNER',
      'SUPERADMIN',
      'SUPERADMINISTRATOR',
      'OPERATIONSADMIN',
      'DATAENTRY',
      'DATAENTRYADMIN',
      'DES'
    );
$$;

revoke all on function private.be_location_editor_allowed_v10() from public, anon;
grant execute on function private.be_location_editor_allowed_v10() to authenticated;

comment on function private.be_location_editor_allowed_v10() is
  'Authenticated location-editor authorization with normalized application role aliases.';
