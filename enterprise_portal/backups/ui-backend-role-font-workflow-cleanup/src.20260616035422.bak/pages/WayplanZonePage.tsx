// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Download, Search } from 'lucide-react'

type Tab = 'routes' | 'map'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = {
    active:{bg:'#052e16',c:'#22c55e',b:'#166534'},
    completed:{bg:'#052e16',c:'#22c55e',b:'#166534'},
    paid:{bg:'#052e16',c:'#22c55e',b:'#166534'},
    dispatched:{bg:'#052e16',c:'#22c55e',b:'#166534'},
    pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'},
    locked:{bg:'#451a03',c:'#f59e0b',b:'#92400e'},
    processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'},
    draft:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'},
    failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'},
    unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}
  }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const btnBase: React.CSSProperties = {
  display:'inline-flex',
  alignItems:'center',
  gap:8,
  padding:'9px 14px',
  borderRadius:10,
  border:`1px solid ${C.border}`,
  background:C.panel2,
  color:C.text2,
  fontFamily:FF.body,
  fontSize:13,
  fontWeight:600,
  cursor:'pointer'
}

export default function WayplanZonePage() {
  const [tab, setTab]                   = useState<Tab>('routes')
  const [pickups, setPickups]           = useState<any[]>([])
  const [selectedPayload, setSelectedPayload] = useState('')
  const [routes, setRoutes]             = useState<any[]>([])
  const [stops, setStops]               = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [generating, setGenerating]     = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('pickup_requests').select('*').in('status', ['submitted', 'saved']).order('created_at', { ascending: false }),
      supabase.from('wayplan_routes').select('*').order('created_at', { ascending: false }),
      supabase.from('wayplan_stops').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: p }, { data: r }, { data: s }]) => {
      setPickups(p ?? [])
      setRoutes(r ?? [])
      setStops(s ?? [])
      setLoading(false)
    })
  }, [])

  const refreshRoutes = async () => {
    setLoading(true)
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('wayplan_routes').select('*').order('created_at', { ascending: false }),
      supabase.from('wayplan_stops').select('*').order('created_at', { ascending: false }),
    ])
    setRoutes(r ?? [])
    setStops(s ?? [])
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!selectedPayload) return
    setGenerating(true)
    try { await supabase.rpc('generate_wayplan', { p_pickup_id: selectedPayload }) } catch (_) {}
    await refreshRoutes()
    setGenerating(false)
  }

  const totalCOD = routes.reduce((s: number, r: any) => s + (Number(r.total_cod) || 0), 0)
  const totalKg = routes.reduce((s: number, r: any) => s + (Number(r.payload_kg) || 0), 0)
  const ROUTE_COLS = ['ROUTE CODE', 'ZONE', 'STOPS', 'COD', 'RIDER', 'STATUS']

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>WAYPLAN COMMAND CENTER</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Generate, review, override, bind assets, and dispatch backend-generated wayplans.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setTab(tab === 'routes' ? 'map' : 'routes')} style={btnBase}>
            <Search size={15} />
            {tab === 'routes' ? 'Map View' : 'Route List'}
          </button>
          <button onClick={refreshRoutes} style={btnBase}>
            <RefreshCw size={15} style={loading ? { animation:'spin 0.8s linear infinite' } : undefined} />
            Refresh
          </button>
          <button style={{ ...btnBase, background:C.gold, color:'#1d1405', border:`1px solid ${C.gold}` }}>
            <Download size={15} />
            Lock & Dispatch
          </button>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Active Operational Payload</h2>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(260px,1fr) auto', gap:12, alignItems:'end' }}>
          <div>
            <label style={{ display:'block', marginBottom:8, fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Pickup Payload</label>
            <select
              value={selectedPayload}
              onChange={e => setSelectedPayload(e.target.value)}
              style={{ width:'100%', minWidth:220, padding:'11px 12px', borderRadius:8, background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, fontFamily:FF.body, fontSize:14 }}
            >
              <option value="">— Select active pickup payload —</option>
              {(pickups ?? []).map(p => (
                <option key={p.id} value={p.pickup_id ?? p.id}>
                  {p.pickup_id ?? p.id} — {p.merchant_name ?? ''} ({p.parcel_count ?? 0} parcels)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!selectedPayload || generating}
            style={{
              ...btnBase,
              height:42,
              background: generating ? '#b98a37' : C.gold,
              color:'#1d1405',
              border:`1px solid ${C.gold}`,
              opacity: (!selectedPayload || generating) ? 0.65 : 1,
              cursor: (!selectedPayload || generating) ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={15} style={generating ? { animation:'spin 0.8s linear infinite' } : undefined} />
            {generating ? 'Generating…' : 'Generate Wayplan'}
          </button>
        </div>
      </div>

      <div style={{ background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:'12px 16px', marginBottom:20, color:C.text2, fontSize:14 }}>
        Wayplan command center synchronized with backend.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          { label:'Routes', value:loading ? '—' : routes.length.toString() },
          { label:'Stops', value:loading ? '—' : stops.length.toString() },
          { label:'Total COD', value:loading ? '—' : `${totalCOD.toLocaleString()} MMK` },
          { label:'Payload KG', value:loading ? '—' : `${totalKg.toFixed(1)} kg` },
        ].map(item => (
          <div key={item.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{item.label}</div>
            <div style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color:C.gold }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {(['routes', 'map'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...btnBase,
              background: tab === t ? C.panelHover : C.panel2,
              color: tab === t ? C.gold : C.text2,
              border: `1px solid ${tab === t ? C.gold : C.border}`
            }}
          >
            {t === 'routes' ? 'Route Lists' : 'Map Workspace'}
          </button>
        ))}
      </div>

      {tab === 'map' ? (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20, minHeight:220, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Map Workspace</h2>
          <p style={{ fontSize:14, color:C.muted, margin:0, textAlign:'center' }}>Map integration pending — configure Mapbox token to enable route visualization.</p>
        </div>
      ) : (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Route Lists</h2>
              <p style={{ fontSize:14, color:C.muted, margin:0 }}>{routes.length} route(s)</p>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead>
                <tr>
                  {ROUTE_COLS.map(col => (
                    <th key={col} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={ROUTE_COLS.length} style={{ padding:'28px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>Loading…</td>
                  </tr>
                ) : routes.length === 0 ? (
                  <tr>
                    <td colSpan={ROUTE_COLS.length} style={{ padding:'28px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>No active wayplan routes. Select a backend pickup payload and generate a wayplan.</td>
                  </tr>
                ) : (
                  (routes ?? []).map((row, i) => (
                    <tr key={row.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{row.route_code ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{row.zone ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{row.total_stops ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{row.total_cod != null ? Number(row.total_cod).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{row.assigned_to ?? row.rider ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}><span style={badge(row.status ?? 'draft')}>{row.status ?? 'draft'}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
