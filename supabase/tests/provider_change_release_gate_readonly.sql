-- Britium Express: read-only provider-change release gate.
-- Execute in staging and review output before production promotion.
-- Do not fabricate approvals or alter COD/dispatch records.
with functions as (
 select
 to_regprocedure('public.be_request_parcel_provider_change_v1(text,text,text)') is not null request_function,
 to_regprocedure('public.be_review_provider_change_requests_v1()') is not null review_function,
 to_regprocedure('public.be_reject_provider_change_request_v1(uuid,text)') is not null reject_function,
 to_regprocedure('public.be_approve_provider_change_request_v1(uuid,text)') is not null approve_function,
 to_regprocedure('public.be_provider_change_preflight_v1(uuid)') is not null preflight_function,
 not has_function_privilege('anon','public.be_approve_provider_change_request_v1(uuid,text)','EXECUTE') anon_approval_blocked,
 not has_function_privilege('anon','public.be_reject_provider_change_request_v1(uuid,text)','EXECUTE') anon_rejection_blocked
), activity as (
 select
 (select count(*) from public.be_parcel_provider_change_requests_v1 where status='PENDING_REVIEW') pending,
 (select count(*) from public.be_parcel_provider_change_requests_v1 where status='APPLIED') applied,
 (select count(*) from public.be_parcel_provider_overrides_v1) overrides,
 (select count(*) from public.be_parcel_provider_override_audit_v1) audit_events
)
select f.*,a.*,
 (f.request_function and f.review_function and f.reject_function and f.approve_function and f.preflight_function and f.anon_approval_blocked and f.anon_rejection_blocked) security_gate_pass,
 case when a.applied=0 then 'NOT_TESTED: no approved provider changes to reconcile'
 when a.audit_events<a.applied then 'FAIL: fewer audit events than applied requests'
 else 'REVIEW_REQUIRED: inspect each applied way against warehouse, wayplan, tariff and finance' end reconciliation_status
from functions f cross join activity a;
-- Separate required UAT: two distinct authenticated accounts request/approve a test way.
-- Verify receiving/warehouse, wayplan, COD, tariff and ledger through the application.
-- Do not promote solely from a READY build or the security_gate_pass flag.
