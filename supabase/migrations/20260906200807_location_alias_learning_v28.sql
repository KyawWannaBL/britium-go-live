do $$
begin
  if to_regclass('public.be_location_aliases') is null
     or to_regprocedure('public.be_location_alias_resolve_v28(text,text)') is null then
    raise exception 'V28 location alias objects are incomplete';
  end if;
end
$$;