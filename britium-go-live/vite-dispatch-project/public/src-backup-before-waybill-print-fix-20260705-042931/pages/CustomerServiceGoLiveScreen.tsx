// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { RefreshCw, Search, Truck, Ticket, Zap, Package, AlertTriangle, Clock, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const C = { page:"#0A1628", card:"#0E1E38", cardHi:"#122040", border:"#1A3050", gold:"#C9A84C", text:"#E8F0FE", sub:"#8BA8D4", muted:"#4A6080" };
const S = {
  page: { minHeight:"100vh", background:C.page, color:C.text, fontFamily:"'Inter',sans-serif", padding:"24px" },
  card: { background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:16 },
  cardHi: { background:C.cardHi, border:`1px solid ${C.border}`, borderRadius:12, padding:20 },
  input: { background:"#071020", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", color:C.text, width:"100%", fontSize:14, outline:"none" },
  btn: (bg=C.gold) => ({ background:bg, border:"none", borderRadius:8, padding:"8px 18px", color:bg===C.gold?"#0A1628":C.text, fontSize:13, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }),
  th: { padding:"10px 14px", textAlign:"left", color:C.sub, fontSize:12, fontWeight:600, textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" },
  td: { padding:"10px 14px", fontSize:13, borderBottom:`1px solid ${C.border}`, color:C.text },
  badge: (c="#1A3050",tc=C.text) => ({ background:c, color:tc, borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700, display:"inline-block" }),
  label: { fontSize:12, color:C.sub, marginBottom:4, display:"block" },
  spin: { display:"flex", alignItems:"center", justifyContent:"center", padding:40, color:C.sub },
  empty: { textAlign:"center", padding:40, color:C.muted, fontSize:14 },
  err: { background:"#2A0A0A", border:`1px solid #5A1A1A`, borderRadius:8, padding:12, color:"#FF6B6B", fontSize:13, marginBottom:12 },
  tab: (active) => ({ padding:"10px 20px", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"8px 8px 0 0", border:"none", background:active?C.cardHi:"transparent", color:active?C.gold:C.sub, borderBottom:active?`2px solid ${C.gold}`:"2px solid transparent", transition:"all .2s" }),
  row: { display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" },
};

const Spinner = () => <div style={S.spin}><Loader2 size={28} style={{animation:"spin 1s linear infinite"}} /><span style={{marginLeft:10}}>Loading…</span></div>;
const Empty = ({msg="No data available"}) => <div style={S.empty}><Package size={32} style={{marginBottom:8,opacity:.4}}/><br/>{msg}</div>;
const Err = ({msg}) => msg ? <div style={S.err}><AlertTriangle size={14} style={{marginRight:6}}/>{msg}</div> : null;

// ── TAB 1: TRIAGE QUEUE ──────────────────────────────────────────────────────
function TriageTab() {
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null);
  const load = useCallback(async()=>{ setLoading(true);setErr(null); try{ const{data,error}=await supabase.rpc("be_cs_exception_triage_queue"); if(error)throw error; setRows(data||[]); }catch(e){setErr(e.message)}finally{setLoading(false)} },[]);
  useEffect(()=>{load()},[]);
  const unresolved = rows.filter(r=>r.status!=="RESOLVED").length;
  return <div>
    <div style={{...S.row,marginBottom:16}}>
      <span style={{fontSize:16,fontWeight:700}}>Exception Triage Queue</span>
      <span style={S.badge(C.gold,"#0A1628")}>{unresolved} Unresolved</span>
      <button style={S.btn(C.cardHi)} onClick={load}><RefreshCw size={14}/>Refresh</button>
    </div>
    <Err msg={err}/>
    {loading?<Spinner/>:!rows.length?<Empty msg="No exceptions in queue"/>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>{["Tracking ID","Type","Wayplan","ETA Slip","Triggered","Actions"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2?C.cardHi:C.card}}>
        <td style={S.td}><code style={{color:C.gold}}>{r.tracking_id}</code></td>
        <td style={S.td}><span style={S.badge(r.exception_type==="Damaged"?"#3A1010":r.exception_type==="Delay"?"#2A2A0A":"#0A2A3A",r.exception_type==="Damaged"?"#FF8080":r.exception_type==="Delay"?"#FFD080":"#80D0FF")}>{r.exception_type}</span></td>
        <td style={S.td}>{r.wayplan_id||"—"}</td>
        <td style={{...S.td,color:r.eta_slip_minutes>30?"#FF8080":C.text}}>{r.eta_slip_minutes!=null?`+${r.eta_slip_minutes} min`:"—"}</td>
        <td style={{...S.td,color:C.muted,fontSize:12}}>{r.triggered_at?new Date(r.triggered_at).toLocaleString():"—"}</td>
        <td style={S.td}><div style={{display:"flex",gap:6}}>
          <button style={S.btn("#0A3020")} onClick={async()=>{try{await supabase.rpc("be_cs_resolve_exception",{p_id:r.id});load()}catch(e){alert(e.message)}}}>✓ Resolve</button>
          <button style={S.btn("#0A1A40")} onClick={async()=>{const ag=prompt("Reassign to agent:");if(ag)try{await supabase.rpc("be_cs_reassign_exception",{p_id:r.id,p_agent:ag});load()}catch(e){alert(e.message)}}}>⇄ Reassign</button>
        </div></td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

// ── TAB 2: LIVE FLEET ────────────────────────────────────────────────────────
function FleetTab() {
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null);
  const load = useCallback(async()=>{ setLoading(true);setErr(null); try{ const{data,error}=await supabase.rpc("be_cs_live_fleet_snapshot"); if(error)throw error; setRows(data||[]); }catch(e){setErr(e.message)}finally{setLoading(false)} },[]);
  useEffect(()=>{load()},[]);
  return <div>
    <div style={{...S.row,marginBottom:16}}>
      <span style={{fontSize:16,fontWeight:700}}>Live Fleet Visibility</span>
      <button style={S.btn(C.gold)} onClick={load}><RefreshCw size={14}/>Refresh Snapshot</button>
    </div>
    <Err msg={err}/>
    {loading?<Spinner/>:!rows.length?<Empty msg="No active fleet data"/>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>{["Wayplan ID","Driver","Vehicle","Status","Lat","Lng","Stops Done","Total","Last Ping"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2?C.cardHi:C.card}}>
        <td style={S.td}><code style={{color:C.gold}}>{r.wayplan_id}</code></td>
        <td style={S.td}>{r.driver_name}</td>
        <td style={S.td}>{r.vehicle_type}</td>
        <td style={S.td}><span style={S.badge(r.status==="ACTIVE"?"#0A3020":"#2A2A2A",r.status==="ACTIVE"?"#80FF80":C.muted)}>{r.status}</span></td>
        <td style={{...S.td,color:C.sub,fontSize:12}}>{r.lat?.toFixed(5)??'—'}</td>
        <td style={{...S.td,color:C.sub,fontSize:12}}>{r.lng?.toFixed(5)??'—'}</td>
        <td style={S.td}>{r.stops_completed??0}</td>
        <td style={S.td}>{r.stops_total??0}</td>
        <td style={{...S.td,color:C.muted,fontSize:12}}>{r.last_ping?new Date(r.last_ping).toLocaleTimeString():"—"}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

// ── TAB 3: ORDER SEARCH ──────────────────────────────────────────────────────
function OrderTab() {
  const [q,setQ]=useState(""); const [result,setResult]=useState(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null);
  const search = async()=>{ if(!q.trim())return; setLoading(true);setErr(null);setResult(null); try{ const{data,error}=await supabase.rpc("be_cs_order_lookup",{p_tracking:q.trim()}); if(error)throw error; setResult(data?.[0]||null); }catch(e){setErr(e.message)}finally{setLoading(false)} };
  const F=({l,v})=><div style={{marginBottom:10}}><span style={S.label}>{l}</span><span style={{color:C.text,fontSize:14}}>{v||"—"}</span></div>;
  return <div>
    <div style={{...S.row,marginBottom:16}}>
      <div style={{flex:1,minWidth:200}}><input style={S.input} placeholder="Enter tracking number…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}/></div>
      <button style={S.btn(C.gold)} onClick={search}><Search size={14}/>Search</button>
    </div>
    <Err msg={err}/>
    {loading?<Spinner/>:result?
    <div style={S.cardHi}>
      <div style={{...S.row,marginBottom:16}}><span style={{fontSize:15,fontWeight:700}}>Shipment Detail</span><code style={{...S.badge(C.gold,"#0A1628"),fontSize:13}}>{result.tracking_number}</code></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"0 24px"}}>
        <F l="Merchant" v={result.merchant_name}/><F l="Recipient" v={result.recipient_name}/><F l="Address" v={result.delivery_address}/><F l="Township" v={result.township}/>
        <F l="COD Amount" v={result.cod_amount!=null?`MMK ${Number(result.cod_amount).toLocaleString()}`:"N/A"}/><F l="Weight" v={result.weight_kg?`${result.weight_kg} kg`:"—"}/>
        <F l="Status" v={<span style={S.badge()}>{result.status}</span>}/><F l="Wayplan Stop" v={result.wayplan_stop_sequence}/>
        <F l="Planned ETA" v={result.planned_eta?new Date(result.planned_eta).toLocaleString():"—"}/><F l="Actual Arrival" v={result.actual_arrival?new Date(result.actual_arrival).toLocaleString():"—"}/>
        <F l="Driver" v={result.driver_name}/><F l="Driver Phone" v={result.driver_phone}/>
      </div>
    </div>:err?null:<Empty msg="Enter a tracking number to search"/>}
  </div>;
}

// ── TAB 4: TICKETS ───────────────────────────────────────────────────────────
function TicketsTab() {
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null);
  const [page,setPage]=useState(1); const [filter,setFilter]=useState("ALL");
  const load=useCallback(async()=>{ setLoading(true);setErr(null); try{ const{data,error}=await supabase.rpc("be_cs_ticket_list",{p_page:page,p_status_filter:filter==="ALL"?null:filter}); if(error)throw error; setRows(data||[]); }catch(e){setErr(e.message)}finally{setLoading(false)} },[page,filter]);
  useEffect(()=>{load()},[load]);
  const slaColor=(t)=>{ if(!t)return C.muted; const m=(new Date(t)-new Date())/60000; return m<60&&m>0?"#FF4040":m<=0?"#FF8080":C.text; };
  return <div>
    <div style={{...S.row,marginBottom:16}}>
      <span style={{fontSize:16,fontWeight:700}}>Support Tickets</span>
      <select style={{...S.input,width:"auto"}} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}>
        {["ALL","OPEN","IN_PROGRESS","RESOLVED"].map(s=><option key={s}>{s}</option>)}
      </select>
      <button style={S.btn(C.cardHi)} onClick={load}><RefreshCw size={14}/>Refresh</button>
    </div>
    <Err msg={err}/>
    {loading?<Spinner/>:!rows.length?<Empty msg="No tickets found"/>:
    <><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>{["Ticket ID","Customer","Category","Status","SLA Breach","Agent"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2?C.cardHi:C.card}}>
        <td style={S.td}><code style={{color:C.gold,fontSize:12}}>{r.ticket_id}</code></td>
        <td style={S.td}>{r.customer_name}</td>
        <td style={S.td}>{r.category}</td>
        <td style={S.td}><span style={S.badge(r.status==="RESOLVED"?"#0A3020":r.status==="IN_PROGRESS"?"#1A2A0A":"#2A1A0A",r.status==="RESOLVED"?"#80FF80":r.status==="IN_PROGRESS"?"#D0FF80":"#FFB080")}>{r.status}</span></td>
        <td style={{...S.td,color:slaColor(r.sla_breach_at),fontWeight:slaColor(r.sla_breach_at)==="#FF4040"?700:400}}>{r.sla_breach_at?new Date(r.sla_breach_at).toLocaleString():"—"}</td>
        <td style={S.td}>{r.assigned_agent||<span style={{color:C.muted}}>Unassigned</span>}</td>
      </tr>)}</tbody>
    </table></div>
    <div style={{...S.row,marginTop:12,justifyContent:"flex-end"}}>
      <button style={S.btn(C.cardHi)} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft size={14}/>Prev</button>
      <span style={{color:C.sub,fontSize:13}}>Page {page}</span>
      <button style={S.btn(C.cardHi)} onClick={()=>setPage(p=>p+1)} disabled={rows.length<20}><ChevronRight size={14}/>Next</button>
    </div></>}
  </div>;
}

// ── TAB 5: ACTIONS ───────────────────────────────────────────────────────────
function ActionsTab() {
  const [rr,setRr]=useState({tracking:"",address:"",loading:false,msg:""});
  const [rd,setRd]=useState({tracking:"",date:"",loading:false,msg:""});
  const [br,setBr]=useState({wayplan:"",message:"",loading:false,msg:""});
  const act = async(rpcName,params,setState)=>{ setState(s=>({...s,loading:true,msg:""})); try{ const{error}=await supabase.rpc(rpcName,params); if(error)throw error; setState(s=>({...s,msg:"✓ Success",loading:false})); }catch(e){setState(s=>({...s,msg:`✗ ${e.message}`,loading:false}))} };
  const ActionCard=({title,icon,children})=><div style={{...S.cardHi,flex:1,minWidth:260,marginBottom:12}}>
    <div style={{...S.row,marginBottom:14}}>{icon}<span style={{fontWeight:700,fontSize:15}}>{title}</span></div>{children}</div>;
  return <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
    <ActionCard title="Live Re-route" icon={<Zap size={18} color={C.gold}/>}>
      <label style={S.label}>Tracking #</label><input style={{...S.input,marginBottom:10}} value={rr.tracking} onChange={e=>setRr(s=>({...s,tracking:e.target.value}))} placeholder="e.g. BR-00123"/>
      <label style={S.label}>New Address</label><textarea style={{...S.input,marginBottom:10,minHeight:80,resize:"vertical"}} value={rr.address} onChange={e=>setRr(s=>({...s,address:e.target.value}))} placeholder="Full new delivery address…"/>
      <button style={S.btn(C.gold)} onClick={()=>act("be_cs_reroute_shipment",{p_tracking:rr.tracking,p_new_address:rr.address},setRr)} disabled={rr.loading}>{rr.loading?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>:<Zap size={14}/>}Intercept &amp; Re-route</button>
      {rr.msg&&<div style={{marginTop:8,fontSize:13,color:rr.msg.startsWith("✓")?"#80FF80":"#FF8080"}}>{rr.msg}</div>}
    </ActionCard>
    <ActionCard title="Schedule Redelivery" icon={<Clock size={18} color={C.gold}/>}>
      <label style={S.label}>Tracking #</label><input style={{...S.input,marginBottom:10}} value={rd.tracking} onChange={e=>setRd(s=>({...s,tracking:e.target.value}))} placeholder="e.g. BR-00456"/>
      <label style={S.label}>Redeliver Date</label><input type="date" style={{...S.input,marginBottom:10}} value={rd.date} onChange={e=>setRd(s=>({...s,date:e.target.value}))}/>
      <button style={S.btn(C.gold)} onClick={()=>act("be_cs_schedule_redelivery",{p_tracking:rd.tracking,p_redeliver_date:rd.date},setRd)} disabled={rd.loading}>{rd.loading?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>:<Clock size={14}/>}Push to Tomorrow's Queue</button>
      {rd.msg&&<div style={{marginTop:8,fontSize:13,color:rd.msg.startsWith("✓")?"#80FF80":"#FF8080"}}>{rd.msg}</div>}
    </ActionCard>
    <ActionCard title="Broadcast Delay Alert" icon={<AlertTriangle size={18} color={C.gold}/>}>
      <label style={S.label}>Wayplan ID</label><input style={{...S.input,marginBottom:10}} value={br.wayplan} onChange={e=>setBr(s=>({...s,wayplan:e.target.value}))} placeholder="e.g. WP-20240601-001"/>
      <label style={S.label}>SMS Message</label><textarea style={{...S.input,marginBottom:10,minHeight:80,resize:"vertical"}} value={br.message} onChange={e=>setBr(s=>({...s,message:e.target.value}))} placeholder="Broadcast message to all recipients…"/>
      <button style={S.btn(C.gold)} onClick={()=>act("be_cs_broadcast_delay",{p_wayplan_id:br.wayplan,p_message:br.message},setBr)} disabled={br.loading}>{br.loading?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>:<AlertTriangle size={14}/>}Send SMS Broadcast</button>
      {br.msg&&<div style={{marginTop:8,fontSize:13,color:br.msg.startsWith("✓")?"#80FF80":"#FF8080"}}>{br.msg}</div>}
    </ActionCard>
  </div>;
}

// ── TAB 6: PICKUP INTAKE ─────────────────────────────────────────────────────
function PickupTab() {
  const blank={merchant_code:"",merchant_name:"",pickup_address:"",township:"",parcel_count:"",pickup_date:"",contact_phone:"",notes:""};
  const [form,setForm]=useState(blank); const [loading,setLoading]=useState(false); const [msg,setMsg]=useState(""); const [submitted,setSubmitted]=useState([]); const [loadingList,setLoadingList]=useState(false);
  const F=({k,label,type="text",placeholder=""})=><div style={{marginBottom:12}}>
    <label style={S.label}>{label}</label>
    <input type={type} style={S.input} value={form[k]} onChange={e=>setForm(s=>({...s,[k]:e.target.value}))} placeholder={placeholder}/>
  </div>;
  const loadSubmitted=async()=>{ setLoadingList(true); try{ const{data}=await supabase.rpc("be_cs_submitted_pickups"); setSubmitted(data||[]); }catch(e){}finally{setLoadingList(false)} };
  useEffect(()=>{loadSubmitted()},[]);
  const submit=async()=>{ setLoading(true);setMsg(""); try{ const{error}=await supabase.rpc("be_cs_submit_pickup_request",{...form,p_parcel_count:parseInt(form.parcel_count)||0}); if(error)throw error; setMsg("✓ Pickup request submitted"); setForm(blank); loadSubmitted(); }catch(e){setMsg(`✗ ${e.message}`)}finally{setLoading(false)} };
  return <div>
    <div style={S.cardHi}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>New Pickup Request</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"0 20px"}}>
        <F k="merchant_code" label="Merchant Code" placeholder="MC-000"/><F k="merchant_name" label="Merchant Name" placeholder="Shop Name"/>
        <F k="pickup_address" label="Pickup Address" placeholder="Street, Ward…"/><F k="township" label="Township" placeholder="e.g. Hlaing"/>
        <F k="parcel_count" label="Parcel Count" type="number" placeholder="0"/><F k="pickup_date" label="Pickup Date" type="date"/>
        <F k="contact_phone" label="Contact Phone" placeholder="+95 9…"/>
      </div>
      <label style={S.label}>Notes</label>
      <textarea style={{...S.input,minHeight:60,marginBottom:14,resize:"vertical"}} value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Special instructions…"/>
      <button style={S.btn(C.gold)} onClick={submit} disabled={loading}>{loading?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>:<Package size={14}/>}Submit Pickup Request</button>
      {msg&&<div style={{marginTop:10,fontSize:13,color:msg.startsWith("✓")?"#80FF80":"#FF8080"}}>{msg}</div>}
    </div>
    <div style={{marginTop:20,fontWeight:700,fontSize:14,marginBottom:10}}>Submitted Pickups</div>
    {loadingList?<Spinner/>:!submitted.length?<Empty msg="No submitted pickups yet"/>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>{["Merchant Code","Merchant Name","Township","Parcels","Date","Phone","Status"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{submitted.map((r,i)=><tr key={i} style={{background:i%2?C.cardHi:C.card}}>
        <td style={S.td}><code style={{color:C.gold}}>{r.merchant_code}</code></td>
        <td style={S.td}>{r.merchant_name}</td><td style={S.td}>{r.township}</td>
        <td style={S.td}>{r.parcel_count}</td><td style={S.td}>{r.pickup_date}</td>
        <td style={S.td}>{r.contact_phone}</td>
        <td style={S.td}><span style={S.badge()}>{r.status||"PENDING"}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
const TABS=[{id:"triage",label:"Triage Queue",icon:<AlertTriangle size={14}/>},{id:"fleet",label:"Live Fleet",icon:<Truck size={14}/>},{id:"orders",label:"Order Search",icon:<Search size={14}/>},{id:"tickets",label:"Tickets",icon:<Ticket size={14}/>},{id:"actions",label:"Actions",icon:<Zap size={14}/>},{id:"pickup",label:"Pickup Intake",icon:<Package size={14}/>}];

export default function CustomerServiceGoLiveScreen() {
  const [activeTab,setActiveTab]=useState("triage");
  const [syncTime,setSyncTime]=useState(new Date());
  const [openExceptions,setOpenExceptions]=useState(null);
  const refreshAll=async()=>{ setSyncTime(new Date()); try{ const{data}=await supabase.rpc("be_cs_exception_triage_queue"); setOpenExceptions((data||[]).filter(r=>r.status!=="RESOLVED").length); }catch(e){} };
  useEffect(()=>{refreshAll()},[]);
  return <div style={S.page}>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
    {/* HEADER */}
    <div style={{...S.card,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginBottom:8}}>
      <span style={{...S.badge(C.gold,"#0A1628"),fontSize:14,padding:"4px 16px",letterSpacing:1}}>BRITIUM EXPRESS</span>
      <div style={{flex:1}}><h1 style={{margin:0,fontSize:20,fontWeight:800,color:C.text}}>CS COMMAND CENTER</h1><div style={{fontSize:12,color:C.sub}}>Customer Service Portal</div></div>
      <button style={S.btn(C.gold)} onClick={refreshAll}><RefreshCw size={14}/>Refresh All</button>
    </div>
    {/* STATUS BANNER */}
    <div style={{...S.card,display:"flex",gap:20,alignItems:"center",padding:"10px 16px",marginBottom:0,borderRadius:"8px 8px 0 0"}}>
      <CheckCircle size={14} color="#80FF80"/><span style={{fontSize:12,color:C.sub}}>Last Sync: <b style={{color:C.text}}>{syncTime.toLocaleTimeString()}</b></span>
      <span style={{color:C.border}}>|</span>
      <AlertTriangle size={14} color={openExceptions>0?C.gold:"#4A6080"}/><span style={{fontSize:12,color:C.sub}}>Open Exceptions: <b style={{color:openExceptions>0?C.gold:C.text}}>{openExceptions??'—'}</b></span>
    </div>
    {/* TABS */}
    <div style={{display:"flex",gap:4,background:C.card,borderLeft:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,padding:"0 8px",flexWrap:"wrap"}}>
      {TABS.map(t=><button key={t.id} style={S.tab(activeTab===t.id)} onClick={()=>setActiveTab(t.id)}><span style={{display:"flex",alignItems:"center",gap:6}}>{t.icon}{t.label}</span></button>)}
    </div>
    {/* CONTENT */}
    <div style={{...S.card,borderRadius:"0 0 12px 12px",marginTop:0,minHeight:400}}>
      {activeTab==="triage"&&<TriageTab/>}
      {activeTab==="fleet"&&<FleetTab/>}
      {activeTab==="orders"&&<OrderTab/>}
      {activeTab==="tickets"&&<TicketsTab/>}
      {activeTab==="actions"&&<ActionsTab/>}
      {activeTab==="pickup"&&<PickupTab/>}
    </div>
  </div>;
}
