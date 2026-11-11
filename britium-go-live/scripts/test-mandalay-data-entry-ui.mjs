import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read=path=>fs.readFileSync(path,'utf8');
const access=read('src/lib/accessControl.ts');
const sidebar=read('src/components/Sidebar.tsx');
const office=read('src/pages/BranchOfficePage.tsx');
const control=read('src/components/BranchControlWorkbench.tsx');
const app=read('src/App.tsx');
const migration=read('supabase/migrations/20261111080818_mandalay_data_entry_branch_scoped_v1.sql');

for(const [name,source] of [['BranchOfficePage.tsx',office],['BranchControlWorkbench.tsx',control],['App.tsx',app]]){
  const tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length,0,name+' must have valid TSX syntax');
}
assert.ok(app.includes('<Route path="/data-entry" element={<DataEntryFinancialV2Page />} />'),'Data Entry V2 route missing');
assert.ok(sidebar.includes('name: "Data Entry", path: "/data-entry"'),'Data Entry sidebar missing');
assert.ok(office.includes("name:'Data Entry V2',path:'/data-entry'"),'Branch Office entry missing');
assert.ok(control.includes('to="/data-entry"'),'Branch control shortcut missing');
assert.ok(access.includes("['/data-entry', rule('branch-manager'"),'MDY manager role missing from Data Entry permission');
assert.ok(!access.includes("['/finance/merchant-settlement', rule('branch-manager'"),'MDY manager must not access settlement');

const registry=read('src/lib/portalRegistry.ts');
const guards=access.replace(/^import .*?;\s*$/gm,'');
const module=ts.transpileModule(registry+'\n'+guards,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {canRoleOpenPath}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
assert.equal(canRoleOpenPath('branch-manager','/data-entry'),true);
assert.equal(canRoleOpenPath('branch-admin','/data-entry'),false);
assert.equal(canRoleOpenPath('data-entry','/data-entry'),true);
assert.equal(canRoleOpenPath('branch-manager','/accounts'),false);

for(const name of [
 'be_data_entry_manager_assert_pickup_v1','be_data_entry_financial_v2_save_legacy_v33',
 'be_data_entry_financial_v2_save_batch_v22','be_data_entry_financial_v2_add_registrations',
 'be_data_entry_financial_v2_create_ready_waybill','be_data_entry_financial_v2_ready_sequences_v137',
 'be_data_entry_pickup_list_web_v16','be_data_entry_phone_history_v81',
 'be_data_entry_staff_progress_v98','be_delivery_location_review_batch_v29'
]) assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.'+name),'Migration missing scoped function '+name);
assert.ok(migration.includes("BRANCH_DATA_ENTRY_SCOPE_DENIED"),'Cross-branch denial missing');
assert.ok(migration.includes("be_employee_can_access_territory"),'Territory guard missing');
assert.ok(migration.includes("('branch_manager','data_entry','encoder','supervisor')"),'Scoped MDY employee roles missing');
assert.ok(migration.includes("role_id='branch_manager'"),'Branch manager authority missing');
console.log('PASS Mandalay Data Entry V2: manager screen, routes, backend scope, YGN isolation and HQ separation');
