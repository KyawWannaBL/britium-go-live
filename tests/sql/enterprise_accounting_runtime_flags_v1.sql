do $$
declare
  v_flags jsonb;
begin
  v_flags := public.be_accounting_get_flags_v1();

  if coalesce((v_flags->>'erpUiEnabled')::boolean,true)
     or coalesce((v_flags->>'syncEnabled')::boolean,true)
     or coalesce((v_flags->>'postingEnabled')::boolean,true)
     or coalesce((v_flags->>'reportsEnabled')::boolean,true) then
    raise exception 'accounting flags must default OFF: %',v_flags;
  end if;

  if (
    select count(*)
    from public.be_accounting_runtime_config
    where config_key in (
      'ERP_UI_ENABLED',
      'ACCOUNTING_SYNC_ENABLED',
      'GL_POSTING_ENABLED',
      'FINANCIAL_REPORTS_ENABLED'
    )
  ) <> 4 then
    raise exception 'required accounting runtime flags missing';
  end if;
  if public.be_accounting_post_event_v1(gen_random_uuid())->>'code' <> 'POSTING_DISABLED' then
    raise exception 'GL posting flag is not enforced';
  end if;

  if public.be_accounting_sync_run_v1(date '2099-01-01',date '2099-01-01',array['DELIVERY'])->>'code' <> 'SYNC_DISABLED' then
    raise exception 'accounting sync flag is not enforced';
  end if;
end $;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';

do $$
declare
  v_result jsonb;
begin
  v_result := public.be_accounting_set_flag_v1('ERP_UI_ENABLED',true,'unauthorized test');
  if coalesce(v_result->>'code','')<>'UNAUTHORIZED' then
    raise exception 'ordinary user changed ERP flag: %',v_result;
  end if;
end $$;
rollback;
