// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Bell, MessageCircle, PackagePlus, RefreshCw, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";
const fmt=(v:any)=>v?new Date(v).toLocaleString():"-";

export default function MerchantPortalPage(){
  const [snapshot,setSnapshot]=useState<any>({identity:{},pickups:[],shipments:[],settlements:[],tickets:[],invoices:[]});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [tab,setTab]=useState("pickups");
  const [search,setSearch]=useState("");
  const [pickup,setPickup]=useState({pickup_address:"",township:"",city:"Yangon",region:"Yangon",parcel_count:"1",cod_amount:"0",payment_terms:"COD",pickup_date:new Date().toISOString().slice(0,10),pickup_time:"",priority:"Normal",special_instructions:""});
  const [ticket,setTicket]=useState({subject:"",description:"",priority:"Medium"});

  async function load(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_merchant_portal_v1_snapshot",{p_payload:{limit:300}});
    if(error || data?.ok===false){
      setMessage(error?.message||data?.error||"Unable to load Merchant Portal.");
      setLoading(false); return;
    }
    setSnapshot(data||{});
    setLoading(false);
  }

  async function submitPickup(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_merchant_submit_pickup_request",{p_payload:pickup});
    if(error || data?.ok===false){
      setMessage(error?.message||data?.error||"Pickup request failed.");
      setLoading(false); return;
    }
    setMessage("Pickup request submitted: "+(data?.pickup_id||"-")+". Supervisor assignment queue updated.");
    setPickup({...pickup,parcel_count:"1",cod_amount:"0",special_instructions:""});
    await load();
  }

  async function submitTicket(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_merchant_portal_v1_create_ticket",{p_payload:ticket});
    if(error || data?.ok===false){
      setMessage(error?.message||data?.error||"Support ticket failed.");
      setLoading(false); return;
    }
    setMessage("Support ticket submitted to Customer Service.");
    setTicket({subject:"",description:"",priority:"Medium"});
    await load();
  }

  useEffect(()=>{void load();},[]);

  const pickups=Array.isArray(snapshot?.pickups)?snapshot.pickups:[];
  const shipments=Array.isArray(snapshot?.shipments)?snapshot.shipments:[];
  const settlements=Array.isArray(snapshot?.settlements)?snapshot.settlements:[];
  const tickets=Array.isArray(snapshot?.tickets)?snapshot.tickets:[];
  const identity=snapshot?.identity||{};
  const current=tab==="pickups"?pickups:tab==="shipments"?shipments:tab==="settlements"?settlements:tickets;
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return current;
    return current.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q));
  },[current,search]);

  return <div className="space-y-6 p-6 text-[#eef8ff]">
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.25em] text-[#f6b84b]">MERCHANT PORTAL</p>
          <h1 className="mt-2 text-3xl font-black">{identity?.merchant_name||"Merchant Dashboard"}</h1>
          <p className="mt-1 text-sm font-bold text-[#8ab0c9]">{identity?.merchant_code||"-"} · {identity?.email||"-"}</p>
          <p className="mt-2 text-sm text-[#8ab0c9]">Pickup requests, live shipments, COD settlement and Customer Service are synchronized from Supabase.</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[#1a3a5c] px-4 py-3 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button>
      </div>
      {message&&<div className="mt-4 rounded-2xl bg-[#061524] p-4 text-sm font-bold text-[#f6b84b]">{message}</div>}
    </section>

    <section className="grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-5"><p className="text-xs uppercase text-[#8ab0c9]">Pickup Requests</p><p className="mt-2 text-3xl font-black text-[#f6b84b]">{pickups.length}</p></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-5"><p className="text-xs uppercase text-[#8ab0c9]">Shipments</p><p className="mt-2 text-3xl font-black text-[#38bdf8]">{shipments.length}</p></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-5"><p className="text-xs uppercase text-[#8ab0c9]">Settlement Rows</p><p className="mt-2 text-3xl font-black text-[#22c55e]">{settlements.length}</p></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-5"><p className="text-xs uppercase text-[#8ab0c9]">Support Tickets</p><p className="mt-2 text-3xl font-black text-[#ff7aa2]">{tickets.length}</p></div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex items-center gap-2"><PackagePlus size={18} className="text-[#f6b84b]"/><h2 className="font-black">New Pickup Request</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={pickup.pickup_address} onChange={e=>setPickup({...pickup,pickup_address:e.target.value})} placeholder="Pickup Address" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input value={pickup.township} onChange={e=>setPickup({...pickup,township:e.target.value})} placeholder="Township" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input value={pickup.city} onChange={e=>setPickup({...pickup,city:e.target.value})} placeholder="City" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input value={pickup.region} onChange={e=>setPickup({...pickup,region:e.target.value})} placeholder="Region" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input type="number" min="1" value={pickup.parcel_count} onChange={e=>setPickup({...pickup,parcel_count:e.target.value})} placeholder="Parcel Count" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input type="number" min="0" value={pickup.cod_amount} onChange={e=>setPickup({...pickup,cod_amount:e.target.value})} placeholder="COD Amount" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input type="date" value={pickup.pickup_date} onChange={e=>setPickup({...pickup,pickup_date:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <input type="time" value={pickup.pickup_time} onChange={e=>setPickup({...pickup,pickup_time:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <select value={pickup.payment_terms} onChange={e=>setPickup({...pickup,payment_terms:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"><option>COD</option><option>PREPAID</option><option>CREDIT</option></select>
          <select value={pickup.priority} onChange={e=>setPickup({...pickup,priority:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"><option>Normal</option><option>High</option><option>Urgent</option></select>
          <textarea value={pickup.special_instructions} onChange={e=>setPickup({...pickup,special_instructions:e.target.value})} placeholder="Special Instructions" className="min-h-[100px] rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 md:col-span-2"/>
        </div>
        <button onClick={()=>void submitPickup()} disabled={loading||!pickup.pickup_address.trim()} className="mt-4 w-full rounded-xl bg-[#f6b84b] p-3 font-black text-[#061524] disabled:opacity-50">Submit Pickup Request</button>
      </div>

      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex items-center gap-2"><MessageCircle size={18} className="text-[#38bdf8]"/><h2 className="font-black">Customer Service</h2></div>
        <div className="mt-4 grid gap-3">
          <input value={ticket.subject} onChange={e=>setTicket({...ticket,subject:e.target.value})} placeholder="Subject" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
          <select value={ticket.priority} onChange={e=>setTicket({...ticket,priority:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select>
          <textarea value={ticket.description} onChange={e=>setTicket({...ticket,description:e.target.value})} placeholder="Describe the request / complaint / inquiry" className="min-h-[170px] rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/>
        </div>
        <button onClick={()=>void submitTicket()} disabled={loading||ticket.subject.trim().length<3||ticket.description.trim().length<5} className="mt-4 w-full rounded-xl bg-[#1a3a5c] p-3 font-black disabled:opacity-50">Submit to Customer Service</button>
      </div>
    </section>

    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-[#1a3a5c] p-4">
        {[["pickups","Pickup Requests"],["shipments","Live Shipments"],["settlements","Settlement"],["tickets","Support"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-black ${tab===id?"bg-[#f6b84b] text-[#061524]":"bg-[#061524] text-white"}`}>{label}</button>)}
        <div className="ml-auto flex min-w-[320px] items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><Search size={16} className="text-[#8ab0c9]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search records..." className="w-full bg-transparent py-2 outline-none"/></div>
      </div>
      <div className="max-h-[560px] overflow-auto p-4 space-y-3">
        {filtered.length===0?<div className="p-10 text-center text-[#8ab0c9]">No live records found.</div>:filtered.map((r:any,i:number)=><div key={r.id||r.pickup_id||r.delivery_way_id||i} className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-mono text-sm font-black text-[#38bdf8]">{r.delivery_way_id||r.pickup_id||r.settlement_id||r.ticket_no||r.id||"-"}</p><p className="mt-1 font-bold">{r.recipient_name||r.subject||r.status||r.merchant_name||"-"}</p></div>
            <span className="rounded-full bg-[#061524] px-3 py-1 text-xs font-black">{r.delivery_status||r.settlement_status||r.status||r.workflow_stage||"-"}</span>
          </div>
          <div className="mt-2 text-sm text-[#8ab0c9]">{r.cod_amount!==undefined?money(r.cod_amount):r.gross_cod!==undefined?money(r.gross_cod):r.description||r.pickup_address||"-"}</div>
          <div className="mt-2 text-xs text-[#4d7a9b]">{fmt(r.updated_at||r.created_at||r.delivered_at)}</div>
        </div>)}
      </div>
    </section>
  </div>;
}
