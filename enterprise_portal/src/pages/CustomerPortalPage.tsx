// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Search, MapPin, Headphones, AlertTriangle, Package } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const statusBadge = (status: string) => {
  const s = (status ?? '').toUpperCase()
  let color = C.info
  let bg = 'rgba(56,189,248,0.12)'
  let border = 'rgba(56,189,248,0.24)'
  if (s === 'DELIVERED') { color = C.success; bg = 'rgba(34,197,94,0.12)'; border = 'rgba(34,197,94,0.24)' }
  if (s === 'FAILED' || s === 'RETURNED') { color = C.error; bg = 'rgba(255,79,134,0.12)'; border = 'rgba(255,79,134,0.24)' }
  if (s === 'PENDING' || s === 'WAYPLANNED') { color = C.warning; bg = 'rgba(245,158,11,0.12)'; border = 'rgba(245,158,11,0.24)' }
  return <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:bg, color, border:`1px solid ${border}`, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>{status ?? '—'}</span>
}

const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

export default function CustomerPortalPage() {
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [trackInput, setTrackInput] = useState('')
  const [tracked, setTracked] = useState<any | null>(null)

  const load = () => {
    setLoading(true)
    supabase
      .from('customer_deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data: d }) => { setDeliveries(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const handleTrack = () => {
    const found = deliveries.find(
      d =>
        (d.tracking_id ?? '').toLowerCase() === trackInput.trim().toLowerCase()
    )
    setTracked(found ?? null)
  }

  const active = deliveries.find(
    d => !['DELIVERED', 'FAILED', 'RETURNED'].includes((d.status ?? '').toUpperCase())
  )

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Customer Portal</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Track deliveries, review address details, and access support actions.</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:'1 1 260px' }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
            <input
              value={trackInput}
              onChange={e => setTrackInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              placeholder="Enter tracking ID..."
              style={{ width:'100%', background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'10px 12px 10px 32px', fontFamily:FF.body, fontSize:14 }}
            />
          </div>
          <button onClick={handleTrack} style={{ padding:'10px 18px', borderRadius:10, background:C.gold, border:`1px solid ${C.gold}`, color:C.bg, fontFamily:FF.body, fontSize:14, fontWeight:700, cursor:'pointer' }}>Track</button>
          {tracked !== undefined && trackInput && <span style={{ fontFamily:FF.body, fontSize:14, color:tracked ? C.success : C.error }}>{tracked ? `Status: ${tracked.status}` : 'Tracking ID not found.'}</span>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:14, marginBottom:20 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 12px' }}>Active Delivery</h2>
          {active ? (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <Package size={16} color={C.info} />
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.text }}>{active.tracking_id ?? '—'}</span>
              </div>
              <div style={{ marginBottom:10 }}>{statusBadge(active.status ?? '')}</div>
              <p style={{ fontFamily:FF.body, fontSize:14, color:C.text2, margin:0 }}>{active.recipient_address ?? active.address ?? '—'}</p>
            </>
          ) : (
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>No active deliveries</p>
          )}
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 12px' }}>Delivery Address</h2>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:14 }}>
            <MapPin size={15} color={C.gold} style={{ marginTop:2 }} />
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.text2, margin:0 }}>{active?.recipient_address ?? active?.address ?? deliveries[0]?.recipient_address ?? deliveries[0]?.address ?? 'No address on record.'}</p>
          </div>
          <button style={{ padding:'8px 12px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.gold, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }}>Update Address</button>
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 12px' }}>Customer Support</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 12px', borderRadius:10, background:`${C.info}22`, border:`1px solid ${C.info}44`, color:C.info, fontFamily:FF.body, fontSize:14, fontWeight:600, cursor:'pointer' }}><Headphones size={14} /> Open Support Ticket</button>
            <button style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 12px', borderRadius:10, background:`${C.error}22`, border:`1px solid ${C.error}44`, color:C.error, fontFamily:FF.body, fontSize:14, fontWeight:600, cursor:'pointer' }}><AlertTriangle size={14} /> Report an Issue</button>
          </div>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <div style={{ marginBottom:16 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Order History</h2>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>Recent customer delivery history from the live customer_deliveries table.</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead>
              <tr>
                {['Date', 'Tracking ID', 'Merchant', 'Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
              ) : deliveries.length === 0 ? (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No order history found.</td></tr>
              ) : (
                (deliveries ?? []).map((r, i) => (
                  <tr key={r.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                    <td style={tdStyle}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ ...tdStyle, color:C.text }}>{r.tracking_id ?? '—'}</td>
                    <td style={tdStyle}>{r.merchant_name ?? r.merchant ?? '—'}</td>
                    <td style={tdStyle}>{statusBadge(r.status ?? '')}</td>
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
