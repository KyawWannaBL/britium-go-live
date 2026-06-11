// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Download, Shield } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }
const EVENT_TYPES = ['All', 'LOGIN', 'UPDATE', 'DELETE', 'CREATE']

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, enabled:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, inactive:{bg:C.panel2,c:C.muted,b:C.border}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, info:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'} }
  const v = m[s?.toLowerCase()] ?? { bg:C.panel2, c:C.muted, b:C.border }
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

export default function AuditLogsPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [eventType, setEventType] = useState('All')
  const [userFilter, setUserFilter] = useState('')

  const load = () => {
    setLoading(true)
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const safeData = data ?? []
  const today = new Date().toISOString().slice(0, 10)

  const filtered = safeData.filter(e => {
    if (eventType !== 'All' && (e.action ?? '').toUpperCase() !== eventType) return false
    if (userFilter && !(e.user ?? '').toLowerCase().includes(userFilter.toLowerCase())) return false
    if (dateFrom && (e.created_at ?? '') < dateFrom) return false
    if (dateTo && (e.created_at ?? '') > dateTo + 'T23:59:59') return false
    return true
  })

  const eventsToday = safeData.filter(e => (e.created_at ?? '').slice(0, 10) === today).length
  const criticalEvents = safeData.filter(e => (e.action ?? '').toUpperCase() === 'DELETE').length

  const kpis = [
    { label: 'Total Events', value: safeData.length },
    { label: 'Events Today', value: eventsToday },
    { label: 'Critical Events', value: criticalEvents },
  ]

  const inputStyle: React.CSSProperties = {
    background: C.panel2,
    border: `1px solid ${C.border}`,
    color: C.text2,
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 13.5,
    fontFamily: FF.body,
    width: '100%',
  }

  const actionColor = (action: string) => {
    const m: Record<string, string> = { DELETE: C.error, CREATE: C.success, UPDATE: C.gold, LOGIN: C.info }
    return m[(action ?? '').toUpperCase()] ?? C.text2
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>AUDIT LOGS</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>System activity audit trail, compliance review, and event filtering.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={{ height:40, padding:'0 16px', borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
            <Download size={14} /> Export Logs
          </button>
          <button onClick={load} style={{ height:40, padding:'0 16px', borderRadius:12, border:`1px solid ${C.border}`, background:C.panel, color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
            <RefreshCw size={14} /> Refresh
          </button>
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

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:18, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>From Date</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>To Date</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Event Type</div>
            <select value={eventType} onChange={e => setEventType(e.target.value)} style={inputStyle}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>User Filter</div>
            <input value={userFilter} onChange={e => setUserFilter(e.target.value)} placeholder="Filter by user..." style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, overflow:'hidden' }}>
        <div style={{ padding:20, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Audit Event Register</h2>
            <p style={{ margin:0, fontSize:14, color:C.muted }}>{filtered.length} event(s) after filters.</p>
          </div>
          <span style={badge(criticalEvents > 0 ? 'pending' : 'active')}>{criticalEvents > 0 ? `${criticalEvents} Critical` : 'No Critical Events'}</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Timestamp', 'User', 'Action', 'Resource', 'Details', 'IP Address'].map(h => (
                  <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, borderBottom:`1px solid ${C.border}`, background:C.panel2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>Loading...</td></tr>
              ) : (filtered ?? []).length === 0 ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:'center', color:C.muted }}>No audit events recorded yet.</td></tr>
              ) : (
                (filtered ?? []).map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text }}>{e.user ?? e.user_email ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}><span style={{ ...badge((e.action ?? '').toLowerCase()), color:actionColor(e.action) }}>{(e.action ?? '—').toUpperCase()}</span></td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{e.resource ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2, maxWidth:260 }}>{e.details ?? '—'}</td>
                    <td style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, fontSize:13.5, color:C.text2 }}>{e.ip_address ?? '—'}</td>
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
