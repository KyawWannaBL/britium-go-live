begin;

create or replace function public.be_accounting_review_event_v1(
  p_event_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_event public.be_accounting_events%rowtype;
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_next_status text;
begin
  if not public.be_accounting_can_v1('finance_review') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if v_action not in ('APPROVE','HOLD','REJECT','INVESTIGATE') then
    return jsonb_build_object('ok',false,'code','INVALID_ACTION','action',v_action);
  end if;

  if v_action in ('HOLD','REJECT','INVESTIGATE') and v_reason='' then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED','action',v_action);
  end if;

  select *
  into v_event
  from public.be_accounting_events
  where id=p_event_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','EVENT_NOT_FOUND','event_id',p_event_id);
  end if;

  if v_event.review_status in ('POSTED','REVERSED','REJECTED','APPROVED') then
    return jsonb_build_object(
      'ok',false,
      'code','INVALID_STATE',
      'event_id',v_event.id,
      'status',v_event.review_status
    );
  end if;

  if v_action='APPROVE' and v_event.review_status not in ('REVIEW_PENDING','NEEDS_REVIEW') then
    return jsonb_build_object(
      'ok',false,'code','INVALID_STATE','event_id',v_event.id,'status',v_event.review_status
    );
  end if;

  if v_action='HOLD' and v_event.review_status not in ('REVIEW_PENDING','NEEDS_REVIEW') then
    return jsonb_build_object(
      'ok',false,'code','INVALID_STATE','event_id',v_event.id,'status',v_event.review_status
    );
  end if;

  if v_action='REJECT' and v_event.review_status not in ('REVIEW_PENDING','NEEDS_REVIEW','HELD') then
    return jsonb_build_object(
      'ok',false,'code','INVALID_STATE','event_id',v_event.id,'status',v_event.review_status
    );
  end if;

  if v_action='INVESTIGATE' and v_event.review_status not in ('REVIEW_PENDING','HELD') then
    return jsonb_build_object(
      'ok',false,'code','INVALID_STATE','event_id',v_event.id,'status',v_event.review_status
    );
  end if;

  v_next_status := case v_action
    when 'APPROVE' then 'APPROVED'
    when 'HOLD' then 'HELD'
    when 'REJECT' then 'REJECTED'
    when 'INVESTIGATE' then 'NEEDS_REVIEW'
  end;

  update public.be_accounting_events
  set review_status=v_next_status,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'last_review_action',v_action,
          'last_review_reason',nullif(v_reason,''),
          'last_reviewed_at',now()
        ),
      updated_at=now()
  where id=v_event.id;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_events',
    v_event.id,
    v_action,
    to_jsonb(v_event),
    jsonb_build_object(
      'review_status',v_next_status,
      'reviewed_by',auth.uid(),
      'reviewed_at',now()
    ),
    nullif(v_reason,''),
    v_event.posted_journal_id,
    jsonb_build_object('function','be_accounting_review_event_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code',v_next_status,
    'event_id',v_event.id,
    'status',v_next_status
  );
end;
$$;

revoke all on function public.be_accounting_review_event_v1(uuid,text,text)
from public,anon;
grant execute on function public.be_accounting_review_event_v1(uuid,text,text)
to authenticated,service_role;

comment on function public.be_accounting_review_event_v1(uuid,text,text) is
  'Audited Finance Review Queue state transition. Direct event UPDATE remains unavailable to clients.';

commit;
