revoke all on function public.be_driver_update_delivery_status(text,text,text,text) from public,anon;
grant execute on function public.be_driver_update_delivery_status(text,text,text,text) to authenticated,service_role;
notify pgrst,'reload schema';