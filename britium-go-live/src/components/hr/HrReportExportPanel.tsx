import {useMemo,useState} from "react";
import {sanitizeExcel} from "@/lib/parcelReportExport";
type HrRow=Record<string,unknown>;
const employeeColumns=[
 ["employee_code","Employee code / ဝန်ထမ်းကုဒ်"],["display_name","Employee / ဝန်ထမ်းအမည်"],
 ["department","Department / ဌာန"],["role_label","Designation / ရာထူး"],
 ["branch_code","Branch / ရုံးခွဲ"],["email","Email / အီးမေးလ်"],
 ["status","Status / အခြေအနေ"],["phone_primary","Phone / ဖုန်း"]
] as const;
const documentColumns=[
 ["employee_code","Employee code / ဝန်ထမ်းကုဒ်"],["document_type","Document type / စာရွက်စာတမ်းအမျိုးအစား"],
 ["title","Document title / အမည်"],["effective_date","Effective date / စတင်ရက်"],
 ["expiry_date","Expiry date / သက်တမ်းကုန်ရက်"],["status","Document status / အခြေအနေ"],
 ["file_name","File name / ဖိုင်အမည်"],["created_at","Registered / မှတ်တမ်းတင်ရက်"]
] as const;
const escapeHtml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const field=(r:HrRow,k:string)=>r[k]==null?"":String(r[k]);
const day=(v:unknown)=>String(v||"").slice(0,10);
const input="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900";
export default function HrReportExportPanel({employees,documents}:{employees:HrRow[];documents:HrRow[]}){
 const [kind,setKind]=useState<"employee"|"document">("employee");
 const [search,setSearch]=useState("");
 const [department,setDepartment]=useState("");
 const [branch,setBranch]=useState("");
 const [status,setStatus]=useState("");
 const [docType,setDocType]=useState("");
 const [from,setFrom]=useState("");
 const [to,setTo]=useState("");
 const [fields,setFields]=useState<string[]>(employeeColumns.slice(0,7).map(c=>c[0]));
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState("");
 const depts=useMemo(()=>Array.from(new Set(employees.map(r=>field(r,"department")).filter(Boolean))).sort(),[employees]);
 const branches=useMemo(()=>Array.from(new Set(employees.map(r=>field(r,"branch_code")).filter(Boolean))).sort(),[employees]);
 const types=useMemo(()=>Array.from(new Set(documents.map(r=>field(r,"document_type")).filter(Boolean))).sort(),[documents]);
 const codes=useMemo(()=>new Map(employees.map(r=>[field(r,"employee_code"),r])),[employees]);
 const cols=(kind==="employee"?employeeColumns:documentColumns) as readonly (readonly [string,string])[];
 const selectedCols=cols.filter(c=>fields.includes(c[0]));
 const rows=useMemo(()=>{
  const base=kind==="employee"?employees:documents;
  return base.filter(r=>{
   const employee=kind==="document"?codes.get(field(r,"employee_code"))||{}:r;
   const created=kind==="document"?day(r.created_at||r.effective_date):day(r.updated_at||r.created_at);
   if(search && !JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))return false;
   if(department && field(employee,"department")!==department)return false;
   if(branch && field(employee,"branch_code")!==branch)return false;
   if(status && field(r,"status").toLowerCase()!==status.toLowerCase())return false;
   if(docType && kind==="document" && field(r,"document_type")!==docType)return false;
   if(from && created<from)return false;
   if(to && created>to)return false;
   return true;
  });
 },[employees,documents,kind,codes,search,department,branch,status,docType,from,to]);
 function switchKind(next:"employee"|"document"){
  setKind(next);setFields((next==="employee"?employeeColumns.slice(0,7):documentColumns).map(c=>c[0]));
  setStatus("");setSearch("");setDocType("");setFrom("");setTo("");
 }
 async function exportExcel(){
  setErr("");setBusy(true);
  try{
   if(!rows.length||!selectedCols.length)throw Error("No matching records or selected columns.");
   const XLSX=await import("xlsx");
   const sheet=XLSX.utils.aoa_to_sheet([selectedCols.map(c=>c[1]),...rows.map(r=>selectedCols.map(c=>sanitizeExcel(r[c[0]])))]);
   sheet["!cols"]=selectedCols.map(c=>({wch:Math.min(45,Math.max(17,c[1].length))}));
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,kind==="employee"?"Employees":"HR Documents");
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
     ["Britium Express","Admin/HR authorized filtered report"],
     ["Dataset",kind],["Rows",rows.length],["Department",department||"All"],
     ["Branch",branch||"All"],["Status",status||"All"],["Document type",docType||"All"],
     ["From date",from||"All"],["To date",to||"All"],
     ["Privacy","Document file paths and original private files are not included"],
     ["Exported",new Date().toISOString()]
   ]),"Report context");
   XLSX.writeFile(wb,"Britium_HR_"+kind+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  }catch(e){setErr(String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function exportPdf(){
  const pop=window.open("","_blank");setErr("");setBusy(true);
  try{
   if(!pop)throw Error("Browser popup blocked.");
   if(!rows.length||!selectedCols.length||rows.length>2000)throw Error("Select columns and between 1 and 2000 matching records.");
   const headers=selectedCols.map(c=>"<th>"+escapeHtml(c[1])+"</th>").join("");
   const data=rows.map(r=>"<tr>"+selectedCols.map(c=>"<td>"+escapeHtml(r[c[0]])+"</td>").join("")+"</tr>").join("");
   pop.document.open();
   pop.document.write('<!doctype html><html><head><meta charset="UTF-8"><title>Britium Admin HR Report</title><style>@page{size:A3 landscape;margin:12mm}body{font:11px Arial,"Noto Sans Myanmar",sans-serif;color:#182b3b}h2{font-size:17px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px;overflow-wrap:anywhere}th{background:#193b55;color:white}tr{break-inside:avoid}thead{display:table-header-group}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><h2>BRITIUM EXPRESS — Admin / HR Authorized Register</h2><p>Dataset: '+escapeHtml(kind)+' | Rows: '+rows.length+' | Department: '+escapeHtml(department||"All")+' | Branch: '+escapeHtml(branch||"All")+' | Period: '+escapeHtml(from||"All")+' to '+escapeHtml(to||"All")+'</p><p>HR metadata export only. Original private documents require their individual authorized download process.</p><table><thead><tr>'+headers+'</tr></thead><tbody>'+data+'</tbody></table></body></html>');
   pop.document.close();pop.focus();
  }catch(e){pop?.close();setErr(String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-900">
  <h2 className="text-lg font-bold">Admin/HR Filtered Reports / ဝန်ထမ်းနှင့် စာရွက်စာတမ်း အစီရင်ခံစာများ</h2>
  <p className="mt-1 text-xs text-slate-600">Exports use the authorized HR employee master and document register. Original confidential files remain in the secured HR Vault.</p>
  <div className="mt-3 flex gap-2">
   <button className={"rounded px-3 py-2 text-sm "+(kind==="employee"?"bg-blue-900 text-white":"border bg-white")} onClick={()=>switchKind("employee")}>Employee master / ဝန်ထမ်း</button>
   <button className={"rounded px-3 py-2 text-sm "+(kind==="document"?"bg-blue-900 text-white":"border bg-white")} onClick={()=>switchKind("document")}>Document register / စာရွက်စာတမ်း</button>
  </div>
  <div className="mt-3 grid gap-3 md:grid-cols-4">
   <label className="text-xs font-semibold">Search / ရှာဖွေရန်<input className={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name / code / title"/></label>
   <label className="text-xs font-semibold">Department / ဌာန<select className={input} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All</option>{depts.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs font-semibold">Branch / ရုံးခွဲ<select className={input} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">All</option>{branches.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs font-semibold">Status / အခြေအနေ<select className={input} value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{Array.from(new Set((kind==="employee"?employees:documents).map(r=>field(r,"status")).filter(Boolean))).map(x=><option key={x}>{x}</option>)}</select></label>
   {kind==="document"&&<label className="text-xs font-semibold">Document type / အမျိုးအစား<select className={input} value={docType} onChange={e=>setDocType(e.target.value)}><option value="">All</option>{types.map(x=><option key={x}>{x}</option>)}</select></label>}
   <label className="text-xs font-semibold">From date / စတင်ရက်<input className={input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="text-xs font-semibold">To date / နောက်ဆုံးရက်<input className={input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div>
  <div className="mt-3 flex flex-wrap gap-3">
   {cols.map(([k,label])=><label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={fields.includes(k)} onChange={e=>setFields(old=>e.target.checked?[...old,k]:old.filter(x=>x!==k))}/>{label}</label>)}
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-2">
   <span className="text-sm font-semibold">{rows.length} / {kind==="employee"?employees.length:documents.length} filtered records</span>
   <button className="rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:opacity-40" disabled={busy||!rows.length||!selectedCols.length} onClick={()=>void exportExcel()}>Generate Excel / Excel ထုတ်ယူရန်</button>
   <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={busy||!rows.length||!selectedCols.length} onClick={()=>void exportPdf()}>Generate PDF / PDF ထုတ်ယူရန်</button>
  </div>
  {documents.length>=1000&&kind==="document"&&<p className="mt-2 text-xs text-amber-800">Document snapshot reached the 1,000-item source limit. Narrow search or use authoritative reporting before claiming a complete export.</p>}
  {err&&<p className="mt-2 text-sm text-red-700" role="alert">{err}</p>}
  <div className="mt-3 max-h-64 overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead className="sticky top-0 bg-slate-200"><tr>{selectedCols.map(c=><th key={c[0]} className="p-2 text-left">{c[1]}</th>)}</tr></thead>
   <tbody>{rows.slice(0,30).map((r,i)=><tr key={i} className="border-b">{selectedCols.map(c=><td className="p-2" key={c[0]}>{field(r,c[0])||"—"}</td>)}</tr>)}</tbody></table></div>
  <p className="mt-2 text-xs text-slate-600">Preview shows first 30 matching entries. Export includes all matching loaded records. For an original signed contract or scanned document, use its existing authorized Download action in the HR document register.</p>
 </section>;
}
