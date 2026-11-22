// Filtered evidence exports. Dates are operational Myanmar calendar dates.
export type ReportRow = Record<string,unknown>;
export const fromMyanmarDay=(v:string)=>v?new Date(v+"T00:00:00+06:30").toISOString():null;
export const untilMyanmarDay=(v:string)=>{if(!v)return null;const d=new Date(v+"T00:00:00+06:30");d.setUTCDate(d.getUTCDate()+1);return d.toISOString();};
export const sanitizeExcel=(v:unknown)=>{
 const s=Array.isArray(v)?v.join("; "):v==null?"":String(v);
 return /^\s*[=+@-]/.test(s)?"'"+s:s;
};
const html=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
export async function downloadParcelXlsx(rows:ReportRow[],labels:{key:string;label:string}[],from:string,to:string,filename:string,reportTitle="Britium Express Parcel Status",dateBasis="Registration period (Myanmar)"){
 const XLSX=await import("xlsx");
 const matrix=[labels.map(c=>c.label),...rows.map(r=>labels.map(c=>sanitizeExcel(r[c.key])))];
 const sheet=XLSX.utils.aoa_to_sheet(matrix);
 sheet["!cols"]=labels.map(c=>({wch:Math.min(45,Math.max(17,c.label.length+5))}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,"Parcel Status");
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
  ["Register",reportTitle],["Date basis",dateBasis],["From (Myanmar)",from||"All"],
  ["Through (Myanmar)",to||"All"],["Way IDs exported",rows.length],
  ["Physical custody","Only source evidence; routing labels and dispatch assumptions are NOT verified scans"],
  ["Finance","Existing settlement statuses are read-only; report is not a payment instruction"],
  ["Generated",new Date().toISOString()]
 ]),"Report Context");
 XLSX.writeFile(wb,filename);
}
export function openParcelPrintWindow():Window|null{return window.open("","_blank");}
export function renderParcelPdf(printWindow:Window,rows:ReportRow[],labels:{key:string;label:string}[],from:string,to:string,reportTitle="Britium Express — Parcel Status",dateBasis="Registration period (Myanmar)"){
 if(rows.length>2000)throw new Error("PDF output exceeds 2,000 parcels. Narrow your timeline.");
 const lines=rows.map(r=>"<tr>"+labels.map(c=>"<td>"+html(Array.isArray(r[c.key])?(r[c.key] as string[]).join("; "):r[c.key])+"</td>").join("")+"</tr>").join("");
 printWindow.document.open();
 printWindow.document.write('<!doctype html><html><head><meta charset="UTF-8"><title>Britium Parcel Report</title><style>@page{size:A3 landscape;margin:10mm}body{font:11px Arial,"Noto Sans Myanmar",sans-serif;color:#15283b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px;overflow-wrap:anywhere}th{background:#193953;color:#fff}thead{display:table-header-group}tr{break-inside:avoid}@media print{.printbtn{display:none}}</style></head><body><button class="printbtn" onclick="window.print()">Print / Save as PDF</button><h2>'+html(reportTitle)+'</h2><p>'+html(dateBasis)+': '+html(from||"All")+' to '+html(to||"All")+' | '+rows.length+' Way IDs</p><p>Evidence-only report: no assumed dispatch, delivered, RTO or settlement is claimed as verified.</p><table><thead><tr>'+labels.map(c=>"<th>"+html(c.label)+"</th>").join("")+"</tr></thead><tbody>"+lines+"</tbody></table></body></html>");
 printWindow.document.close();printWindow.focus();
}
