// @ts-nocheck
import { useState, useEffect } from 'react'
import { RefreshCw, Zap, CheckCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const sectionTitleStyle = { fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 16px' }
const thStyle = { fontFamily: FF.body, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, background: C.panel2, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const tdStyle = { fontFamily: FF.body, fontSize: 13.5, color: C.text2, padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const kpiValueStyle = { fontFamily: FF.body, fontSize: 24, fontWeight: 700, color: C.gold, margin: '6px 0 0' }

export default function OpsManagerPage() {
  const [routes, setRoutes] = useState<any[]>([])
  const [stops, setStops] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      supabase.from('wayplan_routes').select('*').order('created_at', { ascending: false }),
      supabase.from('wayplan_stops').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: r }, { data: s }]) => {
      setRoutes(r ?? [])
      setStops(s ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const totalCod = (stops ?? []).reduce((acc, s) => acc + (parseFloat(s.cod_amount) || 0), 0)

  const kpis = [
    { label: 'Routes', value: (routes ?? []).length },
    { label: 'Stops', value: (stops ?? []).length },
    { label: 'Total COD', value: `${totalCod.toLocaleString()} MMK` },
    { label: 'Selected Stops', value: 0 },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Operations Manager</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Generate wayplans, review route loads, preview stop sequences and monitor COD exposure.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ border:`1px solid ${C.orange}`, background:C.orange, color:C.bg, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <Zap size={14} />
            Generate Wayplans
          </button>
          <button onClick={load} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
        <CheckCircle size={16} color={C.success} />
        <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Live backend synchronized.</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        {(kpis ?? []).map((item) => (
          <div key={item.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{item.label}</div>
            <div style={kpiValueStyle}>{loading ? '—' : item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' }}>
          <h2 style={sectionTitleStyle}>Wayplans</h2>
          <span style={{ fontFamily:FF.body, fontSize:13, color:C.muted }}>{(routes ?? []).length} row(s)</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Wayplan No', 'Route Code', 'Route Date', 'Total Stops', 'Total COD', 'Assigned To', 'Status'].map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading…</td>
                </tr>
              )}
              {!loading && (routes ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No rows found.</td>
                </tr>
              )}
              {!loading && (routes ?? []).map((row, i) => (
                <tr key={row.id ?? i}>
                  <td style={{ ...tdStyle, color:C.gold }}>{row.wayplan_no ?? '—'}</td>
                  <td style={tdStyle}>{row.route_code ?? '—'}</td>
                  <td style={tdStyle}>{row.route_date ? new Date(row.route_date).toLocaleDateString() : '—'}</td>
                  <td style={tdStyle}>{row.total_stops ?? '—'}</td>
                  <td style={{ ...tdStyle, color:C.orange }}>{row.total_cod != null ? Number(row.total_cod).toLocaleString() : '—'}</td>
                  <td style={tdStyle}>{row.assigned_to ?? '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, border:`1px solid ${String(row.status).toLowerCase() === 'active' ? C.success : C.info}`, color:String(row.status).toLowerCase() === 'active' ? C.success : C.info, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>
                      {row.status ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' }}>
          <h2 style={sectionTitleStyle}>Route Stops Preview</h2>
          <span style={{ fontFamily:FF.body, fontSize:13, color:C.muted }}>{(stops ?? []).length} row(s)</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Sequence No', 'Way ID', 'Created At'].map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading…</td>
                </tr>
              )}
              {!loading && (stops ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No rows found.</td>
                </tr>
              )}
              {!loading && (stops ?? []).map((row, i) => (
                <tr key={row.id ?? i}>
                  <td style={tdStyle}>{row.sequence_no ?? i + 1}</td>
                  <td style={{ ...tdStyle, color:C.info }}>{row.way_id ?? '—'}</td>
                  <td style={tdStyle}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
