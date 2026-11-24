import type { ReportRow } from "./parcelReportExport";
export const sanitizeExcel=(v:unknown)=>{
 const s=Array.isArray(v)?v.join("; "):v==null?"":String(v);
 return /^\s*[=+@-]/.test(s)?"'"+s:s;
};

async function build(rows:ReportRow[],labels:{key:string;label:string}[],from:string,to:string,reportTitle:string,dateBasis:string){
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
 const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array"});
 return bytes;
}
self.onmessage=async ({data})=>{try{const bytes=await build(data.rows,data.labels,data.from,data.to,data.reportTitle,data.dateBasis);self.postMessage({bytes},{transfer:[bytes]});}catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}};
