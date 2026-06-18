// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Activity, BarChart3 } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const sectionTitleStyle = { fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 16px' }
const thStyle = { fontFamily: FF.body, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, background: C.panel2, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const tdStyle = { fontFamily: FF.body, fontSize: 13.5, color: C.text2, padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const kpiValueStyle = { fontFamily: FF.body, fontSize: 24, fontWeight: 700, color: C.gold, margin: '6px 0 0' }

export default function ExecutiveOpsPage() {
  const [pickups, setPickups] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [cod, setCod] = useState<any[]>([])
  const [settlements, setSettlements] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      supabase.from('pickup_requests').select('*'),
      supabase.from('delivery_workflows').select('*'),
      supabase.from('cod_deliveries').select('*'),
      supabase.from('settlement_batches').select('*'),
      supabase.from('delivery_trends').select('*').order('date', { ascending: false }).limit(7),
    ]).then(([p, d, c, s, t]) => {
      setPickups(p.data ?? [])
      setDeliveries(d.data ?? [])
      setCod(c.data ?? [])
      setSettlements(s.data ?? [])
      setTrends(t.data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const safeP = pickups ?? []
  const safeD = deliveries ?? []
  const safeC = cod ?? []
  const safeS = settlements ?? []

  const codExpected = safeC.reduce((s, c) => s + (Number(c.cod_expected) || 0), 0)
  const codCollected = safeC.reduce((s, c) => s + (Number(c.cod_collected) || 0), 0)
  const postedS = safeS.filter(s => s.status?.toLowerCase() === 'posted')
  const shortage = safeS.reduce((s, b) => s + (Number(b.shortage) || 0), 0)
  const overage = safeS.reduce((s, b) => s + (Number(b.overage) || 0), 0)

  type KpiDef = { label: string; value: string | number }

  const kpis: KpiDef[] = [
    { label: 'Total Pickups', value: safeP.length },
    { label: 'Submitted Pickups', value: safeP.filter(p => p.status?.toLowerCase() === 'submitted').length },
    { label: 'Total Deliveries', value: safeD.length },
    { label: 'Delivered', value: safeD.filter(d => d.status?.toLowerCase() === 'delivered').length },
    { label: 'COD Expected', value: `${codExpected.toLocaleString()} MMK` },
    { label: 'COD Collected', value: `${codCollected.toLocaleString()} MMK` },
    { label: 'Posted Settlements', value: postedS.length },
    { label: 'Settlement Variance', value: `${(shortage + overage).toLocaleString()} MMK` },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Executive Operations</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Leadership view across pickups, delivery execution, COD collections, settlements, and daily trend movement.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
        <Activity size={16} color={C.success} />
        <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Executive Operations Dashboard loaded.</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:20 }}>
        {(kpis ?? []).map((item) => (
          <div key={item.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{item.label}</div>
            <div style={kpiValueStyle}>{loading ? '—' : item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <BarChart3 size={18} color={C.info} />
          <h2 style={sectionTitleStyle}>Last 7 Days Trend</h2>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Pickups', 'Deliveries', 'Delivered', 'COD'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td>
                </tr>
              ) : (trends ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No trend data available.</td>
                </tr>
              ) : (
                (trends ?? []).map((t, i) => (
                  <tr key={t.id ?? i}>
                    <td style={{ ...tdStyle, color:C.gold }}>{t.date ?? '—'}</td>
                    <td style={tdStyle}>{t.pickups?.toLocaleString() ?? '—'}</td>
                    <td style={tdStyle}>{t.deliveries?.toLocaleString() ?? '—'}</td>
                    <td style={{ ...tdStyle, color:C.info }}>{t.delivered?.toLocaleString() ?? '—'}</td>
                    <td style={{ ...tdStyle, color:C.success }}>{t.cod ? `${Number(t.cod).toLocaleString()} MMK` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:20 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={sectionTitleStyle}>Pickup Pipeline</h2>
          <div style={{ display:'grid', gap:10 }}>
            {[
              ['Draft', safeP.filter(p => p.status?.toLowerCase() === 'draft').length],
              ['Saved', safeP.filter(p => p.status?.toLowerCase() === 'saved').length],
              ['Submitted', safeP.filter(p => p.status?.toLowerCase() === 'submitted').length],
            ].map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:10, background:C.panel2 }}>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{label}</span>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.gold, fontWeight:700 }}>{loading ? '—' : value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={sectionTitleStyle}>Delivery Status</h2>
          <div style={{ display:'grid', gap:10 }}>
            {[
              ['Out for Delivery', safeD.filter(d => d.status?.toLowerCase() === 'out_for_delivery').length],
              ['Failed Attempts', safeD.filter(d => d.status?.toLowerCase() === 'failed').length],
              ['Returned', safeD.filter(d => d.status?.toLowerCase() === 'returned').length],
            ].map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:10, background:C.panel2 }}>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{label}</span>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.gold, fontWeight:700 }}>{loading ? '—' : value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={sectionTitleStyle}>Settlement Control</h2>
          <div style={{ display:'grid', gap:10 }}>
            {[
              ['Shortage', `${shortage.toLocaleString()} MMK`],
              ['Overage', `${overage.toLocaleString()} MMK`],
              ['Batches', safeS.length],
            ].map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:10, background:C.panel2 }}>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{label}</span>
                <span style={{ fontFamily:FF.body, fontSize:14, color:C.gold, fontWeight:700 }}>{loading ? '—' : value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
