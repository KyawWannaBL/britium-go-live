// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Search, GitMerge } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    active: { bg:'rgba(34,197,94,0.12)', color:C.success, border:'rgba(34,197,94,0.24)' },
    pending: { bg:'rgba(245,158,11,0.12)', color:C.warning, border:'rgba(245,158,11,0.24)' },
    escalated: { bg:'rgba(255,79,134,0.12)', color:C.error, border:'rgba(255,79,134,0.24)' },
    resolved: { bg:'rgba(56,189,248,0.12)', color:C.info, border:'rgba(56,189,248,0.24)' },
  }
  const s = map[(status ?? '').toLowerCase()] ?? { bg:'rgba(255,255,255,0.06)', color:C.text2, border:'rgba(255,255,255,0.10)' }
  return <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:s.bg, color:s.color, border:`1px solid ${s.border}`, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>{status ?? '—'}</span>
}

const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

export default function BranchAdminPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [branchFilter, setBranchFilter] = useState('All')

  const load = () => {
    setLoading(true)
    supabase.from('branch_records').select('*').order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const safeData = data ?? []
  const branches = ['All', ...Array.from(new Set(safeData.map(r => r.branch).filter(Boolean)))] as string[]
  const filtered = branchFilter === 'All' ? safeData : safeData.filter(r => r.branch === branchFilter)

  const today = new Date().toISOString().slice(0, 10)
  const pendingEsc = safeData.filter(r => r.status?.toLowerCase() === 'escalated').length
  const overrides = safeData.filter(r => r.override && (r.updated_at ?? '').slice(0, 10) === today).length
  const lastSync = safeData.length > 0 ? (safeData[0].updated_at ?? safeData[0].created_at ?? '—') : '—'

  const kpis = [
    { label: 'Total Records', value: safeData.length },
    { label: 'Pending Escalation', value: pendingEsc },
    { label: 'Overrides Today', value: overrides },
    { label: 'Last Sync', value: lastSync !== '—' ? new Date(lastSync).toLocaleTimeString() : '—' },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Branch Administration</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Branch admin management, escalation controls, and record monitoring.</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={14} /> Sync
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</span>
              <GitMerge size={15} color={C.gold} />
            </div>
            <div style={{ fontFamily:FF.body, fontSize:k.label === 'Last Sync' ? 18 : 24, fontWeight:700, color:C.gold }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Branch Records</h2>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>Operational records, overrides, and escalation tracking by branch.</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'10px 12px 10px 32px', fontSize:14, fontFamily:FF.body, minWidth:180 }}>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead>
              <tr>
                {['Record ID','Branch','Type','Status','Operator','Timestamp','Action'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
              ) : (filtered ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No branch admin records found.</td></tr>
              ) : (filtered ?? []).map((r, i) => (
                <tr key={r.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                  <td style={{ ...tdStyle, color:C.gold }}>{r.record_id ?? r.id}</td>
                  <td style={{ ...tdStyle, color:C.text }}>{r.branch ?? '—'}</td>
                  <td style={{ ...tdStyle, color:C.info }}>{r.type ?? '—'}</td>
                  <td style={tdStyle}>{statusBadge(r.status)}</td>
                  <td style={tdStyle}>{r.operator ?? '—'}</td>
                  <td style={tdStyle}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  <td style={tdStyle}><button style={{ padding:'6px 10px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.gold, fontFamily:FF.body, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Override</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
