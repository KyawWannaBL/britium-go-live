// @ts-nocheck
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Link } from "react-router-dom";
import { GO_LIVE_TEMPLATE_SCHEMAS, downloadCsv, parseCsvText } from "@/lib/britiumGoLiveTemplateSchemas";

export default function GoLiveTemplateCenterPage() {
  const [query, setQuery] = useState("");
  const [verifying,setVerifying]=useState(false);
  const [verification,setVerification]=useState<any[]>([]);
  const [notice,setNotice]=useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GO_LIVE_TEMPLATE_SCHEMAS;
    return GO_LIVE_TEMPLATE_SCHEMAS.filter((schema) => `${schema.title} ${schema.description} ${schema.headers.join(" ")}`.toLowerCase().includes(q));
  }, [query]);

  async function verifyTemplates(){
    setVerifying(true);setNotice("");
    const rows:any[]=[];
    for(const schema of GO_LIVE_TEMPLATE_SCHEMAS){
      const item:any={key:schema.key,title:schema.title,csv:"FAIL",xlsx:"FAIL",headers:"FAIL",upload_target:"",notes:[]};
      try{
        const csvRes=await fetch(schema.csvFile,{cache:"no-store"});
        if(!csvRes.ok)throw new Error("CSV HTTP "+csvRes.status);
        const text=await csvRes.text();
        const parsed=parseCsvText(text);
        item.csv="PASS";
        item.headers=JSON.stringify(parsed.headers)===JSON.stringify(schema.headers)?"PASS":"FAIL";
        if(item.headers!=="PASS")item.notes.push("CSV headers differ from schema.");
      }catch(e:any){item.notes.push(e?.message||"CSV verification failed");}
      try{
        const xlsxRes=await fetch(schema.xlsxFile,{cache:"no-store"});
        if(!xlsxRes.ok)throw new Error("XLSX HTTP "+xlsxRes.status);
        const wb=XLSX.read(await xlsxRes.arrayBuffer());
        const ws=wb.Sheets[wb.SheetNames[0]];
        const matrix=XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false}) as any[][];
        const headers=(matrix[0]||[]).map((x:any)=>String(x??"").trim());
        item.xlsx="PASS";
        if(JSON.stringify(headers)!==JSON.stringify(schema.headers)){
          item.headers="FAIL";item.notes.push("XLSX headers differ from schema.");
        }
      }catch(e:any){item.notes.push(e?.message||"XLSX verification failed");}
      item.upload_target=schema.key==="warehouse"?"/warehouse-uat":schema.key==="portal-upload"?"/merchant-portal":"/data-entry-uat";
      rows.push(item);
    }
    setVerification(rows);
    setNotice(rows.every(x=>x.csv==="PASS"&&x.xlsx==="PASS"&&x.headers==="PASS")?"All template files and schemas passed verification.":"Template verification found one or more issues.");
    setVerifying(false);
  }

  function downloadVerification(){
    const payload={generated_at:new Date().toISOString(),ok:verification.every(x=>x.csv==="PASS"&&x.xlsx==="PASS"&&x.headers==="PASS"),rows:verification};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="britium_template_verification_"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">Go-Live Templates</p>
            <h1 className="mt-2 text-4xl font-black">Template Download & Upload Center</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Header-only CSV/XLSX workbooks for Data Entry, Merchant/Customer uploads, and Warehouse scan intake. System-generated ID/result columns are intentionally blank and must be produced by the backend.
            </p>
          </div>
          <label className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <span className="text-xs font-black uppercase text-slate-400">Search templates</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full bg-transparent font-bold outline-none" placeholder="warehouse, merchant, upload..." />
          </label>
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        {visible.map((schema) => (
          <article key={schema.key} className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{schema.key}</p>
                <h2 className="mt-1 text-2xl font-black">{schema.title}</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 ring-1 ring-emerald-100">UAT Ready</span>
            </div>

            <p className="mt-3 min-h-16 text-sm font-semibold leading-6 text-slate-600">{schema.description}</p>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Required fields</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {schema.required.slice(0, 10).map((field) => (
                  <span key={field} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{field}</span>
                ))}
                {schema.required.length > 10 ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">+{schema.required.length - 10}</span> : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Backend generated / leave blank</p>
              <p className="mt-2 text-xs font-bold leading-5 text-blue-900">{schema.backendGenerated.join(", ")}</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <a href={schema.xlsxFile} download className="rounded-2xl bg-blue-700 px-4 py-3 text-center text-xs font-black uppercase text-white">Download XLSX</a>
              <a href={schema.csvFile} download className="rounded-2xl bg-white px-4 py-3 text-center text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200">Download CSV</a>
              <button type="button" onClick={() => downloadCsv(schema)} className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase text-white">Generate CSV</button>
              <Link to={schema.key === "warehouse" ? "/warehouse-uat" : schema.key === "portal-upload" ? "/merchant-portal" : "/data-entry-uat"} className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-xs font-black uppercase text-white">Open Upload</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
