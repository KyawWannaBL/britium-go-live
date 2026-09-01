-- Close confirmed legacy SECURITY DEFINER write paths that lack caller
-- authorization. The guarded be_supervisor_assign_job(jsonb) remains available
-- to authenticated users. Finance V4 remains MUTATION_SHADOW.

revoke execute on function public.create_managed_user(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_managed_user(text, text, text, text, text)
  to service_role;

revoke execute on function public.change_user_password_2026_02_17_18_40(uuid, text)
  from public, anon, authenticated;
grant execute on function public.change_user_password_2026_02_17_18_40(uuid, text)
  to service_role;

revoke execute on function public.be_supervisor_assign_job(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.be_supervisor_assign_job(text, text, text, text, text, text, text, text)
  to service_role;

revoke execute on function public.be_warehouse_update_situation(text, uuid, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.be_warehouse_update_situation(text, uuid, text, text, text, text, text, text, text, text, text, text)
  to service_role;

revoke execute on function public.be_finance_action(jsonb)
  from public, anon, authenticated;
grant execute on function public.be_finance_action(jsonb)
  to service_role;
