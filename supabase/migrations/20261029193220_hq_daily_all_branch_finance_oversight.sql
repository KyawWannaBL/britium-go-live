-- Yangon Head Office Finance monitors every active branch through existing controls.
-- Counted cash and reviewed expenses are not verified receipts or posted payments.
alter table public.be_branch_control_records_v1 add column if not exists business_date date;
update public.be_branch_control_records_v1 set business_date=(created_at at time zone 'Asia/Yangon')::date where business_date is null;
alter table public.be_branch_control_records_v1 alter column business_date set default public.be_business_date();
alter table public.be_branch_control_records_v1 alter column business_date set not null;
create index if not exists be_branch_control_business_date_idx on public.be_branch_control_records_v1(branch_code,business_date,kind);

do $patch$
declare definition text; old_columns text:='branch_code,kind,title,amount,reference,evidence,notes,created_by)'; old_value text:='coalesce(p->>''notes'',''''),auth.uid())';
begin
 select pg_get_functiondef('public.be_branch_control_action_v1(jsonb)'::regprocedure) into definition;
 if strpos(definition,'BRANCH_FINANCE_BUSINESS_DATE_V1')>0 then return; end if;
 if strpos(definition,old_columns)=0 or strpos(definition,old_value)=0 then raise exception 'Review branch submission function before adding business dates'; end if;
 definition:=replace(definition,old_columns,'branch_code,kind,title,amount,reference,evidence,notes,created_by,business_date)');
 definition:=replace(definition,old_value,'coalesce(p->>''notes'',''''),auth.uid(),coalesce(nullif(p->>''business_date'','''')::date,public.be_business_date()))');
 definition:=replace(definition,'if a=''SUBMIT_RECORD'' then',$injection$if a='SUBMIT_RECORD' then
  -- BRANCH_FINANCE_BUSINESS_DATE_V1
  if p->>'kind'='DAILY_CLOSE' and coalesce(nullif(p->>'business_date','')::date,public.be_business_date())>public.be_business_date() then raise exception 'FUTURE_CASH_CLOSE_DENIED'; end if;
$injection$);
 execute definition;
end $patch$;

-- Keep pending requests available when newer reviewed documents fill the detail cap.
do $pending_first$
declare definition text;
begin
 select pg_get_functiondef('public.be_branch_control_snapshot_v1(text)'::regprocedure) into definition;
 definition:=replace(definition,E'\r','');
 if strpos(definition,'BRANCH_PENDING_FIRST_V1')>0 then return; end if;
 if strpos(definition,'order by created_at desc limit 500')=0 then raise exception 'Review branch snapshot pagination before enabling pending-first review'; end if;
 definition:=replace(definition,'order by created_at desc limit 500','order by case when status=''SUBMITTED'' then 0 else 1 end,created_at desc limit 500 /* BRANCH_PENDING_FIRST_V1 */');
 execute definition;
end $pending_first$;

create or replace function public.be_branch_finance_oversight_v1(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare scope text; r text:=replace(public.be_current_role(),'-','_'); day date:=coalesce(p_day,public.be_business_date()); rows jsonb;
begin
 scope:=public.be_branch_control_scope_v1(null);
 if scope is not null or r not in('finance','finance_user','finance_manager','accountant','superadmin','super_admin','app_owner','sys') then
  raise exception 'HQ_FINANCE_REQUIRED' using errcode='42501';
 end if;
 with daily as(select * from public.be_branch_control_records_v1 where business_date=day),
 cash as(select branch_code,count(*) reports,count(*) filter(where status<>'REJECTED') usable_reports,max(status) filter(where status<>'REJECTED') status,max(amount) filter(where status<>'REJECTED') amount from daily where kind='DAILY_CLOSE' group by branch_code),
 expenses as(select branch_code,coalesce(sum(amount) filter(where status='SUBMITTED'),0) pending,coalesce(sum(amount) filter(where status='APPROVED'),0) reviewed from daily where kind='EXPENSE' group by branch_code),
 requirements as(select branch_code,count(*) pending_reviews,coalesce(sum(amount) filter(where kind='SETUP' and amount>0),0) funding from public.be_branch_control_records_v1 where business_date<=day and status='SUBMITTED' group by branch_code)
 select coalesce(jsonb_agg(jsonb_build_object('branch_code',b.branch_code,'branch_name',b.branch_name,'opening_date',b.opening_date,
 'cash_status',case when b.opening_date>day then 'PRE_OPENING' when coalesce(c.reports,0)=0 then 'NOT_REPORTED' when c.usable_reports=0 then 'REJECTED' when c.usable_reports>1 then 'MULTIPLE_REPORTS' else c.status end,
 'cash_report_count',coalesce(c.reports,0),'counted_cash',case when c.usable_reports=1 and (b.opening_date is null or b.opening_date<=day) then c.amount end,
 'cash_verified',false,'pending_expenses',coalesce(e.pending,0),'reviewed_expenses',coalesce(e.reviewed,0),'funding_requests',coalesce(q.funding,0),'pending_reviews',coalesce(q.pending_reviews,0)) order by b.branch_code),'[]'::jsonb)
 into rows from public.be_branch_offices b left join cash c using(branch_code) left join expenses e using(branch_code) left join requirements q using(branch_code)
 where coalesce(b.active,true) and lower(coalesce(b.status,'active')) not in('inactive','closed','abolished','rejected');
 return jsonb_build_object('ok',true,'business_date',day,'time_zone','Asia/Yangon','branches',rows,'as_of',now(),'cash_counts_are_verified_receipts',false,'review_is_payment',false);
end $$;
revoke all on function public.be_branch_finance_oversight_v1(date) from public,anon;
grant execute on function public.be_branch_finance_oversight_v1(date) to authenticated;
