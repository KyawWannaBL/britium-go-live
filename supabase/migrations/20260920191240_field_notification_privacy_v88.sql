-- V88: restrict field-team notification visibility while preserving non-field operational access.
create or replace function public.be_app_notification_visible_to_current_user(
  p_target_user_id text,
  p_target_workforce_code text,
  p_target_user_code text,
  p_target_email text,
  p_target_user_email text,
  p_recipient_email text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_code text;
  v_is_field boolean:=false;
begin
  if v_uid is null then return false; end if;

  select
    true,
    upper(coalesce(
      nullif(btrim(w.workforce_code),''),
      nullif(btrim(w.worker_code),''),
      nullif(btrim(w.account_code),''),
      nullif(btrim(w.rider_code),''),
      nullif(btrim(w.driver_code),''),
      nullif(btrim(w.helper_code),'')
    ))
  into v_is_field,v_code
  from public.be_mobile_workforce_accounts w
  where w.auth_user_id=v_uid
    and coalesce(w.active,true)
    and coalesce(w.is_active,true)
  order by w.updated_at desc nulls last
  limit 1;

  if not coalesce(v_is_field,false) then
    return true;
  end if;

  return
    coalesce(p_target_user_id,'')=v_uid::text
    or (coalesce(v_code,'')<>'' and upper(coalesce(p_target_workforce_code,''))=v_code)
    or (coalesce(v_code,'')<>'' and upper(coalesce(p_target_user_code,''))=v_code)
    or (v_email<>'' and lower(coalesce(p_target_email,''))=v_email)
    or (v_email<>'' and lower(coalesce(p_target_user_email,''))=v_email)
    or (v_email<>'' and lower(coalesce(p_recipient_email,''))=v_email);
end;
$$;

revoke all on function public.be_app_notification_visible_to_current_user(text,text,text,text,text,text) from public,anon;
grant execute on function public.be_app_notification_visible_to_current_user(text,text,text,text,text,text) to authenticated;

drop policy if exists be_app_notifications_all_auth on public.be_app_notifications;
drop policy if exists be_app_notifications_read_all on public.be_app_notifications;
drop policy if exists be_app_notifications_select_auth on public.be_app_notifications;
drop policy if exists be_app_notifications_update_auth on public.be_app_notifications;
drop policy if exists be_app_notifications_write_all on public.be_app_notifications;
drop policy if exists be_uat_notifications_select on public.be_app_notifications;
drop policy if exists be_uat_notifications_update on public.be_app_notifications;
drop policy if exists be_uat_select_notifications on public.be_app_notifications;

drop policy if exists be_app_notifications_field_safe_select_v88 on public.be_app_notifications;
create policy be_app_notifications_field_safe_select_v88
on public.be_app_notifications
for select
to authenticated
using (
  public.be_app_notification_visible_to_current_user(
    target_user_id,
    target_workforce_code,
    target_user_code,
    target_email,
    target_user_email,
    recipient_email
  )
);

drop policy if exists be_app_notifications_field_safe_update_v88 on public.be_app_notifications;
create policy be_app_notifications_field_safe_update_v88
on public.be_app_notifications
for update
to authenticated
using (
  public.be_app_notification_visible_to_current_user(
    target_user_id,
    target_workforce_code,
    target_user_code,
    target_email,
    target_user_email,
    recipient_email
  )
)
with check (
  public.be_app_notification_visible_to_current_user(
    target_user_id,
    target_workforce_code,
    target_user_code,
    target_email,
    target_user_email,
    recipient_email
  )
);
