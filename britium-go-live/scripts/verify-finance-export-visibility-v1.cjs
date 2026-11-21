const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function read(file){const s=fs.readFileSync(file,'utf8');const out=ts.transpileModule(s,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});const e=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);assert.equal(e.length,0,file+' invalid TSX');return s;}
const finance=read('src/pages/EnterpriseLiveCenterPages.tsx'),totals=read('src/components/finance/FinanceCollectionTotals.tsx');
assert.ok(finance.includes('data-cod-report-actions="true"'),'COD toolbar missing');
assert.ok(finance.includes('data-finance-table-scroll="true"'),'COD table scroll missing');
assert.ok(finance.includes('flexDirection:"column",alignItems:"flex-start",width:"100%"'),'COD buttons must not be pushed to far right');
assert.ok(finance.includes('overflowX: "auto", overflowY:"auto",maxHeight:"65vh"'),'COD scroll must support two axes');
assert.ok(totals.includes('data-collection-report-export-actions="true"'),'Collection toolbar missing');
assert.ok(totals.includes('data-collection-table-scroll="true"'),'Historical table scroll missing');
assert.ok(totals.includes('flexDirection:"column",alignItems:"flex-start"'),'Historical export buttons must stay left-aligned');
assert.ok(totals.includes("overflowX:'auto',overflowY:'auto',maxHeight:'65vh'"),'Historical report must scroll');
assert.ok(finance.includes('downloadCodExcel()')&&finance.includes('printCodPdf'),'COD exporters must remain wired');
assert.ok(totals.includes('downloadCollectionExcel()')&&totals.includes('printCollectionPdf'),'Collection exporters must remain wired');
console.log('Finance export visibility and scroll regression PASS');
