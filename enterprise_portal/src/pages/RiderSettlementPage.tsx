// @ts-nocheck
import React, { useState } from 'react'
import { Loader2, RefreshCw, WalletCards } from 'lucide-react'
import { riderSignatureFinanceApi } from '@/lib/riderSignatureFinanceApi'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string,any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, completed:{bg:'#052e16',c:'#22c55e',b:'#166534'}, paid:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }
const input: React.CSSProperties = { minHeight:44, border:`1px solid ${C.border}`, borderRadius:8, background:C.panel2, color:C.text2, padding:'0 12px', fontSize:14, fontFamily:FF.body, width:'100%' }

export default function RiderSettlementPage() {
  const [riderId, setRiderId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [snapshot, setSnapshot] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!riderId) return
    setLoading(true); setMessage('')
    try { setSnapshot(await riderSignatureFinanceApi.getRiderFinancialSnapshot(riderId, date)) }
    catch (e:any) { setMessage(e?.message || 'Financial snapshot မဖတ်နိုင်ပါ။') }
    finally { setLoading(false) }
  }

  async function createBatch() {
    setLoading(true); setMessage('')
    try { const r = await riderSignatureFinanceApi.createSettlementBatch(riderId, date, 'Created from finance settlement page'); setMessage(JSON.stringify(r, null, 2)); await load() }
    catch (e:any) { setMessage(e?.message || 'Settlement batch မဖန်တီးနိုင်ပါ။') }
    finally { setLoading(false) }
  }

  const summary = snapshot?.pending_summary || {}
  const rows = snapshot?.pending_collections || []

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
          <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><WalletCards color={C.gold} /></div>
          <div>
            <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>RIDER COD SETTLEMENT</h1>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>COD collection, variance, batch, and finance approval workflow.</p>
          </div>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Settlement Controls</h2>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(220px,1fr) 220px auto auto', gap:12, alignItems:'end' }}>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Rider UUID</label>
            <input value={riderId} onChange={(e)=>setRiderId(e.target.value)} placeholder="Rider UUID" style={input} />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Date</label>
            <input value={date} onChange={(e)=>setDate(e.target.value)} type="date" style={input} />
          </div>
          <button onClick={load} style={btnBase}>{loading ? <Loader2 size={16} style={{ animation:'spin 0.8s linear infinite' }} /> : <RefreshCw size={16} />} Refresh</button>
          <button onClick={createBatch} style={{ ...btnBase, background:C.gold, color:'#1d1405', border:`1px solid ${C.gold}` }}>Create Batch</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <Kpi label="Pending Shipments" value={summary.shipments || 0} />
        <Kpi label="Expected COD" value={summary.expected_cod || 0} />
        <Kpi label="Collected COD" value={summary.collected_cod || 0} />
        <Kpi label="Variance" value={summary.variance_amount || 0} tone={(summary.variance_amount || 0) === 0 ? C.success : C.error} />
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Pending Collections</h2>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead><tr>{['Delivery WayID','Expected','Collected','Variance','Status'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(rows ?? []).map((c:any, i:number) => (
                <tr key={c.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                  <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{c.delivery_way_id}</td>
                  <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{Number(c.expected_cod || 0).toLocaleString()}</td>
                  <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{Number(c.collected_cod || 0).toLocaleString()}</td>
                  <td style={{ padding:'11px 14px', fontSize:13.5, color:Number(c.variance_amount || 0) === 0 ? C.success : C.error, borderBottom:`1px solid ${C.border}22` }}>{Number(c.variance_amount || 0).toLocaleString()}</td>
                  <td style={{ padding:'11px 14px', fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}><span style={badge(c.settlement_status)}>{c.settlement_status}</span></td>
                </tr>
              ))}
              {(rows ?? []).length === 0 && <tr><td colSpan={5} style={{ padding:'28px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>No pending collections.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {message ? <pre style={{ background:C.panel, border:`1px solid ${message.startsWith('{') ? C.success : C.error}`, borderRadius:12, padding:20, whiteSpace:'pre-wrap', color:message.startsWith('{') ? C.success : C.error, fontFamily:FF.body, fontSize:14 }}>{message}</pre> : null}
    </div>
  )
}

function Kpi({ label, value, tone = C.gold }: any) {
  return (
    <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color:tone }}>{Number(value || 0).toLocaleString()}</div>
    </div>
  )
}
