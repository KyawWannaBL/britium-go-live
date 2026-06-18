// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

type Range = '7d' | '30d' | '90d'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, enabled:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, inactive:{bg:C.panel2,c:C.muted,b:C.border}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, info:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'} }
  const v = m[s?.toLowerCase()] ?? { bg:C.panel2, c:C.muted, b:C.border }
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d')
  const [loading, setLoading] = useState(true)
  const [deliveryTrend, setDeliveryTrend] = useState<any[]>([])
  const [revenueTrend, setRevenueTrend] = useState<any[]>([])
  const [kpis, setKpis] = useState({ delivered: 0, successRate: 0, onTimeRate: 0, avgTime: 0 })

  const rangeMap: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }

  const load = async (r: Range) => {
    setLoading(true)
    const since = daysAgoISO(rangeMap[r])

    const [{ data: dt }, { data: rt }] = await Promise.all([
      supabase.from('delivery_trends').select('*').gte('date', since).order('date', { ascending: true }),
      supabase.from('revenue_trends').select('*').gte('date', since).order('date', { ascending: true }),
    ])

    const trends = dt ?? []
    const revs = rt ?? []

    setDeliveryTrend(trends)
    setRevenueTrend(revs)

    const totalDelivered = trends.reduce((s: number, x: any) => s + (Number(x.delivered) || 0), 0)
    const totalAttempted = trends.reduce((s: number, x: any) => s + (Number(x.attempted) || Number(x.delivered) || 0), 0)
    const totalOnTime = trends.reduce((s: number, x: any) => s + (Number(x.on_time) || 0), 0)
    const totalHours = trends.reduce((s: number, x: any) => s + (Number(x.avg_hours) || 0), 0)

    setKpis({
      delivered: totalDelivered,
      successRate: totalAttempted > 0 ? Math.round((totalDelivered / totalAttempted) * 100) : 0,
      onTimeRate: totalDelivered > 0 ? Math.round((totalOnTime / totalDelivered) * 100) : 0,
      avgTime: trends.length > 0 ? Math.round((totalHours / trends.length) * 10) / 10 : 0,
    })
    setLoading(false)
  }

  useEffect(() => { load(range) }, [range])

  const KPIS = [
    { label: 'Total Delivered', value: kpis.delivered.toLocaleString() },
    { label: 'Success Rate', value: `${kpis.successRate}%` },
    { label: 'On-Time Rate', value: `${kpis.onTimeRate}%` },
    { label: 'Avg Delivery Time', value: `${kpis.avgTime} hrs` },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>ANALYTICS</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Performance insights, delivery outcomes, and revenue movement from live Supabase trend tables.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {(['7d', '30d', '90d'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{ height:40, padding:'0 16px', borderRadius:12, border:range === r ? 'none' : `1px solid ${C.border}`, background:range === r ? C.gold : 'transparent', color:range === r ? '#1c1917' : C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </button>
          ))}
          <button onClick={() => load(range)} style={{ height:40, padding:'0 16px', borderRadius:12, border:`1px solid ${C.border}`, background:C.panel, color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>Refresh</button>
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <span style={badge('active')}>Live Backend Synchronized</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginBottom:20 }}>
        {KPIS.map(({ label, value }) => (
          <div key={label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
          <div style={{ padding:20, borderBottom:`1px solid ${C.border}` }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Delivery Trend</h2>
            <p style={{ margin:0, fontSize:14, color:C.muted }}>{deliveryTrend.length} row(s)</p>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Delivered'].map(h => (
                    <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, borderBottom:`1px solid ${C.border}`, background:C.panel2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={2} style={{ padding:36, textAlign:'center', color:C.muted }}>Loading…</td></tr>
                ) : deliveryTrend.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding:36, textAlign:'center', color:C.muted }}>No rows found.</td></tr>
                ) : (
                  (deliveryTrend ?? []).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{row.date ?? '—'}</td>
                      <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text }}>{row.delivered ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
          <div style={{ padding:20, borderBottom:`1px solid ${C.border}` }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Revenue Trend</h2>
            <p style={{ margin:0, fontSize:14, color:C.muted }}>{revenueTrend.length} row(s)</p>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Revenue'].map(h => (
                    <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, borderBottom:`1px solid ${C.border}`, background:C.panel2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={2} style={{ padding:36, textAlign:'center', color:C.muted }}>Loading…</td></tr>
                ) : revenueTrend.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding:36, textAlign:'center', color:C.muted }}>No rows found.</td></tr>
                ) : (
                  (revenueTrend ?? []).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{row.date ?? '—'}</td>
                      <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.gold }}>{row.revenue != null ? Number(row.revenue).toLocaleString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
