import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read=(path)=>fs.readFileSync(path,'utf8');
const app=read('src/App.tsx');
const sidebar=read('src/components/Sidebar.tsx');
const branch=read('src/pages/BranchTeamPage.tsx');
const office=read('src/pages/BranchOfficePage.tsx');
const migration=read('supabase/migrations/20261111053420_mandalay_branch_team_directory_and_account_requests_v1.sql');

for(const [filename,text] of [
  ['BranchTeamPage.tsx',branch],['BranchOfficePage.tsx',office],
  ['Sidebar.tsx',sidebar],['App.tsx',app]
]){
  const source=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length,0,
    filename+' has a TSX syntax error: '+source.parseDiagnostics.map(e=>e.messageText).join('; '));
}

const routes=['riders','drivers','helpers','accounts','finance'];
for(const section of routes){
  assert.ok(app.includes('<Route path="/branch-team/'+section+'" element={<BranchTeamPage />} />'),
    'Missing registered route: '+section);
  assert.ok(sidebar.includes('path: "/branch-team/'+section+'"'),
    'Missing navigation: '+section);
  assert.ok(office.includes("path:'/branch-team/"+section+"'"),
    'Missing Branch Office shortcut: '+section);
}
assert.ok(app.includes('const BranchTeamPage = safeLazy('),'Screen must be lazy loaded.');
assert.ok(branch.includes("rpc('be_branch_team_directory_v1'"),'Branch directory must use scoped RPC.');
assert.ok(branch.includes("rpc('be_branch_account_request_v1'"),'Accounts must use HQ request RPC.');
assert.ok(!branch.includes('AccountAccessPanel'),'No global account management inside branch screens.');
assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.be_branch_account_request_v1'),'Anonymous RPC grants not restricted.');
assert.ok(migration.includes('public.be_branch_scope_v1'),'Branch is not enforced by server-side RPC.');

const registry=read('src/lib/portalRegistry.ts');
const guards=read('src/lib/accessControl.ts').replace(/^import .*?;\s*$/gm,'');
const moduleText=ts.transpileModule(registry+'\n'+guards,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {canRoleOpenPath}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
for(const role of ['branch-manager','branch-admin']){
  for(const section of routes)assert.equal(canRoleOpenPath(role,'/branch-team/'+section),true,
    role+' cannot access '+section);
}
for(const role of ['rider','driver','helper','warehouse','finance','customer-service','supervisor','branch-staff','guest']){
  for(const section of routes)assert.equal(canRoleOpenPath(role,'/branch-team/'+section),false,
    role+' leaked into branch management '+section);
}
assert.equal(canRoleOpenPath('branch-manager','/accounts'),false,'MDY manager must not access central account control.');
assert.equal(canRoleOpenPath('branch-manager','/finance/merchant-settlement'),false,'MDY manager must not access settlement.');
assert.equal(canRoleOpenPath('branch-manager','/settings'),false,'MDY manager must not access global settings.');
console.log('PASS: Mandalay branch teams, five routes, guards, and account request controls.');
