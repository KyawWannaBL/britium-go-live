do $patch$
declare src text;
begin
 select pg_get_functiondef(p.oid) into src
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='be_ops_live_fleet_positions_v1'
 and pg_get_function_identity_arguments(p.oid)='';
 if src is null then raise exception 'LIVE_FLEET_READER_NOT_FOUND'; end if;
 if position('''supervisor'',''dispatcher'')' in src)=0 then
   raise exception 'UNEXPECTED_FUNCTION_BODY';
 end if;
 src:=replace(src,'''supervisor'',''dispatcher'')',
                    '''supervisor'',''dispatcher'',''dispatch'',''branch_office'',''branch_staff'',''branch_admin'')');
 execute src;
end
$patch$;