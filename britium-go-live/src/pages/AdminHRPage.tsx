// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Download, Edit3, FileText, RefreshCw, Search, Trash2, UploadCloud, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DOC_TYPES=[
  ["EMPLOYMENT_CONTRACT","Employment Contract / အလုပ်ခန့်စာချုပ်"],
  ["NRC_ID","NRC / ID / မှတ်ပုံတင်"],
  ["NDA","NDA / လျှို့ဝှက်ချက်ထိန်းသိမ်းရေးစာချုပ်"],
  ["AGREEMENT","Agreement / သဘောတူစာချုပ်"],
  ["HR_POLICY","HR Rule / Policy / HR စည်းမျဉ်း"],
  ["WARNING","Warning / Disciplinary / သတိပေးစာ"],
  ["TRAINING","Training / Certificate / သင်တန်းမှတ်တမ်း"],
  ["PAYROLL","Payroll / Compensation Document"],
  ["LICENSE","License / Professional Credential"],
  ["OTHER","Other / အခြား"]
];

export default function AdminHRPage(){
  const [employees,setEmployees]=useState<any[]>([]);
  const [summary,setSummary]=useState<any>({});
  const [docs,setDocs]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [docSearch,setDocSearch]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [form,setForm]=useState({employee_code:"",document_type:"EMPLOYMENT_CONTRACT",title:"",effective_date:"",expiry_date:"",notes:""});
  const [employeeEdit,setEmployeeEdit]=useState<any>(null);
  const [employeeBusy,setEmployeeBusy]=useState(false);

  async function load(){
    setLoading(true);setMessage("");
    const [hr,dr]=await Promise.all([
      (supabase as any).rpc("be_hr_dashboard"),
      (supabase as any).rpc("be_hr_document_snapshot_v1",{p_search:docSearch.trim()||null,p_limit:1000})
    ]);
    if(hr.error)setMessage(hr.error.message);
    else {setEmployees(Array.isArray(hr.data?.employees)?hr.data.employees:Array.isArray(hr.data?.rows)?hr.data.rows:[]);setSummary(hr.data?.summary||{});}
    if(dr.error||dr.data?.ok===false)setMessage((m:string)=>m||dr.error?.message||dr.data?.code||"HR documents unavailable.");
    else setDocs(Array.isArray(dr.data?.rows)?dr.data.rows:[]);
    setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  async function upload(){
    if(!file||!form.title.trim())return setMessage("Document title and file are required.");
    setLoading(true);setMessage("");
    const safe=file.name.replace(/[^A-Za-z0-9._-]+/g,"_");
    const path=(form.employee_code||"CORPORATE")+"/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"-"+safe;
    const up=await supabase.storage.from("hr-documents").upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(up.error){setMessage(up.error.message);setLoading(false);return;}
    const {data,error}=await (supabase as any).rpc("be_hr_document_register_upsert_v1",{p_payload:{
      ...form,storage_path:path,file_name:file.name,mime_type:file.type||null,status:"ACTIVE"
    }});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Document registration failed.");setLoading(false);return;}
    setMessage("HR document uploaded securely and registered in Supabase.");
    setFile(null);setForm({...form,title:"",notes:""});await load();
  }

  async function saveEmployee(){
    if(!employeeEdit)return;
    setEmployeeBusy(true);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const {data,error}=await (supabase as any).rpc("be_hr_employee_save_audited",{
      p_record:employeeEdit,
      p_actor_email:user?.email||"hr@britiumexpress.com"
    });
    if(error||data?.ok===false){setMessage(error?.message||data?.message||data?.code||"Employee save failed.");setEmployeeBusy(false);return;}
    setMessage("Employee record updated in Supabase with audit trail.");
    setEmployeeEdit(null);setEmployeeBusy(false);await load();
  }

  async function deleteEmployee(row:any){
    const id=String(row.employee_code||row.employee_id||row.id||"").trim();
    if(!id)return setMessage("Employee ID is missing.");
    if(!window.confirm("Delete employee "+id+"? This action is audited."))return;
    setEmployeeBusy(true);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const {data,error}=await (supabase as any).rpc("be_hr_employee_delete_audited",{
      p_employee_id:id,
      p_actor_email:user?.email||"hr@britiumexpress.com"
    });
    if(error||data?.ok===false){setMessage(error?.message||data?.message||data?.code||"Employee delete failed.");setEmployeeBusy(false);return;}
    setMessage("Employee "+id+" deleted with audit trail.");
    setEmployeeBusy(false);await load();
  }

  async function downloadDoc(row:any){
    const {data,error}=await supabase.storage.from("hr-documents").createSignedUrl(row.storage_path,120);
    if(error||!data?.signedUrl)return setMessage(error?.message||"Could not create secure download link.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();if(!q)return employees;
    return employees.filter((e:any)=>JSON.stringify(e).toLowerCase().includes(q));
  },[employees,search]);

  return <div className="space-y-5 text-[#eef8ff]">
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.22em] text-[#f6b84b]">ADMINISTRATION & HUMAN RESOURCES</div><h1 className="mt-2 text-3xl font-black">Admin / HR Control Center</h1><p className="mt-2 text-sm text-[#8fb2c9]">Employee master, contracts, agreements, HR policies, IDs, disciplinary records and required evidence in one controlled workspace.</p></div><button onClick={()=>void load()} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button></div>
      {message&&<div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {[["Employees",summary.total_employees||employees.length],["Active",summary.active_employees||0],["Departments",summary.departments||0],["Branches",summary.branches||0],["Field Team",(summary.riders||0)+(summary.drivers||0)+(summary.helpers||0)],["HR Documents",docs.length]].map(([l,v])=><div key={l} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[10px] font-black uppercase text-[#8fb2c9]">{l}</div><div className="mt-2 text-xl font-black text-[#f6b84b]">{Number(v||0).toLocaleString()}</div></div>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex items-center gap-2"><UploadCloud size={18} className="text-[#38bdf8]"/><h2 className="font-black">Collect / Upload HR Document</h2></div>
        <p className="mt-1 text-xs text-[#8fb2c9]">Corporate policies may be stored without an employee code. Employee-specific records should select the employee code.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Employee</span><input list="hr-employee-options" value={form.employee_code} onChange={e=>setForm({...form,employee_code:e.target.value})} placeholder="Type employee code/name or select..." className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/><datalist id="hr-employee-options"><option value="">Corporate / All Staff</option>{employees.map((e:any)=><option key={e.employee_code||e.employee_id} value={e.employee_code||e.employee_id}>{e.display_name||e.employee_name||e.full_name}</option>)}</datalist></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Document Type</span><input list="hr-doc-types" value={form.document_type} onChange={e=>setForm({...form,document_type:e.target.value})} placeholder="Type manually or select..." className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/><datalist id="hr-doc-types">{DOC_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</datalist></label>
          <label className="md:col-span-2 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Title / Document Name</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3" placeholder="e.g. Employment Contract 2026 / HR Leave Policy"/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Effective Date</span><input type="date" value={form.effective_date} onChange={e=>setForm({...form,effective_date:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Expiry Date</span><input type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>
          <label className="md:col-span-2 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="min-h-[90px] w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/></label>
          <label className="md:col-span-2 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Evidence / Contract File</span><input type="file" accept=".pdf,.docx,image/*" onChange={e=>setFile(e.target.files?.[0]||null)} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/></label>
        </div>
        <button onClick={()=>void upload()} disabled={loading||!file||!form.title.trim()} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f6b84b] font-black text-[#061524] disabled:opacity-50"><UploadCloud size={16}/>Upload + Register in HR Vault</button>
      </div>

      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2"><FileText size={18} className="text-[#38bdf8]"/><h2 className="font-black">HR Document Register</h2></div><div className="flex gap-2"><input value={docSearch} onChange={e=>setDocSearch(e.target.value)} placeholder="Search documents..." className="h-10 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/><button onClick={()=>void load()} className="h-10 rounded-xl border border-[#1a3a5c] px-4 font-black">Search</button></div></div>
        <div className="mt-4 max-h-[630px] space-y-2 overflow-auto">{docs.map((d:any)=><div key={d.id} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-[#38bdf8]">{d.document_type}</div><div className="mt-1 font-black">{d.title}</div><div className="mt-1 text-xs text-[#8fb2c9]">{d.employee_code||"CORPORATE"} · {d.file_name}</div></div><button onClick={()=>void downloadDoc(d)} className="flex h-9 items-center gap-1 rounded-lg border border-[#1a3a5c] px-3 text-xs font-black"><Download size={14}/>Open</button></div><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#6f91aa]"><span>Effective: {d.effective_date||"-"}</span><span>Expiry: {d.expiry_date||"-"}</span><span>Status: {d.status}</span></div></div>)}{!docs.length&&<div className="p-10 text-center text-[#6f91aa]">No HR documents registered yet.</div>}</div>
      </div>
    </section>

    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2"><Users size={18} className="text-[#38bdf8]"/><h2 className="font-black">Employee Master</h2></div><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[#6f91aa]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee, department, branch..." className="h-10 min-w-[340px] rounded-xl border border-[#1a3a5c] bg-[#061524] pl-9 pr-3"/></div></div>
      <div className="mt-4 max-h-[650px] overflow-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead className="sticky top-0 bg-[#061524] text-[#8fb2c9]"><tr><th className="p-3">Employee</th><th>Name</th><th>Department</th><th>Role</th><th>Branch</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((e:any)=><tr key={e.employee_code||e.employee_id||e.email} className="border-t border-[#1a3a5c]/60"><td className="p-3 font-mono text-[#38bdf8]">{e.employee_code||e.employee_id||"-"}</td><td className="font-black">{e.display_name||e.employee_name||e.full_name||"-"}</td><td>{e.department||"-"}</td><td>{e.role_label||e.role_id||"-"}</td><td>{e.branch_code||"-"}</td><td>{e.email||"-"}</td><td>{e.status||"-"}</td><td><div className="flex gap-2"><button onClick={()=>setEmployeeEdit({...e})} className="inline-flex items-center gap-1 rounded-lg border border-[#38bdf8]/40 px-2 py-1.5 font-black text-[#38bdf8]"><Edit3 size={13}/>Edit</button><button onClick={()=>void deleteEmployee(e)} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2 py-1.5 font-black text-rose-300"><Trash2 size={13}/>Delete</button></div></td></tr>)}</tbody></table>{!filtered.length&&<div className="p-10 text-center text-[#6f91aa]">No employees match the search.</div>}</div>
    </section>

    {employeeEdit&&<div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-[#f6b84b]">EDIT EMPLOYEE</div><h3 className="mt-1 text-xl font-black">{employeeEdit.display_name||employeeEdit.employee_name||employeeEdit.full_name||employeeEdit.employee_code||employeeEdit.employee_id}</h3></div><button onClick={()=>setEmployeeEdit(null)}><X size={20}/></button></div><p className="mt-2 text-xs text-[#8fb2c9]">All fields below accept manual text. Type a new value directly where required.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{[
      ["employee_code","Employee Code"],["employee_name","Employee Name"],["display_name","Display Name"],["department","Department"],["role_id","Role"],["branch_code","Branch"],["email","Email"],["phone_primary","Phone"],["status","Status"]
    ].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input value={employeeEdit[k]??""} onChange={e=>setEmployeeEdit({...employeeEdit,[k]:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 text-white"/></label>)}</div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setEmployeeEdit(null)} className="h-11 rounded-xl border border-[#1a3a5c] px-5 font-black">Cancel</button><button onClick={()=>void saveEmployee()} disabled={employeeBusy} className="h-11 rounded-xl bg-[#f6b84b] px-6 font-black text-[#061524] disabled:opacity-50">{employeeBusy?"Saving...":"Save Employee"}</button></div></div></div>}
  </div>;
}
