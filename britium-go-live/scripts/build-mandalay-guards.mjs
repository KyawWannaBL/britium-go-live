import fs from 'node:fs';
const defs=new Map([...JSON.parse(fs.readFileSync('scripts/fixtures/mandalay-live-functions.json')), ...JSON.parse(fs.readFileSync('scripts/fixtures/mandalay-extra-functions.json')), ...JSON.parse(fs.readFileSync('scripts/fixtures/mandalay-scan-functions.json'))].map(x=>[x.proname,x.definition.replace(/\r/g,'')]));
const out=[];
function change(name,fn){if(!defs.has(name))throw Error(name);out.push(fn(defs.get(name)).trim()+';');}
function entry(s,code){if(!/\nbegin\n/i.test(s))throw Error('No body');return s.replace(/\nbegin\n/i,'\nbegin\n  '+code+'\n');}
const idActions={be_wayplan_supervisor_decide_v43:'p_wayplan_id',be_wayplan_supervisor_assign_crew_v68:'p_wayplan_id',be_wayplan_submit_review_v43:'p_wayplan_id',be_wayplan_prepare_dispatch_v43:'p_wayplan_id',be_dispatch_publish_wayplan_v43:'p_wayplan_id',be_created_wayplan_revision_snapshot_v46:'p_wayplan_id',be_dispatch_start_wayplan:"p_payload->>'wayplan_id'",be_wayplan_update_status:"p_payload->>'wayplan_id'",be_replace_created_wayplan_v46:"p_payload->>'source_wayplan_id'",be_delete_created_wayplan_v55:"p_payload->>'wayplan_id'"};
for(const [n,arg] of Object.entries(idActions))change(n,s=>{
 s=entry(s,`perform public.be_branch_require_wayplan_v1(${arg});`);
 if(['be_replace_created_wayplan_v46','be_wayplan_supervisor_assign_crew_v68'].includes(n))s=s.replace(/'superadmin','super_admin'/,"'branch-manager','branch_manager','branch_office_manager','superadmin','super_admin'");
 if(n==='be_delete_created_wayplan_v55')s=entry(s,"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then raise exception 'HEAD_OFFICE_DELETE_REQUIRED'; end if;");
 return s;
});
for(const n of ['be_generate_multi_van_v43','be_generate_wayplan_v18_legacy','be_generate_wayplan_emergency_crew_v1'])change(n,s=>{
 s=entry(s,"perform public.be_branch_require_region_v1(p_payload->>'region_code'); if p_payload ? 'branch_code' then perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;");
 if(n!=='be_generate_multi_van_v43')s=entry(s,"if exists(select 1 from public.be_wayplan_dispatches w where w.wayplan_id=p_payload->>'wayplan_id') then perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id'); end if; p_payload:=p_payload||jsonb_build_object('branch_code',case upper(p_payload->>'region_code') when 'MANDALAY' then 'MDY' when 'YANGON' then 'YGN' when 'NAYPYITAW' then 'NPT' end);");
 if(n!=='be_generate_multi_van_v43')s=entry(s,"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') and exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'delivery_way_ids','[]'::jsonb)) x where not public.be_branch_parcel_at_v1(x,public.be_branch_scope_v1(null))) then raise exception 'DESTINATION_RECEIPT_REQUIRED'; end if;");
 if(n==='be_generate_wayplan_emergency_crew_v1')s=s.replace(/'superadmin','super_admin'/,"'branch-manager','branch_manager','branch_office_manager','superadmin','super_admin'");
 return s;
});
change('be_wayplan_visible_queue_v124',s=>entry(s,"perform public.be_branch_require_region_v1(p_region_code);").replace('where d.delivery_region=v_region',"where (replace(public.be_current_role(),'-','_') not in ('branch_manager','branch_office_manager') or public.be_branch_parcel_at_v1(d.delivery_way_id,public.be_branch_scope_v1(null))) and d.delivery_region=v_region"));
change('be_multi_van_queue',s=>entry(s,'perform public.be_branch_require_region_v1(p_region);'));
change('be_wayplan_command_center',s=>entry(s,'perform public.be_branch_scope_v1(null);').replace('where created_at >=','where public.be_branch_wayplan_allowed_v1(wayplan_id) and created_at >='));
change('be_wayplan_supervisor_list_v62',s=>s.replace('d.wayplan_id,','d.branch_code,d.wayplan_id,').replace('where upper(coalesce(d.wayplan_status',"where public.be_branch_wayplan_allowed_v1(d.wayplan_id) and upper(coalesce(d.wayplan_status"));
change('be_wayplan_supervisor_detail_v62',s=>s.replace('d.wayplan_id,','d.branch_code,d.wayplan_id,').replace('where d.wayplan_id=p_wayplan_id','where d.wayplan_id=p_wayplan_id and public.be_branch_wayplan_allowed_v1(d.wayplan_id)').replace('where s.wayplan_id=p_wayplan_id','where s.wayplan_id=p_wayplan_id and public.be_branch_wayplan_allowed_v1(s.wayplan_id)'));
change('be_multi_van_context',s=>{
 s=entry(s,'perform public.be_branch_scope_v1(null);').replace(/'superadmin','super_admin'/,"'branch-manager','branch_manager','branch_office_manager','superadmin','super_admin'");
 s=s.replace("where dataset_key='fleet_master'","where (public.be_branch_scope_v1(null) is null or payload->>'branch_code'=public.be_branch_scope_v1(null)) and dataset_key='fleet_master'");
 s=s.replace("where upper(coalesce(wayplan_status", "where public.be_branch_wayplan_allowed_v1(wayplan_id) and upper(coalesce(wayplan_status");
 s=s.replace("where branch_code in ('YGN'", "where (public.be_branch_scope_v1(null) is null or branch_code=public.be_branch_scope_v1(null)) and branch_code in ('YGN'");
 return s;
});
change('be_wayplan_assignment_options_v44',s=>s.replaceAll("and a.active;","and a.active and (public.be_branch_scope_v1(null) is null or upper(a.branch_code)=public.be_branch_scope_v1(null));"));
change('be_branch_office_snapshot',s=>entry(s,'p_branch_code:=public.be_branch_scope_v1(p_branch_code);'));
change('be_branch_amendment_request',s=>entry(s,"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then v_branch_code:=public.be_branch_scope_v1(p_payload->>'branch_code'); else perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;"));
change('be_branch_amendment_decide',s=>entry(s,"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager','branch_staff','branch_office') then raise exception 'HEAD_OFFICE_APPROVAL_REQUIRED'; end if;"));
change('be_warehouse_dispatch_scan',s=>s.replace('v_role:=public.be_warehouse_assert_internal();',"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then v_role:=public.be_current_role(); perform public.be_branch_scope_v1(null); else v_role:=public.be_warehouse_assert_internal(); end if;").replace("v_review_status:=v_stage->>'supervisor_review_status';","perform public.be_branch_require_wayplan_v1(v_wayplan); v_review_status:=v_stage->>'supervisor_review_status';"));
change('be_dispatch_scan_parcel_v39',s=>s.replace('v_role := public.be_warehouse_assert_internal();',"if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then perform public.be_branch_require_wayplan_v1(p_wayplan_code); v_role:=public.be_current_role(); else v_role := public.be_warehouse_assert_internal(); end if;"));
const base=fs.readFileSync('scripts/mandalay-controls-core.sql','utf8');
fs.writeFileSync('supabase/migrations/20261029112558_mandalay_branch_controls.sql',base+'\n-- Existing operational RPC guards\n'+out.join('\n\n')+'\nnotify pgrst, \'reload schema\';\n');
console.log(`Prepared ${out.length} existing RPC guards`);
