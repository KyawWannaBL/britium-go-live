-- Existing HQ Warehouse procedures remain canonical; branch identities gain scoped entrypoints.
create or replace function public.be_branch_warehouse_scope_v1(p_write boolean default false)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return null;end if;
 return public.be_branch_department_scope_v1(null,p_write);
end $$;
create or replace function public.be_branch_warehouse_visible_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false);
begin
 if b is null then return true;end if;
 return exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=p_way and (
  exists(select 1 from public.be_portal_pickup_requests p where p.pickup_id=d.pickup_id and upper(p.branch_code)=b)
  or exists(select 1 from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 t on t.id=i.transfer_id where i.delivery_way_id=d.delivery_way_id and b in(t.from_branch,t.to_branch))
  or exists(select 1 from public.be_wayplan_membership_v40 m join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id where m.delivery_way_id=d.delivery_way_id and upper(w.branch_code)=b)
 ));
end $$;
create or replace function public.be_branch_warehouse_local_receipt_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false);
begin
 if b is null then return true;end if;
 return public.be_branch_parcel_at_v1(p_way,b) and exists(select 1 from public.be_warehouse_receipts_v36 r where r.delivery_way_id=p_way and upper(r.warehouse_code)=b||'-MAIN' and r.scanned_at is not null and r.scanned_at>=coalesce((select max(i.received_at) from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 t on t.id=i.transfer_id where i.delivery_way_id=p_way and t.to_branch=b),'-infinity'::timestamptz));
end $$;
revoke all on function public.be_branch_warehouse_local_receipt_v1(text) from public,anon,authenticated;
create or replace function public.be_branch_warehouse_require_way_v1(p_way text,p_operation text)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(true); w text:=upper(btrim(p_way));
begin
 if b is null then return null;end if;
 -- Same parcel lock as transfer creation: custody cannot move while a scan is committed.
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=w for update;
 if not found or not public.be_branch_parcel_at_v1(w,b) then raise exception 'BRANCH_CUSTODY_DENIED: acknowledge received interbranch parcels before scanning or staging' using errcode='42501';end if;
 if p_operation in('READY','DISPATCH','RETURN','RECEIPT_EDIT') and not public.be_branch_warehouse_local_receipt_v1(w) then raise exception 'LOCAL_RECEIPT_REQUIRED: scan this parcel into the receiving branch warehouse first';end if;
 if p_operation='DISPATCH' and not exists(select 1 from public.be_wayplan_membership_v40 m join public.be_wayplan_dispatches d on d.wayplan_id=m.wayplan_id where m.delivery_way_id=w and upper(d.branch_code)=b and exists(select 1 from public.be_wayplan_review_v43 rv where rv.wayplan_id=d.wayplan_id and rv.review_status='DISPATCH_READY') and m.membership_status='READY_FOR_DISPATCH' and upper(coalesce(d.wayplan_status,'')) not in('CANCELLED','COMPLETED')) then raise exception 'BRANCH_DISPATCH_WAYPLAN_REQUIRED';end if;
 return b;
end $$;
create or replace function public.be_branch_warehouse_resolve_v1(p_scan text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_warehouse_scope_v1(false); raw text:=upper(btrim(coalesce(p_scan,''))); matches jsonb; exact boolean;
begin
 if b is null then raise exception 'BRANCH_SCANNER_ONLY';end if;
 if raw !~ '^[A-Z0-9][A-Z0-9._-]{0,127}$' then return jsonb_build_object('ok',false,'error','INVALID_SCAN','message','Scan a canonical Delivery Way or source Way ID.');end if;
 select exists(select 1 from be_data_entry_parcel_details d where upper(d.delivery_way_id)=raw and public.be_branch_warehouse_visible_v1(d.delivery_way_id)) into exact;
 select coalesce(jsonb_agg(jsonb_build_object('canonical_id',d.delivery_way_id,'pickup_id',d.pickup_id,'waybill_no',coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id),'display_id',coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)) order by d.delivery_way_id),'[]') into matches
 from be_data_entry_parcel_details d where coalesce(d.parcel_status,'')<>'duplicate_archived' and public.be_branch_warehouse_visible_v1(d.delivery_way_id) and(
  (exact and upper(d.delivery_way_id)=raw) or(not exact and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=raw)
 );
 return jsonb_build_object('ok',jsonb_array_length(matches)>0,'matches',matches,'resolved_candidate_count',jsonb_array_length(matches),'error',case when jsonb_array_length(matches)=0 then 'WAYBILL_NOT_FOUND' end,'message',case when jsonb_array_length(matches)=0 then 'No related branch Way ID was found.' end,'branch_code',b);
end $$;
create or replace function public.be_branch_warehouse_fast_dispatch_v1(p_scan text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare found jsonb:=public.be_branch_warehouse_resolve_v1(p_scan); way text; b text; result jsonb;
begin
 if found->>'ok'<>'true' then return found;end if;
 if jsonb_array_length(found->'matches')<>1 then return found||jsonb_build_object('ok',false,'error','AMBIGUOUS_SCAN','message','Choose the canonical parcel before dispatch scanning.');end if;
 way:=found#>>'{matches,0,canonical_id}';b:=public.be_branch_warehouse_require_way_v1(way,'DISPATCH');
 result:=public.be_warehouse_dispatch_scan(way,public.be_warehouse_actor_email(),b||'-MAIN');
 return result||jsonb_build_object('canonical_id',way,'waybill_no',found#>>'{matches,0,waybill_no}','resolved_candidate_count',1,'branch_code',b);
end $$;
create or replace function public.be_branch_warehouse_rto_confirmed_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare outcome text;
begin
 if not public.be_branch_warehouse_visible_v1(p_way) then return false;end if;
 select upper(last_status) into outcome from be_delivery_attempt_state_v39 where delivery_way_id=p_way limit 1;
 if nullif(outcome,'') is not null then return outcome in('RTO','RETURN_TO_SENDER');end if;
 select upper(delivery_status) into outcome from be_dispatch_job_assignments where tracking_no=p_way order by updated_at desc nulls last limit 1;
 if nullif(outcome,'') is not null then return outcome in('RTO','RETURN_TO_SENDER');end if;
 select upper(coalesce(nullif(stop_status,''),nullif(rider_status,''),nullif(dispatch_status,''))) into outcome from be_wayplan_dispatch_stops where delivery_way_id=p_way order by updated_at desc nulls last,created_at desc nulls last limit 1;
 return coalesce(outcome in('RTO','RETURN_TO_SENDER'),false);
end $$;
revoke all on function public.be_branch_warehouse_scope_v1(boolean),public.be_branch_warehouse_visible_v1(text),public.be_branch_warehouse_require_way_v1(text,text),public.be_branch_warehouse_resolve_v1(text),public.be_branch_warehouse_fast_dispatch_v1(text),public.be_branch_warehouse_rto_confirmed_v1(text) from public,anon,authenticated;
