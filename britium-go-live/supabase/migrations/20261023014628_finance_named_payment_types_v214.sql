-- Extend the existing Finance review action without changing prior records.
do $migration$
declare
 definition text := pg_get_functiondef('public.be_finance_cod_review_action_v213(jsonb)'::regprocedure);
 old_types text := '(''CASH'',''BANK_TRANSFER'',''MOBILE_WALLET'',''QR'')';
 new_types text := '(''CASH'',''KBZ_PAY'',''WAVE_PAY'',''AYA_PAY'',''CB_PAY'',''BANK_TRANSFER'',''MOBILE_WALLET'',''QR'')';
begin
 if position(old_types in definition)=0 then
  raise exception 'Finance review payment validation does not match the expected version';
 end if;
 execute replace(definition,old_types,new_types);
end;
$migration$;
