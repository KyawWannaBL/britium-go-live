-- Integration regression: run on a test database with active Superadmin/nonadmin principals and an unprinted generated waybill.
-- Every authorization and audit write is rolled back.

begin;
do $$
declare admin_id uuid; other_id uuid; way text; r jsonb; req uuid; n integer; denied boolean;
begin
 select auth_user_id into admin_id from public.be_user_account_registry
 where status='active' and regexp_replace(lower(role),'[^a-z]','','g')='superadmin' and auth_user_id is not null limit 1;
 if admin_id is null then raise exception 'No test principal'; end if;
 select auth_user_id into other_id from public.be_user_account_registry
 where status='active' and regexp_replace(lower(role),'[^a-z]','','g')<>'superadmin' and auth_user_id is not null limit 1;
 select p.waybill_no into way from public.be_v32_parcels p join public.be_data_entry_parcel_details d on d.delivery_way_id=p.waybill_no
 where d.saved_at is not null and d.financial_validation_status='OK'
 and not exists(select 1 from public.be_document_print_log l where l.document_type='WAYBILL' and l.document_no=p.waybill_no)
 and not exists(select 1 from public.be_waybill_print_audit_v38 a where a.pickup_id=p.pickup_id and upper(a.document_type)='WAYBILL') limit 1;
 if way is null then raise exception 'No unprinted test waybill'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 r:=public.be_waybill_print_release_v2(array[way,way]);
 if (r->>'authorized_count')::int<>1 then raise exception 'First print/dedup failed: %',r; end if;
 r:=public.be_waybill_print_release_v2(array[way]);
 if (r->>'authorized_count')::int<>0 then raise exception 'Superadmin bypass'; end if;
 denied:=false;
 begin perform public.be_waybill_print_release_v2(array[way],'4x6','4x6',' ',true); exception when others then denied:=true; end;
 if not denied then raise exception 'Blank reason accepted'; end if;
 perform public.be_waybill_print_release_v2(array[way],'4x6','4x6','TRANSACTION-ONLY TEST: printer jam',true);
 perform public.be_waybill_print_release_v2(array[way],'4x6','4x6','Duplicate request test',true);
 select count(*),(array_agg(id))[1] into n,req from public.be_document_print_approval_requests
 where document_no=way and requested_print_count=1 and consumed_at is null;
 if n<>1 then raise exception 'Duplicate request'; end if;
 if other_id is null then raise exception 'No non-Superadmin test principal'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 denied:=false;
 begin perform public.be_waybill_reprint_decide_v2(req,'APPROVED'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Nonadmin approved'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 perform public.be_waybill_reprint_decide_v2(req,'APPROVED','Transaction-only test');
 r:=public.be_waybill_print_release_v2(array[way],'A4','4x6');
 if (r->>'authorized_count')::int<>1 then raise exception 'Approved release failed'; end if;
 if not exists(select 1 from public.be_document_print_approval_requests where id=req and consumed_at is not null and consumed_print_log_id is not null) then raise exception 'Approval not consumed'; end if;
 r:=public.be_waybill_print_release_v2(array[way]);
 if (r->>'authorized_count')::int<>0 then raise exception 'Approval reused'; end if;
 r:=public.be_document_print_guard(jsonb_build_object('document_type','WAYBILL','document_no',way,'actor_role','superadmin'));
 if coalesce((r->>'allowed')::boolean,false) then raise exception 'Legacy guard bypass'; end if;
 denied:=false;
 begin perform public.be_superadmin_waybill_pdf_authorize_v1(array[way]); exception when others then denied:=true; end;
 if not denied then raise exception 'Old PDF bypass'; end if;
 perform set_config('request.jwt.claims','{}',true);
 denied:=false;
 begin perform public.be_document_print_approve(jsonb_build_object('document_type','WAYBILL','request_id',req,'actor_role','superadmin')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Spoofed role accepted'; end if;
end $$;
rollback;
select 'PASS: first release, deduplication, mandatory reason, duplicate request prevention, Superadmin-only approval, single-use consumption, legacy/PDF bypass denial, spoofed-role denial. All test writes rolled back.' as verification;
