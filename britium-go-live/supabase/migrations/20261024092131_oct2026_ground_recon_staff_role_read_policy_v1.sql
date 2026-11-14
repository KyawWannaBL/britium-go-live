create policy "be_oct2026_ground_case_read_by_department_v1" 
on public.be_cross_role_work_items_v27 for select to authenticated
using (
 process_area='OCT2026_GROUND_RECONCILIATION'
 and (
  lower(public.be_current_role())='superadmin'
  or (target_role='WAREHOUSE' and lower(public.be_current_role()) in ('warehouse','dispatch'))
  or (target_role='OPERATIONS' and lower(public.be_current_role()) in ('admin','supervisor','operation_manager'))
  or (target_role='CUSTOMER_SERVICE' and lower(public.be_current_role())='customer_service')
 )
);