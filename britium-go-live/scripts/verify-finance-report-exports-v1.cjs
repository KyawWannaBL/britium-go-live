const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
function source(file){const s=fs.readFileSync(file,"utf8");const compiled=ts.transpileModule(s,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});const errors=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);assert.equal(errors.length,0,file+" must be parsable TSX");return s;}
const ui=source("src/pages/EnterpriseLiveCenterPages.tsx");
const totals=source("src/components/finance/FinanceCollectionTotals.tsx");
const exports=source("src/lib/financeReportExports.ts");
for(const action of ["data-cod-report-actions","downloadCodExcel","printCodPdf","codQueueExportReport","filteredCod","filtered"]){assert.ok(ui.includes(action),"Missing COD export action "+action);}
for(const col of ["duration","status","way","review","payment","rider","driver","helper","van","merchant","original","adjustment","revised","recorded","reference","settled_at"]){assert.ok(ui.includes("key:\""+col+"\""),"Missing exported COD column "+col);}
for(const action of ["data-collection-report-export-actions","downloadCollectionExcel","printCollectionPdf","collectionReport","from","to","group","by_method","unknown_count","confirmed_total","pending_total"]){assert.ok(totals.includes(action),"Missing historical collection export "+action);}
assert.ok(exports.includes('await import("xlsx")'),"Use the existing XLSX package for native Excel exports");
assert.ok(exports.includes('XLSX.writeFile('),"Excel workbook must download");
assert.ok(exports.includes('Filters and Notes'),"The report must identify filter context");
assert.ok(exports.includes('Safe')===false,"Unexpected placeholder code");
assert.ok(exports.includes('Save as PDF'),"Browser PDF preview must explain Save as PDF");
assert.ok(exports.includes("escapeHtml(value"),"Printed report values must be escaped");
assert.ok(exports.includes("Not recorded"),"Unknown data must not be silently made zero");
assert.ok(!exports.includes("supabase."),"Exports may not mutate finance data");
console.log("Finance report exports PASS: two queue screens, historical totals, filter scope, XLSX workbook and printable PDF");
