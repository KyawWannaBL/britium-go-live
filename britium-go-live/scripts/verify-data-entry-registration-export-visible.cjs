const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
const file='src/pages/DataEntryFinancialV2Page.tsx',s=fs.readFileSync(file,'utf8');
const out=ts.transpileModule(s,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
const bad=(out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
assert.equal(bad.length,0,'Data Entry export UI must parse: '+bad.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
for(const tag of ['data-registration-export-shortcut="true"','data-registration-export-tools="true"','data-data-entry-registration-export-v12-9="true"','const registrationExportPanel=','toolDrawer==="EXPORT"?registrationExportPanel:null','downloadDataEntryRegistration()','downloadScope','downloadFrom','downloadTo','TODAY','LAST_24_HOURS','THIS_WEEK','THIS_MONTH','ALL TIME','All Registered Fields','Export Summary','XLSX.writeFile']){
 assert.ok(s.includes(tag),'Missing registration export requirement: '+tag);
}
assert.ok(s.includes('.from("be_data_entry_parcel_details")'),'Exports must use existing registration source');
assert.ok(s.includes('.range(offset,offset+pageSize-1)'),'Exports must paginate all accessible data');
assert.ok(s.includes('setToolDrawer("EXPORT")'),'Visible buttons must open export panel');
assert.ok(s.includes('Registration scope'),'Scope selector must be retained');
console.log('Data Entry registration export accessibility regression PASS');