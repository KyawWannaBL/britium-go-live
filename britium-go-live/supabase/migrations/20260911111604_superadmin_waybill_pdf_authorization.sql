create or replace function public.be_superadmin_waybill_pdf_authorize_v1(p_way_ids text[],p_paper_size text default '4x6',p_label_size text default '4x6')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_access jsonb; v_role text; v_id text; v_ids text[]; v_result jsonb;
begin
 v_access:=public.be_data_entry_require_access_v57('update',false);
 v_role:=regexp_replace(lower(coalesce(v_access->>'actor_role','')),'[^a-z]','','g');
 if v_role<>'superadmin' then raise exception 'Superadmin permission is required for this PDF action.' using errcode='42501'; end if;
 select array_agg(distinct btrim(x)) into v_ids from unnest(p_way_ids) x where nullif(btrim(x),'') is not null;
 if coalesce(cardinality(v_ids),0)=0 or cardinality(v_ids)>500 then raise exception 'Select between 1 and 500 waybills.'; end if;
 if exists(select 1 from unnest(v_ids) x where not exists(
 select 1 from public.be_v32_parcels v join public.be_data_entry_parcel_details d on d.delivery_way_id=v.waybill_no
 where v.waybill_no=x and d.saved_at is not null and d.financial_validation_status='OK'
 )) then raise exception 'Only generated waybills with valid saved financial details can be printed.'; end if;
 foreach v_id in array v_ids loop
 perform pg_advisory_xact_lock(hashtextextended('WAYBILL_PRINT:'||v_id,0));
 v_result:=public.be_document_print_guard(jsonb_build_object('document_type','WAYBILL','document_no',v_id,
 'actor_email',v_access->>'actor_email','actor_role','superadmin','department','superadmin',
 'reason','Superadmin Print / Save PDF','paper_size',p_paper_size,'label_size',p_label_size,
 'output','BROWSER_PRINT_OR_PDF','audit_stage','AUTHORIZED'));
 if not coalesce((v_result->>'allowed')::boolean,false) then raise exception 'Print authorization failed.'; end if;
 end loop;
 return jsonb_build_object('allowed',true,'authorized_count',cardinality(v_ids));
end;
$$;
revoke all on function public.be_superadmin_waybill_pdf_authorize_v1(text[],text,text) from public,anon;
grant execute on function public.be_superadmin_waybill_pdf_authorize_v1(text[],text,text) to authenticated;