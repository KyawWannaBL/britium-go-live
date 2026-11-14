create or replace function public.be_approve_provider_change_request_v1(p_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $f$
declare r record; p record; v_role text; v_rate numeric; v_count int; v_previous text; v_rev int;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor') then raise exception 'MANAGER_REQUIRED' using errcode='42501'; end if;
 if length(btrim(coalesce(p_note,'')))<10 then raise exception 'REVIEW_NOTE_REQUIRED'; end if;
 select * into r from public.be_parcel_provider_change_requests_v1 where id=p_id for update;
 if not found or r.status <> 'PENDING_REVIEW' then raise exception 'REQUEST_NOT_PENDING'; end if;
 if r.requested_by=auth.uid() then raise exception 'SEPARATION_OF_DUTIES_REQUIRED'; end if;
 select * into p from public.be_data_entry_parcel_details where delivery_way_id=r.delivery_way_id order by updated_at desc limit 1 for update;
 if not found then raise exception 'PARCEL_NOT_FOUND'; end if;
 if p.closed_at is not null or p.inbound_scanned_at is not null or p.dispatch_scanned_at is not null or p.is_printed is true
 or upper(coalesce(p.parcel_status,'')) in ('DELIVERED','RETURNED','RTO','COMPLETED','CANCELLED','SETTLED')
 then raise exception 'PARCEL_ALREADY_IN_OPERATION'; end if;
 if p.financial_quote is not null or p.financial_calculated_at is not null or p.cod_amount is not null
 then raise exception 'FINANCIAL_RECALCULATION_REQUIRED'; end if;
 if exists(select 1 from public.be_dispatch_wayplan_assignments a where upper(btrim(a.way_id))=upper(btrim(r.delivery_way_id)))
 or exists(select 1 from public.be_finance_cod_settlements_v48 f where upper(btrim(f.delivery_way_id))=upper(btrim(r.delivery_way_id)))
 or exists(select 1 from public.be_cod_ledger c where upper(btrim(c.delivery_way_id))=upper(btrim(r.delivery_way_id)))
 then raise exception 'DOWNSTREAM_RECORD_EXISTS'; end if;
 select count(*),min(standard_rate_mmk) into v_count,v_rate
 from public.be_data_entry_tariff_catalog t where t.is_active and t.provider_code=r.requested_provider_code
 and public.be_data_entry_destination_key_v17(t.destination_key)=public.be_data_entry_destination_key_v17(p.township);
 if v_count<>1 or v_rate is null then raise exception 'TARIFF_NOT_UNIQUE_OR_MISSING'; end if;
 if coalesce(p.delivery_charges,0)<>v_rate or coalesce(p.delivery_fee,0)<>v_rate then raise exception 'TARIFF_RECALCULATION_REQUIRED'; end if;
 select override_provider_code,revision into v_previous,v_rev from public.be_parcel_provider_overrides_v1 where delivery_way_id=r.delivery_way_id for update;
 insert into public.be_parcel_provider_overrides_v1(delivery_way_id,automatic_provider_code,override_provider_code,override_reason,changed_by,changed_at,revision)
 values(r.delivery_way_id,r.automatic_provider_code,r.requested_provider_code,r.reason,auth.uid(),now(),1)
 on conflict(delivery_way_id) do update set automatic_provider_code=excluded.automatic_provider_code,override_provider_code=excluded.override_provider_code,override_reason=excluded.override_reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at,revision=public.be_parcel_provider_overrides_v1.revision+1;
 insert into public.be_parcel_provider_override_audit_v1(delivery_way_id,previous_provider_code,new_provider_code,reason,actor_id)
 values(r.delivery_way_id,coalesce(v_previous,r.automatic_provider_code),r.requested_provider_code,btrim(p_note),auth.uid());
 update public.be_parcel_provider_change_requests_v1 set status='APPLIED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note) where id=p_id;
 return jsonb_build_object('ok',true,'status','APPLIED','request_id',p_id,'provider',r.requested_provider_code,'tariff_unchanged',true);
end $f$;
revoke execute on function public.be_approve_provider_change_request_v1(uuid,text) from public,anon;
grant execute on function public.be_approve_provider_change_request_v1(uuid,text) to authenticated;