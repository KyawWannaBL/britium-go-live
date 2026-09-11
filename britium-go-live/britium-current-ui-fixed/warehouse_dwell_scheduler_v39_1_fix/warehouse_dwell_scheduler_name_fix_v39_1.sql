-- Britium Express
-- V39.1 warehouse dwell scheduler diagnostic-name compatibility fix
-- Safe to run after warehouse_dispatch_rto_alert_v39.sql

begin;

create or replace function public.be_warehouse_dwell_scheduler_status_v39()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  v_active boolean := false;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    return jsonb_build_object(
      'scheduler_available', false,
      'scheduled', false,
      'mode', 'ON_SCREEN_REFRESH',
      'message', 'pg_cron is not enabled; alerts still refresh whenever Warehouse or Warehouse Ops is opened'
    );
  end if;

  begin
    execute $q$
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'jobid', jobid,
              'jobname', jobname,
              'schedule', schedule,
              'command', command,
              'active', active
            )
            order by jobid desc
          ),
          '[]'::jsonb
        ),
        coalesce(bool_or(active), false)
      from cron.job
      where jobname in (
        'be-v39-warehouse-dwell-alerts',
        'warehouse-dwell-alert-v39-hourly'
      )
      or lower(coalesce(command, '')) like '%be_refresh_warehouse_dwell_alerts_v39%'
    $q$
    into v_jobs, v_active;
  exception when others then
    return jsonb_build_object(
      'scheduler_available', true,
      'scheduled', false,
      'mode', 'ON_SCREEN_REFRESH',
      'message', sqlerrm
    );
  end;

  return jsonb_build_object(
    'scheduler_available', true,
    'scheduled', v_active,
    'mode', case when v_active then 'HOURLY_DATABASE_JOB' else 'ON_SCREEN_REFRESH' end,
    'jobs', v_jobs
  );
end;
$$;

-- Idempotent guard: recognize either supported name or the target command.
-- Schedule the canonical job only when no equivalent active/inactive job exists.
do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      execute $q$
        select jobid
        from cron.job
        where jobname in (
          'be-v39-warehouse-dwell-alerts',
          'warehouse-dwell-alert-v39-hourly'
        )
        or lower(coalesce(command, '')) like '%be_refresh_warehouse_dwell_alerts_v39%'
        order by active desc, jobid desc
        limit 1
      $q$
      into v_job_id;

      if v_job_id is null then
        execute 'select cron.schedule($1,$2,$3)'
        into v_job_id
        using
          'be-v39-warehouse-dwell-alerts',
          '0 * * * *',
          'select public.be_refresh_warehouse_dwell_alerts_v39();';
      end if;
    exception when others then
      raise notice 'V39.1 scheduler guard could not verify/install the job: %', sqlerrm;
    end;
  end if;
end;
$$;

revoke all on function public.be_warehouse_dwell_scheduler_status_v39() from public, anon;
grant execute on function public.be_warehouse_dwell_scheduler_status_v39() to authenticated;

commit;

-- Verification
select public.be_warehouse_dwell_scheduler_status_v39();
