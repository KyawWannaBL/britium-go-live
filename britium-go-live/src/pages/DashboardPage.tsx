// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Activity, Building2, DollarSign, RefreshCw, Store, Truck, Users, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const C={panel:"#0b2236",border:"#1a3a5c",sub:"#8fb2c9",gold:"#f6b84b",green:"#34d399",blue:"#38bdf8",red:"#fb7185"};
const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";
const num=(v:any)=>Number(v||0).toLocaleString();

function Card({title,value,icon:Icon,accent=C.gold,sub}:{title:string;value:any;icon:any;accent?:string;sub?:string}){
  return <div className="rounded-2xl border p-5" style={{background:C.panel,borderColor:C.border}}>
    <div className="flex items-center justify-between gap-3"><div className="text-[11px] font-black uppercase tracking-wider" style={{color:C.sub}}>{title}</div><Icon size={18} color={accent}/></div>
    <div className="mt-2 text-2xl font-black text-white">{value}</div>
    {sub&&<div className="mt-1 text-xs" style={{color:C.sub}}>{sub}</div>}
  </div>;
}

export default function DashboardPage(){
  const { profile }=useAuth();
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);setError("");
    const {data,error}=await (supabase as any).rpc("be_role_dashboard_v1");
    if(error||data?.ok===false){setError(error?.message||data?.code||"Dashboard unavailable.");setLoading(false);return;}
    setData(data);setLoading(false);
  }
  useEffect(()=>{void load();},[]);

  const role=String(data?.role||profile?.role||"").replaceAll("-","_").toLowerCase();
  const superView=["superadmin","super_admin","admin","management","director"].includes(role);
  const financeView=superView||["finance","finance_user","accountant"].includes(role);
  const opsView=superView||["operation_manager","operations","operations_admin","supervisor","warehouse","dispatch","cs","customer_service"].includes(role);
  const hrView=superView||["hr_admin"].includes(role);
  const growthView=superView||["marketing","business_development","biz_dev"].includes(role);
  const branchView=superView||["branch_admin","branch_office"].includes(role);

  const o=data?.operations||{},f=data?.finance||{},w=data?.warehouse||{},h=data?.hr||{},g=data?.growth||{},b=data?.branches||{};

  return <div className="min-h-full bg-[#061524] p-2 text-[#eef8ff]">
    <section className="rounded-3xl border p-6" style={{background:C.panel,borderColor:C.border}}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="text-[11px] font-black uppercase tracking-[.24em]" style={{color:C.gold}}>{superView?"SUPER ADMIN BIRD'S-EYE VIEW":"ROLE DASHBOARD"}</div>
          <h1 className="mt-2 text-3xl font-black">{superView?"Britium Express Enterprise Daily Control Tower":"Daily Operations Dashboard"}</h1>
          <p className="mt-2 text-sm" style={{color:C.sub}}>Role: {role||"—"} · Scope: {data?.scope||"—"} · Branch: {data?.branch_code||"—"} · Work date: {data?.work_date||"—"}</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border px-4 font-black" style={{borderColor:C.border,background:"#061524"}}><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh Live Data</button>
      </div>
      {error&&<div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-300">{error}</div>}
    </section>

    {opsView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><Activity size={19} color={C.blue}/><h2 className="font-black">Operations Today</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Card title="Pickups Today" value={num(o.pickups_today)} icon={Truck} accent={C.blue}/>
        <Card title="Pending Pickups" value={num(o.pending_pickups)} icon={Activity} accent={C.gold}/>
        <Card title="Active Shipments" value={num(o.active_shipments)} icon={Truck} accent={C.blue}/>
        <Card title="Delivered Today" value={num(o.delivered_today)} icon={Truck} accent={C.green}/>
        <Card title="Failed Today" value={num(o.failed_today)} icon={Activity} accent={C.red}/>
        <Card title="Open Exceptions" value={num(o.exceptions_open)} icon={Activity} accent={C.red}/>
      </div>
    </section>}

    {financeView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><DollarSign size={19} color={C.green}/><h2 className="font-black">Finance & Settlement</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Settlement Rows" value={num(f.settlement_rows)} icon={DollarSign} accent={C.blue}/>
        <Card title="Pending Settlement" value={num(f.pending_rows)} icon={DollarSign} accent={C.gold}/>
        <Card title="COD Expected" value={money(f.cod_expected)} icon={DollarSign} accent={C.green}/>
        <Card title="Merchant Payable" value={money(f.merchant_payable)} icon={DollarSign} accent={C.gold}/>
        <Card title="Merchant Receivable" value={money(f.merchant_receivable)} icon={DollarSign} accent={C.blue}/>
        <Card title="Delivery Revenue" value={money(f.delivery_revenue)} icon={DollarSign} accent={C.green}/>
        <Card title="Settled Rows" value={num(f.settled_rows)} icon={DollarSign} accent={C.green}/>
      </div>
    </section>}

    {opsView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><Warehouse size={19} color={C.gold}/><h2 className="font-black">Warehouse Live Status</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Warehouse Rows" value={num(w.rows)} icon={Warehouse}/>
        <Card title="Inbound" value={num(w.inbound)} icon={Warehouse} accent={C.blue}/>
        <Card title="Dispatch" value={num(w.dispatch)} icon={Truck} accent={C.green}/>
        <Card title="Returns" value={num(w.returns)} icon={Warehouse} accent={C.red}/>
      </div>
    </section>}

    {hrView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><Users size={19} color={C.blue}/><h2 className="font-black">Admin / HR</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card title="Employees" value={num(h.total_employees)} icon={Users}/>
        <Card title="Active" value={num(h.active_employees)} icon={Users} accent={C.green}/>
        <Card title="Departments" value={num(h.departments)} icon={Users}/>
        <Card title="Branches" value={num(h.branches)} icon={Building2}/>
        <Card title="Riders" value={num(h.riders)} icon={Users}/>
        <Card title="Drivers" value={num(h.drivers)} icon={Users}/>
        <Card title="Helpers" value={num(h.helpers)} icon={Users}/>
      </div>
    </section>}

    {growthView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><Store size={19} color={C.gold}/><h2 className="font-black">Marketing & Business Development</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card title="Active Merchants" value={num(g.merchants)} icon={Store}/>
        <Card title="Marketing Leads" value={num(g.leads)} icon={Store} accent={C.blue}/>
        <Card title="Active Prospects" value={num(g.active_prospects)} icon={Store} accent={C.gold}/>
        <Card title="Closed Won" value={num(g.closed_won)} icon={Store} accent={C.green}/>
        <Card title="Pipeline Value" value={money(g.pipeline_value)} icon={DollarSign} accent={C.green}/>
      </div>
    </section>}

    {branchView&&<section className="mt-5">
      <div className="mb-3 flex items-center gap-2"><Building2 size={19} color={C.blue}/><h2 className="font-black">Branch Network</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Branches" value={num(b.total_branches)} icon={Building2}/>
        <Card title="Active Branches" value={num(b.active_branches)} icon={Building2} accent={C.green}/>
        <Card title="Branch Staff" value={num(b.staff)} icon={Users}/>
        <Card title="Pending Amendments" value={num(b.pending_amendments)} icon={Activity} accent={C.gold}/>
      </div>
    </section>}

    <p className="mt-6 text-xs" style={{color:C.sub}}>Live backend snapshot · {data?.as_of?new Date(data.as_of).toLocaleString():"not synchronized"}</p>
  </div>;
}
