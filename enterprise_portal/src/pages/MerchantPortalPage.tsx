// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Package, Clock, CheckCircle, Banknote, Download, Plus, Upload, Printer, Zap, Search } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const statusBadge = (status: string) => {
  const s = (status ?? '').toUpperCase()
  let color = C.info
  let bg = 'rgba(56,189,248,0.12)'
  let border = 'rgba(56,189,248,0.24)'
  if (s === 'DELIVERED') { color = C.success; bg = 'rgba(34,197,94,0.12)'; border = 'rgba(34,197,94,0.24)' }
  if (s === 'FAILED') { color = C.error; bg = 'rgba(255,79,134,0.12)'; border = 'rgba(255,79,134,0.24)' }
  if (s === 'WAYPLANNED') { color = C.warning; bg = 'rgba(245,158,11,0.12)'; border = 'rgba(245,158,11,0.24)' }
  return <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:bg, color, border:`1px solid ${border}`, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>{status ?? '—'}</span>
}

const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

export default function MerchantPortalPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    supabase
      .from('merchant_shipments')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const filtered = data.filter(r =>
    (r.tracking_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.recipient_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const active = data.filter(r => !['DELIVERED', 'FAILED'].includes((r.status ?? '').toUpperCase())).length
  const pending = data.filter(r => (r.status ?? '').toUpperCase() === 'PENDING').length
  const delivered = data.filter(r => (r.status ?? '').toUpperCase() === 'DELIVERED').length
  const codPending = data
    .filter(r => r.cod_collected === false || r.cod_collected === null)
    .reduce((s, r) => s + (r.cod_amount ?? 0), 0)

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Merchant Portal</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Shipment visibility, order actions, and merchant operational tracking.</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}><Download size={14} /> Download Waybills</button>
        <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:C.gold, border:`1px solid ${C.gold}`, borderRadius:8, color:C.bg, fontSize:13, fontFamily:FF.body, fontWeight:700, cursor:'pointer' }}><Plus size={14} /> Create Order</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:20 }}>
        {[
          { label:'Active Shipments', value:active, color:C.info, icon:<Package size={16} color={C.info} /> },
          { label:'Pending Pickups', value:pending, color:C.warning, icon:<Clock size={16} color={C.warning} /> },
          { label:'Delivered', value:delivered, color:C.success, icon:<CheckCircle size={16} color={C.success} /> },
          { label:'COD Pending MMK', value:codPending.toLocaleString(), color:C.gold, icon:<Banknote size={16} color={C.gold} /> },
        ].map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</span>
              {k.icon}
            </div>
            <div style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color:k.color }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 12px' }}>Quick Actions</h2>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
          <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}><Upload size={14} /> Bulk CSV Upload</button>
          <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}><Printer size={14} /> Print Manifest</button>
          <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:`${C.info}22`, border:`1px solid ${C.info}44`, borderRadius:8, color:C.info, fontSize:13, fontFamily:FF.body, fontWeight:700, cursor:'pointer' }}><Zap size={14} /> Request Urgent Pickup</button>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Recent Shipments</h2>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>Live merchant shipment history with shipment status and COD totals.</p>
          </div>
          <div style={{ position:'relative' }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracking ID or recipient..." style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'10px 12px 10px 32px', fontSize:14, fontFamily:FF.body, minWidth:260 }} />
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead>
              <tr>
                {['Tracking ID', 'Date', 'Recipient', 'Zone', 'COD (MMK)', 'Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No rows found.</td></tr>
              ) : (
                (filtered ?? []).map((r, i) => (
                  <tr key={r.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                    <td style={{ ...tdStyle, color:C.text }}>{r.tracking_id ?? '—'}</td>
                    <td style={tdStyle}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                    <td style={tdStyle}>{r.recipient_name ?? '—'}</td>
                    <td style={tdStyle}>{r.zone ?? '—'}</td>
                    <td style={tdStyle}>{r.cod_amount != null ? Number(r.cod_amount).toLocaleString() : '—'}</td>
                    <td style={tdStyle}>{statusBadge(r.status ?? 'PENDING')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
