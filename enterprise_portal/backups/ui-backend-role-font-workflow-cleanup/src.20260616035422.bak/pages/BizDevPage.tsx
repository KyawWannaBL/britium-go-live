// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Plus, TrendingUp } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }
const STAGES = ['All', 'Prospect', 'Negotiation', 'Closed Won', 'Closed Lost']

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, enabled:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, inactive:{bg:C.panel2,c:C.muted,b:C.border}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, info:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, prospect:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, negotiation:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, 'closed won':{bg:'#052e16',c:'#22c55e',b:'#166534'}, 'closed lost':{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? { bg:C.panel2, c:C.muted, b:C.border }
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

export default function BizDevPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState('All')

  const load = () => {
    setLoading(true)
    supabase.from('biz_dev_prospects').select('*').order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const safeData = data ?? []
  const filtered = stage === 'All' ? safeData : safeData.filter(p => (p.stage ?? '').toLowerCase() === stage.toLowerCase())
  const activeProspects = safeData.filter(p => !['closed won', 'closed lost'].includes((p.stage ?? '').toLowerCase())).length
  const dealsClosed = safeData.filter(p => (p.stage ?? '').toLowerCase() === 'closed won').length
  const pipelineValue = safeData.reduce((s, p) => s + (Number(p.value) || 0), 0)

  const kpis = [
    { label: 'Active Prospects', value: activeProspects },
    { label: 'Deals Closed', value: dealsClosed },
    { label: 'Pipeline Value (MMK)', value: pipelineValue.toLocaleString() },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>BUSINESS DEVELOPMENT</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Partner acquisition pipeline, stage tracking, and deal value visibility.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={{ height:40, padding:'0 16px', borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}><RefreshCw size={14} /> Refresh</button>
          <button style={{ height:40, padding:'0 16px', borderRadius:12, border:'none', background:C.gold, color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}><Plus size={14} /> Add Prospect</button>
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

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {STAGES.map(s => (
          <button key={s} onClick={() => setStage(s)} style={{ height:38, padding:'0 14px', borderRadius:999, border:stage === s ? 'none' : `1px solid ${C.border}`, background:stage === s ? C.gold : C.panel2, color:stage === s ? '#1c1917' : C.text2, fontFamily:FF.body, fontSize:12.5, fontWeight:700, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.04em' }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
        <div style={{ padding:20, borderBottom:`1px solid ${C.border}` }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Prospect Register</h2>
          <p style={{ margin:0, fontSize:14, color:C.muted }}>{(filtered ?? []).length} prospect(s) in the selected stage view.</p>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Company', 'Contact', 'Stage', 'Value (MMK)', 'Last Contact', 'Status'].map(h => (
                  <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, borderBottom:`1px solid ${C.border}`, background:C.panel2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>Loading...</td></tr>
              ) : (filtered ?? []).length === 0 ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>No prospects found.</td></tr>
              ) : (
                (filtered ?? []).map((p, i) => (
                  <tr key={p.id ?? i}>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text }}>{p.company ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{p.contact ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}><span style={badge(p.stage)}>{p.stage ?? '—'}</span></td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.gold }}>{p.value ? Number(p.value).toLocaleString() : '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{p.last_contact ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}><span style={badge(p.status)}>{p.status ?? '—'}</span></td>
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
