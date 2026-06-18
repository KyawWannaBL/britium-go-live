// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Plus, Megaphone } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, enabled:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, inactive:{bg:C.panel2,c:C.muted,b:C.border}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, info:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'} }
  const v = m[s?.toLowerCase()] ?? { bg:C.panel2, c:C.muted, b:C.border }
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

export default function MarketingPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const active = (data ?? []).filter(c => c.status?.toLowerCase() === 'active').length
  const totalReach = (data ?? []).reduce((s, c) => s + (Number(c.reach) || 0), 0)
  const convRate = (data ?? []).length > 0
    ? ((data ?? []).reduce((s, c) => s + (Number(c.conversion_rate) || 0), 0) / (data ?? []).length).toFixed(1) + '%'
    : '0%'

  const kpis = [
    { label: 'Active Campaigns', value: active },
    { label: 'Total Reach', value: totalReach.toLocaleString() },
    { label: 'Conversion Rate', value: convRate },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>MARKETING</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Campaign portfolio, reach performance, and promotion lifecycle visibility.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={{ height:40, padding:'0 16px', borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}><RefreshCw size={14} /> Refresh</button>
          <button style={{ height:40, padding:'0 16px', borderRadius:12, border:'none', background:C.gold, color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}><Plus size={14} /> New Campaign</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginBottom:20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
        <div style={{ padding:20, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Campaign Register</h2>
            <p style={{ margin:0, fontSize:14, color:C.muted }}>{(data ?? []).length} campaign(s) from Supabase.</p>
          </div>
          <span style={badge(active > 0 ? 'active' : 'inactive')}>{active > 0 ? `${active} Active` : 'No Active Campaigns'}</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Campaign Name', 'Type', 'Status', 'Start Date', 'End Date', 'Reach'].map(h => (
                  <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, borderBottom:`1px solid ${C.border}`, background:C.panel2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>Loading...</td></tr>
              ) : (data ?? []).length === 0 ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>No marketing campaigns found.</td></tr>
              ) : (
                (data ?? []).map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text }}>{c.name ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{c.type ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}><span style={badge(c.status)}>{c.status ?? '—'}</span></td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{c.start_date ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{c.end_date ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.gold }}>{c.reach?.toLocaleString() ?? '—'}</td>
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
