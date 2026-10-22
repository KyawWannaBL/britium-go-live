// All authorization is resolved against the live account registry by the caller RPC.
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const clean=v=>String(v??'').trim();
const normalize=v=>clean(v).toLowerCase().replace(/[ _]+/g,'-');
const administrators=new Set(['admin','superadmin','super-admin','app-owner','sys']);
const employeeRoles=new Set(['rider','driver','helper','customer-service','data-entry','warehouse','dispatch','supervisor','finance','marketing','business-development','branch-manager']);
const workforceTables={rider:['be_master_riders','rider_code'],driver:['be_master_drivers','driver_code'],helper:['be_master_helpers','helper_code']};
const authorityRole=role=>({'business-development':'business-development-manager','branch-manager':'branch-office-manager'}[role]||role);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function checked(query){const result=await query;if(result.error)throw fail(result.error.message||'Database operation failed.',500);return result.data;}
const columns='user_id,auth_user_id,full_name,email,phone_number,role,role_code,app_role,user_role,worker_code,branch_code,status,active,is_active,metadata';
export function createAccountHandler({createClient,env}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405);
  try{
   if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw fail('Account service is not configured.',503);
   const authorization=req.headers.get('Authorization')||'';
   if(!/^Bearer\s+\S+$/i.test(authorization))throw fail('Sign in required.',401);
   const options={auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}};
   const caller=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
   const identity=await caller.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
   if(identity.error||!identity.data?.user)throw fail('Session is invalid. Sign in again.',401);
   const access=await caller.rpc('be_login_access_profile');
   if(access.error||!access.data?.authorized||access.data.auth_user_id!==identity.data.user.id||!administrators.has(normalize(access.data.role)))throw fail('Account access is managed by an authorized administrator.',403);
   const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const body=await req.json().catch(()=>{throw fail('Invalid request.');});
   const audit=async(action,id,details={})=>checked(admin.from('be_audit_events').insert({actor_id:identity.data.user.id,actor_email:access.data.email||identity.data.user.email||null,actor_role:access.data.role,action,resource_type:'LOGIN_ACCOUNT',resource_id:id,details}));
   const action=clean(body.action);const merchantCode=clean(body.merchant_code).toUpperCase();const employeeCode=clean(body.employee_code);const workforceType=normalize(body.workforce_type),workforceCode=clean(body.workforce_code).toUpperCase();
   if((workforceType||workforceCode)&&(!workforceTables[workforceType]||!workforceCode))throw fail('Select a saved rider, driver or helper.');
   if(action==='list_accounts'){
    let merchantIds;
    if(merchantCode){const links=await checked(admin.from('be_merchant_accounts').select('auth_user_id').eq('merchant_code',merchantCode));merchantIds=(links||[]).map(x=>x.auth_user_id);if(!merchantIds.length)return json({success:true,rows:[]});}
    let query=admin.from('be_user_account_registry').select(columns.replace(',metadata','')).order('created_at',{ascending:false}).limit(1000);
    if(employeeCode){
     let employee=await checked(admin.from('be_employee_master').select('employee_code,employee_id').eq('employee_id',employeeCode).maybeSingle());
     if(!employee)employee=await checked(admin.from('be_employee_master').select('employee_code,employee_id').eq('employee_code',employeeCode).maybeSingle());
     query=query.eq('worker_code',employee?.employee_code||employee?.employee_id||employeeCode);
    }
    if(workforceCode)query=query.eq('worker_code',workforceCode).ilike('role_code',workforceType);
    if(merchantIds)query=query.in('auth_user_id',merchantIds);
    let rows=await checked(query)||[];
    return json({success:true,rows});
   }
   if(action==='create_account'){
    if([merchantCode,employeeCode,workforceCode].filter(Boolean).length!==1)throw fail('Choose one saved merchant, employee or workforce master to link this login.');
    const email=clean(body.email).toLowerCase(),password=String(body.password??''),fullName=clean(body.full_name);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!fullName)throw fail('Name and valid email are required.');
    if(password.length<12)throw fail('Enter a temporary password of at least 12 characters.');
    const role=normalize(body.role||(merchantCode?'merchant':workforceType));
    if(workforceCode&&role!==workforceType)throw fail('Workforce login role must match the selected master type.');
    if(merchantCode?role!=='merchant':!employeeRoles.has(role))throw fail('Select an approved role for this linked account.');
    const matrix=await checked(admin.from('be_role_authority_matrix').select('role_id,is_active,can_access_portal'));
    if(!(matrix||[]).some(x=>normalize(x.role_id)===authorityRole(role)&&x.is_active===true&&x.can_access_portal===true))throw fail('This role is not active in the access authority matrix.');
    let source,employeeId,workerCode,branchCode;
    if(merchantCode){
     source=await checked(admin.from('be_master_merchants').select('merchant_code,merchant_name,status').eq('merchant_code',merchantCode).maybeSingle());
     if(!source)throw fail('Save the merchant master before creating login access.',404);
     if(normalize(source.status)!=='active')throw fail('Merchant must be active before login access is created.');
     const links=await checked(admin.from('be_merchant_accounts').select('auth_user_id').eq('merchant_code',merchantCode));
     if(links?.length)throw fail('This merchant already has linked login access. Manage the existing account.',409);
    }else if(workforceCode){
     const [table,codeColumn]=workforceTables[workforceType];
     source=await checked(admin.from(table).select(codeColumn+',status,branch_code').eq(codeColumn,workforceCode).maybeSingle());
     if(!source)throw fail('Save the workforce master before creating login access.',404);
     if(normalize(source.status)!=='active')throw fail('Workforce master must be active before login access is created.');
     workerCode=workforceCode;
     const linked=await checked(admin.from('be_user_account_registry').select('auth_user_id').eq('worker_code',workerCode).ilike('role_code',workforceType));
     if(linked?.length)throw fail('This workforce master already has linked login access.',409);
     branchCode=clean(body.branch_code||source.branch_code);
     const branch=await checked(admin.from('be_branch_offices').select('branch_code,status').eq('branch_code',branchCode).maybeSingle());
     if(!branch||normalize(branch.status)!=='active')throw fail('Select an active branch from the branch master.');
    }else{
     source=await checked(admin.from('be_employee_master').select('employee_id,employee_code,branch_code,status,is_active,auth_user_id').eq('employee_id',employeeCode).maybeSingle());
     if(!source)source=await checked(admin.from('be_employee_master').select('employee_id,employee_code,branch_code,status,is_active,auth_user_id').eq('employee_code',employeeCode).maybeSingle());
     if(!source)throw fail('Save the employee master before creating login access.',404);
     if(source.is_active===false||!['active','enabled'].includes(normalize(source.status||'active')))throw fail('Employee must be active before login access is created.');
     employeeId=source.employee_id;workerCode=source.employee_code||employeeId;
     if(source.auth_user_id)throw fail('This employee already has linked login access.',409);
     const linked=await checked(admin.from('be_user_account_registry').select('auth_user_id').eq('worker_code',workerCode));
     if(linked?.length)throw fail('This employee already has linked login access.',409);
     branchCode=clean(body.branch_code||source.branch_code);
     if(!branchCode)throw fail('Select a branch for employee access.');
     const branch=await checked(admin.from('be_branch_offices').select('branch_code,status').eq('branch_code',branchCode).maybeSingle());
     if(!branch||normalize(branch.status)!=='active')throw fail('Select an active branch from the branch master.');
    }
    const duplicate=await checked(admin.from('be_user_account_registry').select('auth_user_id').eq('email',email));
    if(duplicate?.length)throw fail('This email already has an account. Manage the existing account.',409);
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName,role},app_metadata:{role}});
    if(created.error||!created.data?.user)throw fail(created.error?.message||'Login creation failed.');
    const id=created.data.user.id;
    try{
     await checked(admin.from('be_user_account_registry').insert({user_id:id,auth_user_id:id,full_name:fullName,display_name:fullName,email,account_email:email,login_email:email,user_email:email,phone_number:clean(body.phone),role,role_code:role,app_role:role,user_role:role,worker_code:workerCode||null,branch_code:branchCode||null,branch:branchCode||null,status:'active',active:true,is_active:true,must_change_password:true,force_password_change:true,password_change_required:true,metadata:{merchant_code:merchantCode||null,employee_id:employeeId||null,workforce_type:workforceType||null,workforce_code:workforceCode||null,created_by:identity.data.user.id}}));
     if(merchantCode)await checked(admin.from('be_merchant_accounts').insert({auth_user_id:id,merchant_code:merchantCode,merchant_name:source.merchant_name,email,status:'ACTIVE'}));
     else{
      // A branch is explicitly selected; this never creates unrestricted GLOBAL access.
      await checked(admin.from('be_employee_territory_assignments').insert({user_id:id,scope_type:'BRANCH',branch_code:branchCode,can_read:true,can_create:true,can_update:true,can_delete:false,active:true}));
      if(employeeId){const updated=await checked(admin.from('be_employee_master').update({auth_user_id:id}).eq('employee_id',employeeId).is('auth_user_id',null).select('employee_id'));
      if(updated?.length!==1)throw fail('Employee login linkage changed. Refresh before retrying.',409);}
     }
     await audit('LOGIN_ACCOUNT_CREATED',id,{merchant_code:merchantCode||null,employee_id:employeeId||null,workforce_type:workforceType||null,workforce_code:workforceCode||null,role});
    }catch(error){
     // Provisioning must fail closed if any dependent registry/link write fails.
     const cleanupErrors=[];
     const attempt=async query=>{try{const result=await query;if(result.error)cleanupErrors.push(result.error.message||'Cleanup failed');}catch(problem){cleanupErrors.push(problem?.message||'Cleanup failed');}};
     if(employeeId)await attempt(admin.from('be_employee_master').update({auth_user_id:null}).eq('employee_id',employeeId).eq('auth_user_id',id));
     await attempt(admin.from('be_merchant_accounts').delete().eq('auth_user_id',id));
     await attempt(admin.from('be_employee_territory_assignments').delete().eq('user_id',id));
     await attempt(admin.from('be_user_account_registry').delete().eq('auth_user_id',id));
     await attempt(admin.auth.admin.deleteUser(id));
     if(cleanupErrors.length){
      await attempt(admin.auth.admin.updateUserById(id,{ban_duration:'876000h'}));
      throw fail('Account setup failed and cleanup needs administrator review. Check the email before retrying. '+cleanupErrors.join('; '),500);
     }
     throw error;
    }
    return json({success:true,user:{id,email,role},message:'Login created and linked. Temporary password must be changed at first sign-in.'});
   }
   const id=clean(body.user_id);if(!id)throw fail('Select a linked login account.');
   if(id===identity.data.user.id)throw fail('Use another administrator to manage your own access.');
   const target=await checked(admin.from('be_user_account_registry').select(columns).eq('auth_user_id',id).maybeSingle());
   if(!target)throw fail('Linked login account was not found.',404);
   if(administrators.has(normalize(target.role_code||target.app_role||target.user_role||target.role)))throw fail('Administrator accounts require a separate access review.',403);
   if(action==='update_account'){
    if('role'in body||'email'in body||'merchant_code'in body||'employee_code'in body||'workforce_code'in body||'workforce_type'in body)throw fail('Role, email and master linkage are immutable in this editor.');
    if(!clean(body.full_name))throw fail('Name is required.');
    await checked(admin.from('be_user_account_registry').update({full_name:clean(body.full_name),display_name:clean(body.full_name),phone_number:clean(body.phone),updated_at:new Date().toISOString()}).eq('auth_user_id',id));
    await checked(admin.from('profiles').update({full_name:clean(body.full_name),phone:clean(body.phone),updated_at:new Date().toISOString()}).eq('id',id));
   }else if(action==='reset_password'){
    const password=String(body.password??'');if(password.length<12)throw fail('Enter a temporary password of at least 12 characters.');
    const result=await admin.auth.admin.updateUserById(id,{password});if(result.error)throw fail(result.error.message,500);
    await checked(admin.from('be_user_account_registry').update({must_change_password:true,force_password_change:true,password_change_required:true}).eq('auth_user_id',id));
   }else if(['block_user','unblock_user','delete_account'].includes(action)){
    const active=action==='unblock_user';
    if(active){
     const merchantLinks=await checked(admin.from('be_merchant_accounts').select('merchant_code').eq('auth_user_id',id));
     if(merchantLinks?.length){
      for(const link of merchantLinks){const master=await checked(admin.from('be_master_merchants').select('status').eq('merchant_code',link.merchant_code).maybeSingle());if(!master||normalize(master.status)!=='active')throw fail('Reactivate the merchant master before restoring login access.');}
     }else{
      let master=await checked(admin.from('be_employee_master').select('employee_id,auth_user_id,status,is_active').eq('auth_user_id',id).maybeSingle());
      if(!master&&target.worker_code)master=await checked(admin.from('be_employee_master').select('employee_id,auth_user_id,status,is_active').eq('employee_code',target.worker_code).maybeSingle());
      const targetRole=normalize(target.role_code||target.app_role||target.user_role||target.role);
      if(!master&&target.worker_code&&workforceTables[targetRole]){const [table,codeColumn]=workforceTables[targetRole];master=await checked(admin.from(table).select('status').eq(codeColumn,target.worker_code).maybeSingle());}
      if(!master||master.auth_user_id&&master.auth_user_id!==id||master.is_active===false||!['active','enabled'].includes(normalize(master.status||'active')))throw fail('An active linked employee or merchant master is required before restoring login access.');
     }
    }
    if(!active){const result=await admin.auth.admin.updateUserById(id,{ban_duration:'876000h'});if(result.error)throw fail(result.error.message,500);}
    await checked(admin.from('be_user_account_registry').update({status:active?'active':action==='delete_account'?'inactive':'suspended',active,is_active:active,updated_at:new Date().toISOString()}).eq('auth_user_id',id));
    await checked(admin.from('profiles').update({status:active?'active':action==='delete_account'?'inactive':'suspended',is_active:active,updated_at:new Date().toISOString()}).eq('id',id));
    await checked(admin.from('be_merchant_accounts').update({status:active?'ACTIVE':'INACTIVE',updated_at:new Date().toISOString()}).eq('auth_user_id',id));
    if(active){const result=await admin.auth.admin.updateUserById(id,{ban_duration:'none'});if(result.error)throw fail(result.error.message,500);}
   }else throw fail('Unknown account action.');
   await audit('LOGIN_'+action.toUpperCase(),id);
   return json({success:true,message:action==='delete_account'?'Login access removed. Operational history is retained.':'Account access updated.'});
  }catch(error){return json({success:false,error:error?.message||'Account service failed. Please retry.'},error?.status||500);}
 };
}
