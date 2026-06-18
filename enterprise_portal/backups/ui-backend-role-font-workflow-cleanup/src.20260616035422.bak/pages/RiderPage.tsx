// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Plus, User } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const sectionTitleStyle = { fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 16px' }
const thStyle = { fontFamily: FF.body, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, background: C.panel2, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const tdStyle = { fontFamily: FF.body, fontSize: 13.5, color: C.text2, padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const kpiValueStyle = { fontFamily: FF.body, fontSize: 24, fontWeight: 700, color: C.gold, margin: '6px 0 0' }

const statusBadge = (status: string) => {
  const key = status?.toLowerCase()
  const tone = key === 'active' ? C.success : key === 'inactive' ? C.error : key === 'on_duty' ? C.info : C.muted
  return (
    <span style={{ border:`1px solid ${tone}`, color:tone, padding:'4px 10px', borderRadius:999, fontSize:12, fontWeight:600, fontFamily:FF.body }}>
      {status ?? '—'}
    </span>
  )
}

export default function RiderPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase.from('rider_masters').select('*').order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const total = (data ?? []).length
  const active = (data ?? []).filter(r => r.status?.toLowerCase() === 'active').length
  const onDuty = (data ?? []).filter(r => r.status?.toLowerCase() === 'on_duty').length
  const todayComm = (data ?? []).reduce((s, r) => s + (Number(r.commission_today) || 0), 0)

  const kpis = [
    { label: 'Total Riders', value: total },
    { label: 'Active Riders', value: active },
    { label: 'On Duty Today', value: onDuty },
    { label: 'Commission Today', value: `${todayComm.toLocaleString()} MMK` },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Rider Management</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Field rider profiles, service zones, commission visibility and daily duty readiness.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
          <button style={{ border:`1px solid ${C.orange}`, background:C.orange, color:C.bg, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <Plus size={14} />
            Add Rider
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:20 }}>
        {(kpis ?? []).map((k) => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</div>
            <div style={kpiValueStyle}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={sectionTitleStyle}>Commission Reference</h2>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[
            'Pickup +150 MMK',
            'Delivery +300 MMK',
          ].map((item) => (
            <div key={item} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:C.panel2, border:`1px solid ${C.border}` }}>
              <User size={14} color={C.gold} />
              <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={sectionTitleStyle}>Rider Directory</h2>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Rider ID', 'Name', 'Phone', 'Zone', 'Vehicle', 'Status', 'Commission Rate', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
              ) : (data ?? []).length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No riders found.</td></tr>
              ) : (
                (data ?? []).map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td style={{ ...tdStyle, color:C.gold }}>{r.rider_id ?? r.id}</td>
                    <td style={tdStyle}>{r.name ?? '—'}</td>
                    <td style={tdStyle}>{r.phone ?? '—'}</td>
                    <td style={tdStyle}>{r.zone ?? '—'}</td>
                    <td style={tdStyle}>{r.vehicle ?? '—'}</td>
                    <td style={tdStyle}>{statusBadge(r.status)}</td>
                    <td style={{ ...tdStyle, color:C.info }}>{r.commission_rate ?? '—'}</td>
                    <td style={tdStyle}>
                      <button style={{ fontFamily:FF.body, fontSize:12, fontWeight:600, color:C.text2, background:C.panel2, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                        Edit
                      </button>
                    </td>
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
