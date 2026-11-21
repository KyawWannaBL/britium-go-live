// Finance reports are projections of the operator's current authorized RPC result.
// No backend writes, independent rerouting, or inference that unrecorded amounts are zero.
export type ReportColumn = {key:string;label:string;kind?:"number"|"text"};
export type FinanceReport = {
 title:string;
 fileStem:string;
 columns:ReportColumn[];
 rows:Record<string,unknown>[];
 filters:Record<string,string|number|boolean|undefined|null>;
 note:string;
 generatedAt?:Date;
};
function safeFileName(stem:string){
 return String(stem||"finance-report").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,96);
}
export function financeReportRows(report:FinanceReport) {
 return report.rows.map(row=>report.columns.map(column=>{
  const value=row[column.key];
  if(value===null||value===undefined||value==="") return column.kind==="number"?"Not recorded": "—";
  if(column.kind==="number" && typeof value==="number" && Number.isFinite(value))return value;
  const txt=String(value);
  // Spreadsheet formula injection must not become executable formulas on open.
  return /^[\t\r\n ]*[=+@-]/.test(txt)?"'"+txt:txt;
 }));
}
export async function exportFinanceExcel(report:FinanceReport):Promise<void>{
 if(!report.rows.length)throw new Error("No report rows match the selected filters.");
 const XLSX=await import("xlsx");
 const asOf=(report.generatedAt||new Date()).toLocaleString("en-GB",{timeZone:"Asia/Yangon"});
 const filterRows=Object.entries(report.filters).filter(([,value])=>value!==null&&value!==undefined&&String(value)!=="").map(([key,value])=>[key,String(value)]);
 const meta=[["BRITIUM EXPRESS",report.title],["Generated (Myanmar Time)",asOf],["Rows exported",report.rows.length],["Data scope","Loaded authorized rows matching the visible filters"],["Control notice",report.note],...filterRows];
 const sheet=XLSX.utils.aoa_to_sheet([report.columns.map(c=>c.label),...financeReportRows(report)]);
 sheet["!cols"]=report.columns.map(c=>({wch:Math.min(45,Math.max(14,c.label.length+5))}));
 const info=XLSX.utils.aoa_to_sheet(meta);
 info["!cols"]=[{wch:30},{wch:110}];
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,sheet,"Report");
 XLSX.utils.book_append_sheet(book,info,"Filters and Notes");
 XLSX.writeFile(book,safeFileName(report.fileStem)+".xlsx",{compression:true});
}
function escapeHtml(value:unknown){
 return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
export function printFinancePdf(report:FinanceReport):void {
 if(!report.rows.length)throw new Error("No report rows match the selected filters.");
 const pop=window.open("","_blank");
 if(!pop)throw new Error("PDF preview was blocked. Allow popups for Britium Express and try again.");
 const generated=(report.generatedAt||new Date()).toLocaleString("en-GB",{timeZone:"Asia/Yangon"});
 const filters=Object.entries(report.filters).filter(([,v])=>v!==null&&v!==undefined&&String(v)!=="").map(([k,v])=>`<span><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</span>`).join("");
 const header=report.columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join("");
 const body=financeReportRows(report).map(row=>"<tr>"+row.map((v,i)=>`<td class="${report.columns[i].kind==="number"?"numeric":""}">${escapeHtml(v)}</td>`).join("")+"</tr>").join("");
 // The browser's print engine preserves complex Myanmar fonts and paginates large tables
 // correctly; choose "Save as PDF" in the dialog for the downloadable PDF file.
 const html=`<!doctype html><html><head><meta charset="utf-8"/>
 <title>${escapeHtml(report.title)} — Britium Express</title>
 <style>
 @page { size:A3 landscape; margin:12mm; }
 * {box-sizing:border-box} body{margin:0;padding:18px;color:#172334;background:#fff;font:11px Arial,"Noto Sans Myanmar",sans-serif}
 h1{font-size:21px;margin:0 0 6px;color:#091c32}.brand{letter-spacing:2px;font-weight:900;color:#b06b00;font-size:12px;margin-bottom:4px}
 .meta{display:flex;gap:12px;flex-wrap:wrap;padding:8px 0 12px;font-size:11px;color:#374151}
 .note{padding:9px;border:1px solid #d1d5db;border-radius:5px;margin:10px 0 14px;font-size:11px;line-height:1.6}
 table{width:100%;border-collapse:collapse;table-layout:auto;font-size:9px} th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
 th{background:#f6b84b;color:#071b2c;font-size:9px;white-space:normal} tr{break-inside:avoid;page-break-inside:avoid} thead{display:table-header-group}
 .numeric{text-align:right;white-space:nowrap}.toolbar{position:sticky;top:0;padding:10px 0;background:#fff;z-index:10;margin-bottom:12px}
 button{background:#0b2236;color:#fff;padding:12px 20px;border:none;border-radius:8px;font-weight:700;cursor:pointer}
 footer{margin-top:12px;font-size:10px;color:#475569}
 @media print{body{padding:0} .toolbar{display:none!important} h1{break-after:avoid} thead{display:table-header-group} footer{break-before:avoid}}
 </style></head><body>
 <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button> <span style="margin-left:12px">Select <b>Save as PDF</b> as the printer destination.</span></div>
 <div class="brand">BRITIUM EXPRESS · FINANCE OPERATIONS</div>
 <h1>${escapeHtml(report.title)}</h1>
 <div class="meta"><span>Generated: ${escapeHtml(generated)} (Myanmar Time)</span><span>Records: ${report.rows.length}</span><span>Scope: loaded and filtered</span>${filters}</div>
 <div class="note">${escapeHtml(report.note)}</div>
 <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
 <footer>Britium Express · Internal finance report · This export does not constitute payment confirmation or settlement authorization.</footer>
 </body></html>`;
 pop.document.open();
 pop.document.write(html);
 pop.document.close();
 pop.focus();
}
