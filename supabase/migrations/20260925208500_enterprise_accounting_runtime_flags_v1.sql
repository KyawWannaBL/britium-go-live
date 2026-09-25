begin;

create table public.be_accounting_runtime_config (
  config_key text primary key,
  boolean_value boolean not null,
  description text null,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (
    config_key in (
      'ERP_UI_ENABLED',
      'ACCOUNTING_SYNC_ENABLED',
      'GL_POSTING_ENABLED',
      'FINANCIAL_REPORTS_ENABLED'
    )
  )
);

insert into public.be_accounting_runtime_config(config_key,boolean_value,description)
values
  ('ERP_UI_ENABLED',false,'Expose ERP accounting navigation and screens.'),
  ('ACCOUNTING_SYNC_ENABLED',false,'Permit operational-to-accounting synchronization runs.'),
  ('GL_POSTING_ENABLED',false,'Permit posting approved accounting events to the General Ledger.'),
  ('FINANCIAL_REPORTS_ENABLED',false,'Expose ledger-backed production financial reports.')
on conflict (config_key) do nothing;

alter table public.be_accounting_runtime_config enable row level security;

revoke all on public.be_accounting_runtime_config from public,anon,authenticated;
grant select on public.be_accounting_runtime_config to authenticated;
grant all on public.be_accounting_runtime_config to service_role;

drop policy if exists be_accounting_runtime_config_select_v1
on public.be_accounting_runtime_config;
create policy be_accounting_runtime_config_select_v1
on public.be_accounting_runtime_config
for select
to authenticated
using (
  public.be_accounting_can_v1('finance_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('asset_entry')
  or public.be_accounting_can_v1('ledger_admin')
);

create or replace function public.be_accounting_get_flags_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'erpUiEnabled',
      coalesce(max(boolean_value::int) filter (where config_key='ERP_UI_ENABLED'),0)::boolean,
    'syncEnabled',
      coalesce(max(boolean_value::int) filter (where config_key='ACCOUNTING_SYNC_ENABLED'),0)::boolean,
    'postingEnabled',
      coalesce(max(boolean_value::int) filter (where config_key='GL_POSTING_ENABLED'),0)::boolean,
    'reportsEnabled',
      coalesce(max(boolean_value::int) filter (where config_key='FINANCIAL_REPORTS_ENABLED'),0)::boolean
  )
  from public.be_accounting_runtime_config
$$;

create or replace function public.be_accounting_set_flag_v1(
  p_key text,
  p_value boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_key text := upper(btrim(coalesce(p_key,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_old boolean;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if v_key not in (
    'ERP_UI_ENABLED',
    'ACCOUNTING_SYNC_ENABLED',
    'GL_POSTING_ENABLED',
    'FINANCIAL_REPORTS_ENABLED'
  ) then
    return jsonb_build_object('ok',false,'code','INVALID_FLAG','key',v_key);
  end if;

  if v_reason='' then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED','key',v_key);
  end if;

  select boolean_value
  into v_old
  from public.be_accounting_runtime_config
  where config_key=v_key
  for update;

  update public.be_accounting_runtime_config
  set boolean_value=coalesce(p_value,false),
      updated_by=auth.uid(),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object('last_change_reason',v_reason)
  where config_key=v_key;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_runtime_config',
    null,
    'UPDATE',
    jsonb_build_object('config_key',v_key,'boolean_value',v_old),
    jsonb_build_object('config_key',v_key,'boolean_value',coalesce(p_value,false)),
    v_reason,
    null,
    jsonb_build_object('function','be_accounting_set_flag_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code','FLAG_UPDATED',
    'key',v_key,
    'value',coalesce(p_value,false)
  );
end;
$$;

revoke all on function public.be_accounting_get_flags_v1() from public,anon;
grant execute on function public.be_accounting_get_flags_v1() to authenticated,service_role;

revoke all on function public.be_accounting_set_flag_v1(text,boolean,text)
from public,anon;
grant execute on function public.be_accounting_set_flag_v1(text,boolean,text)
to authenticated,service_role;

comment on table public.be_accounting_runtime_config is
  'Runtime rollout gates for Britium ERP accounting. All flags default false.';
comment on function public.be_accounting_set_flag_v1(text,boolean,text) is
  'Superadmin-only audited accounting rollout flag control.';

commit;
