// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MerchantPortal.tsx — Merchant Portal  /api/v1/operations/*
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import { useShipments, useCreateShipment, useCreatePickup, useSettlements, useBulkUpload } from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import { useTrackShipment } from "../hooks/useApi";

type Tab = "dashboard" | "create" | "pickups" | "track" | "settlements" | "bulk";

const EMPTY_FORM = { receiver_name: "", receiver_phone: "", receiver_address: "", receiver_township: "", receiver_city: "", cod_amount: "", service_type: "standard", notes: "" };

export default function MerchantPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [form, setForm] = useState(EMPTY_FORM);
  const [pickupForm, setPickupForm] = useState({ pickup_date: "", pickup_window: "morning", parcel_count: "" });
  const [trackInput, setTrackInput] = useState("");
  const [trackAWB, setTrackAWB] = useState("");
  const bulkRef = useRef<HTMLInputElement>(null);

  const shipments = useShipments({ limit: "20" });
  const createShipment = useCreateShipment();
  const createPickup = useCreatePickup();
  const settlements = useSettlements();
  const bulkUpload = useBulkUpload();
  const trackResult = useTrackShipment(trackAWB);

  const tabs = [
    { id: "dashboard" as Tab, label: "🏠 Dashboard" },
    { id: "create" as Tab, label: "📦 Book Shipment" },
    { id: "pickups" as Tab, label: "🚚 Request Pickup" },
    { id: "track" as Tab, label: "🔍 Track" },
    { id: "settlements" as Tab, label: "💳 COD Settlement" },
    { id: "bulk" as Tab, label: "📊 Bulk Upload" },
  ];

  const handleBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = bulkRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    await bulkUpload.mutateAsync(fd);
    if (bulkRef.current) bulkRef.current.value = "";
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.headerTitle}>🛍️ Merchant Portal</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>
      <nav style={S.tabBar}>
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>{t.label}</button>)}
      </nav>

      <main style={S.main}>
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <h2 style={S.h2}>Recent Shipments</h2>
            {shipments.isLoading && <Spin />}
            <DTable
              data={shipments.data as unknown[]}
              cols={["AWB", "Receiver", "City", "COD", "Status", "Created"]}
              rowFn={(r: Record<string, unknown>) => [
                r.awb, r.receiver_name, r.receiver_city,
                `${Number(r.cod_amount ?? 0).toLocaleString()} MMK`,
                <SBadge key="s" s={String(r.status ?? "")} />,
                fmtDate(r.created_at as string),
              ]}
            />
          </div>
        )}

        {/* CREATE SHIPMENT */}
        {tab === "create" && (
          <div style={S.formCard}>
            <h2 style={S.h2}>Book New Shipment</h2>
            {createShipment.isError && <Err msg={createShipment.error?.message} />}
            {createShipment.isSuccess && <Succ msg={`✓ AWB generated: ${(createShipment.data as Record<string,unknown>)?.awb ?? "—"}`} />}
            <form style={S.form} onSubmit={async (e) => { e.preventDefault(); await createShipment.mutateAsync({ ...form, cod_amount: form.cod_amount ? Number(form.cod_amount) : 0 }); setForm(EMPTY_FORM); }}>
              {[["receiver_name","Receiver Name *","text",true],["receiver_phone","Receiver Phone *","tel",true],["receiver_address","Full Address *","text",true],["receiver_township","Township *","text",true],["receiver_city","City *","text",true]].map(([f,l,t,r]) => (
                <label key={String(f)} style={S.label}>{String(l)}<input type={String(t)} required={Boolean(r)} style={S.input} value={(form as Record<string,string>)[String(f)]} onChange={(e) => setForm((s) => ({...s,[String(f)]:e.target.value}))} /></label>
              ))}
              <label style={S.label}>COD Amount (MMK)<input type="number" min={0} style={S.input} value={form.cod_amount} onChange={(e) => setForm((s) => ({...s,cod_amount:e.target.value}))} /></label>
              <label style={S.label}>Service Type<select style={S.input} value={form.service_type} onChange={(e) => setForm((s) => ({...s,service_type:e.target.value}))}>{["standard","express","same_day","cod_express"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label style={{...S.label,gridColumn:"1/-1"}}>Notes<textarea style={{...S.input,height:56,resize:"vertical"}} value={form.notes} onChange={(e) => setForm((s) => ({...s,notes:e.target.value}))} /></label>
              <button type="submit" style={{...S.btn,gridColumn:"1/-1"}} disabled={createShipment.isPending}>{createShipment.isPending?"Booking…":"Book Shipment →"}</button>
            </form>
          </div>
        )}

        {/* PICKUPS */}
        {tab === "pickups" && (
          <div style={S.formCard}>
            <h2 style={S.h2}>Request Pickup</h2>
            {createPickup.isError && <Err msg={createPickup.error?.message} />}
            {createPickup.isSuccess && <Succ msg="Pickup scheduled ✓" />}
            <form style={{display:"flex",flexDirection:"column",gap:14,maxWidth:420}} onSubmit={async (e) => { e.preventDefault(); await createPickup.mutateAsync({...pickupForm,parcel_count:Number(pickupForm.parcel_count)}); setPickupForm({pickup_date:"",pickup_window:"morning",parcel_count:""}); }}>
              <label style={S.label}>Pickup Date *<input type="date" required style={S.input} value={pickupForm.pickup_date} onChange={(e) => setPickupForm((f) => ({...f,pickup_date:e.target.value}))} /></label>
              <label style={S.label}>Pickup Window<select style={S.input} value={pickupForm.pickup_window} onChange={(e) => setPickupForm((f) => ({...f,pickup_window:e.target.value}))}>{["morning","afternoon","evening"].map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
              <label style={S.label}>Parcel Count *<input type="number" min={1} required style={S.input} value={pickupForm.parcel_count} onChange={(e) => setPickupForm((f) => ({...f,parcel_count:e.target.value}))} /></label>
              <button type="submit" style={S.btn} disabled={createPickup.isPending}>{createPickup.isPending?"Scheduling…":"Schedule Pickup"}</button>
            </form>
          </div>
        )}

        {/* TRACK */}
        {tab === "track" && (
          <div>
            <h2 style={S.h2}>Track Shipment</h2>
            <form style={{display:"flex",gap:10,marginBottom:20,maxWidth:480}} onSubmit={(e) => {e.preventDefault();setTrackAWB(trackInput.trim());}}>
              <input style={{...S.input,flex:1,padding:"9px 14px"}} placeholder="AWB number…" value={trackInput} onChange={(e) => setTrackInput(e.target.value)} required />
              <button type="submit" style={S.btn}>Track</button>
            </form>
            {trackResult.isLoading && <Spin />}
            {trackResult.data && (
              <div style={S.trackCard}>
                <div style={{fontWeight:800,fontSize:17,marginBottom:8}}>AWB: {String((trackResult.data as Record<string,unknown>).awb ?? "")}</div>
                <SBadge s={String((trackResult.data as Record<string,unknown>).status ?? "")} />
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:16}}>
                  {Object.entries(trackResult.data as Record<string,unknown>).filter(([k]) => !["id","merchant_id","customer_id","rider_id","branch_id","manifest_id"].includes(k)).map(([k,v]) => (
                    <div key={k}><div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:13}}>{String(v ?? "—")}</div></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTLEMENTS */}
        {tab === "settlements" && (
          <div>
            <h2 style={S.h2}>COD Settlement Statements</h2>
            <DTable
              data={settlements.data as unknown[]}
              cols={["Batch No.", "Gross COD", "Service Fee", "Net Payable", "Transfer Status", "Created"]}
              rowFn={(r: Record<string,unknown>) => [r.batch_no, fmt(r.gross_amount), fmt(r.fee_amount), fmt(r.net_amount), <SBadge key="s" s={String(r.transfer_status??"")}/>, fmtDate(r.created_at as string)]}
            />
          </div>
        )}

        {/* BULK UPLOAD */}
        {tab === "bulk" && (
          <div style={S.formCard}>
            <h2 style={S.h2}>Bulk Upload Shipments</h2>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>Download the template, fill in receiver details, then upload the CSV/XLSX file.</p>
            <a href="/templates/britium-bulk-upload-template.csv" download style={{...S.btn,display:"inline-block",textDecoration:"none",marginBottom:20,fontSize:13}}>⬇ Download Template</a>
            {bulkUpload.isError && <Err msg={bulkUpload.error?.message} />}
            {bulkUpload.isSuccess && <Succ msg={`✓ Upload successful — ${(bulkUpload.data as Record<string,unknown>)?.imported ?? 0} shipments created`} />}
            <form onSubmit={handleBulk} style={{display:"flex",flexDirection:"column",gap:14,maxWidth:400}}>
              <label style={S.label}>Upload CSV / XLSX *<input ref={bulkRef} type="file" accept=".csv,.xlsx,.xls" required style={{...S.input,padding:"6px 10px"}} /></label>
              <button type="submit" style={S.btn} disabled={bulkUpload.isPending}>{bulkUpload.isPending?"Uploading…":"Upload File"}</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function DTable({data,cols,rowFn}:{data:unknown[];cols:string[];rowFn:(r:Record<string,unknown>)=>(string|React.ReactNode)[]}) {
  return <div style={{overflowX:"auto"}}><table style={S.table}><thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead><tbody>{!(data??[]).length?<tr><td colSpan={cols.length} style={S.empty}>No records.</td></tr>:(data as Record<string,unknown>[]).map((r,i) => <tr key={String(r.id??i)} style={i%2===0?{}:{background:"#f8fafc"}}>{rowFn(r).map((v,j) => <td key={j} style={S.td}>{v}</td>)}</tr>)}</tbody></table></div>;
}
function SBadge({s}:{s:string}) { const m:Record<string,string>={created:"#3b82f6",picked_up:"#8b5cf6",in_transit:"#f59e0b",out_for_delivery:"#f97316",delivered:"#10b981",failed:"#ef4444",cancelled:"#94a3b8",pending:"#f59e0b",transferred:"#10b981"}; return <span style={{background:m[s]??"#94a3b8",color:"#fff",borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:700}}>{s}</span>; }
function fmt(v:unknown) { return `${Number(v??0).toLocaleString()} MMK`; }
function fmtDate(v?:string) { return v?new Date(v).toLocaleDateString("en-GB"):"—"; }
function Spin() { return <div style={{color:"#94a3b8",padding:16}}>Loading…</div>; }
function Err({msg}:{msg?:string}) { return <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#991b1b",marginBottom:12}}>⚠️ {msg}</div>; }
function Succ({msg}:{msg:string}) { return <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#166534",marginBottom:12}}>{msg}</div>; }

const S:Record<string,React.CSSProperties>={page:{minHeight:"100vh",background:"#f0f4f8",fontFamily:"'Segoe UI',sans-serif"},header:{background:"linear-gradient(90deg,#4c1d95,#7c3aed)",color:"#fff",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"},headerTitle:{fontWeight:800,fontSize:17},userBadge:{fontSize:13,opacity:0.85},logoutBtn:{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12},tabBar:{background:"#fff",borderBottom:"2px solid #e2e8f0",display:"flex",gap:2,padding:"0 24px",overflowX:"auto"},tab:{background:"transparent",border:"none",padding:"12px 16px",cursor:"pointer",fontSize:13,color:"#64748b",fontWeight:500,whiteSpace:"nowrap"},tabActive:{background:"transparent",border:"none",borderBottom:"3px solid #7c3aed",padding:"12px 16px",cursor:"pointer",fontSize:13,color:"#4c1d95",fontWeight:700,whiteSpace:"nowrap"},main:{padding:"24px",maxWidth:1200,margin:"0 auto"},h2:{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:16},formCard:{background:"#fff",borderRadius:14,padding:28,maxWidth:700,boxShadow:"0 2px 8px rgba(0,0,0,.08)"},form:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14},label:{fontSize:13,fontWeight:600,color:"#374151",display:"flex",flexDirection:"column",gap:5},input:{border:"1.5px solid #d1d5db",borderRadius:7,padding:"8px 12px",fontSize:13,outline:"none",fontFamily:"inherit"},btn:{background:"linear-gradient(90deg,#4c1d95,#7c3aed)",color:"#fff",border:"none",borderRadius:9,padding:"11px 22px",fontSize:13,fontWeight:700,cursor:"pointer"},table:{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:10,overflow:"hidden",fontSize:13},th:{background:"#3b0764",color:"#fff",padding:"10px 14px",textAlign:"left",fontWeight:700,fontSize:12},td:{padding:"9px 14px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle"},empty:{padding:20,textAlign:"center",color:"#94a3b8"},trackCard:{background:"#fff",borderRadius:14,padding:24,maxWidth:700,boxShadow:"0 2px 8px rgba(0,0,0,.08)"}};
