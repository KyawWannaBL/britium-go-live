begin;

create or replace function public.be_accounting_sync_run_v1(
  p_from date,
  p_to date,
  p_sources text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_sources text[];
  v_source text;
  v_result jsonb;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_status text;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  v_sources := case
    when p_sources is null or cardinality(p_sources)=0 then
      array[
        'DELIVERY',
        'COD',
        'MERCHANT',
        'RIDER_COMMISSION',
        'MANUAL_FINANCE',
        'ADMIN_HR',
        'BRANCH_FINANCE'
      ]
    else p_sources
  end;

  insert into public.be_accounting_sync_runs(
    id,source_scope,period_from,period_to,status,started_by,metadata
  ) values (
    v_run_id,
    array_to_string(v_sources,','),
    p_from,
    p_to,
    'RUNNING',
    auth.uid(),
    jsonb_build_object('sources',to_jsonb(v_sources))
  );

  foreach v_source in array v_sources
  loop
    v_source := upper(btrim(coalesce(v_source,'')));

    begin
      case v_source
        when 'DELIVERY' then
          v_result := public.be_accounting_sync_delivery_v1(p_from,p_to);
        when 'COD' then
          v_result := public.be_accounting_sync_cod_v1(p_from,p_to);
        when 'MERCHANT' then
          v_result := public.be_accounting_sync_merchant_settlements_v1(p_from,p_to);
        when 'RIDER_COMMISSION' then
          v_result := public.be_accounting_sync_rider_commissions_v1(p_from,p_to);
        when 'MANUAL_FINANCE' then
          v_result := public.be_accounting_sync_manual_finance_v1(p_from,p_to);
        when 'ADMIN_HR' then
          v_result := public.be_accounting_sync_hr_assets_v1(p_from,p_to);
        when 'BRANCH_FINANCE' then
          v_result := public.be_accounting_sync_branch_finance_v1(p_from,p_to);
        else
          v_result := jsonb_build_object(
            'ok',false,
            'code','UNSUPPORTED_SOURCE',
            'source',v_source
          );
      end case;

      if coalesce((v_result->>'ok')::boolean,false) then
        v_scanned := v_scanned + coalesce((v_result->>'scanned')::integer,0);
        v_synced := v_synced + coalesce((v_result->>'synced')::integer,0);
        v_skipped := v_skipped
          + coalesce((v_result->>'skipped')::integer,0)
          + coalesce((v_result->>'held')::integer,0)
          + coalesce((v_result->>'needs_review')::integer,0);
      else
        v_failed := v_failed+1;
        insert into public.be_accounting_sync_errors(
          sync_run_id,source_system,source_table,error_code,error_message,source_snapshot
        ) values (
          v_run_id,
          'ACCOUNTING_SYNC',
          lower(v_source),
          coalesce(v_result->>'code','ADAPTER_FAILED'),
          coalesce(v_result->>'message',v_result::text),
          jsonb_build_object('source',v_source,'result',v_result)
        );
      end if;
    exception
      when others then
        v_failed := v_failed+1;
        insert into public.be_accounting_sync_errors(
          sync_run_id,source_system,source_table,error_code,error_message,source_snapshot
        ) values (
          v_run_id,
          'ACCOUNTING_SYNC',
          lower(v_source),
          sqlstate,
          sqlerrm,
          jsonb_build_object('source',v_source,'period_from',p_from,'period_to',p_to)
        );
    end;
  end loop;

  v_status := case when v_failed>0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end;

  update public.be_accounting_sync_runs
  set status=v_status,
      scanned_count=v_scanned,
      synced_count=v_synced,
      skipped_count=v_skipped,
      failed_count=v_failed,
      completed_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'sources',to_jsonb(v_sources),
          'completed_status',v_status
        )
  where id=v_run_id;

  return jsonb_build_object(
    'ok',true,
    'code','SYNC_RUN_COMPLETE',
    'run_id',v_run_id,
    'status',v_status,
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped,
    'failed',v_failed
  );
exception
  when others then
    update public.be_accounting_sync_runs
    set status='FAILED',
        failed_count=greatest(failed_count,1),
        completed_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('fatal_error',sqlerrm,'sqlstate',sqlstate)
    where id=v_run_id;

    raise;
end;
$$;

revoke all on function public.be_accounting_sync_run_v1(date,date,text[])
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_run_v1(date,date,text[])
to service_role;

comment on function public.be_accounting_sync_run_v1(date,date,text[]) is
  'Fault-isolated orchestration across accounting source adapters. Each source failure is recorded without rolling back successful adapters.';

commit;
