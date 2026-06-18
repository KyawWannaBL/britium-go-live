// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Plus } from 'lucide-react'

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

const cell = (v: any) => <td style={tdStyle}>{v ?? '—'}</td>

export default function DriverPage() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [helpers, setHelpers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'drivers' | 'helpers'>('drivers')

  const load = () => {
    setLoading(true)
    Promise.all([
      supabase.from('driver_masters').select('*').order('created_at', { ascending: false }),
      supabase.from('helper_masters').select('*').order('created_at', { ascending: false }),
    ]).then(([dRes, hRes]) => {
      setDrivers(dRes.data ?? [])
      setHelpers(hRes.data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const activeDrivers = (drivers ?? []).filter(d => d.status?.toLowerCase() === 'active').length
  const onDutyToday = (drivers ?? []).filter(d => d.status?.toLowerCase() === 'on_duty').length

  const kpis = [
    { label: 'Total Drivers', value: (drivers ?? []).length },
    { label: 'Active Drivers', value: activeDrivers },
    { label: 'Total Helpers', value: (helpers ?? []).length },
    { label: 'On Duty Today', value: onDutyToday },
  ]

  const tabStyle = (t: string) => ({
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    background: tab === t ? C.orange : C.panel2,
    color: tab === t ? C.bg : C.text2,
    border: `1px solid ${tab === t ? C.orange : C.border}`,
    fontFamily: FF.body,
  })

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Driver / Helper Management</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Driver and helper profiles, assignments, operational status and commission visibility.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
          <button style={{ border:`1px solid ${C.orange}`, background:C.orange, color:C.bg, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <Plus size={14} />
            Add Driver
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
          {['Driver +75 MMK pickup', 'Driver +200 MMK delivery', 'Helper +75 MMK pickup', 'Helper +200 MMK delivery'].map((item) => (
            <div key={item} style={{ padding:'10px 12px', borderRadius:10, background:C.panel2, border:`1px solid ${C.border}`, fontFamily:FF.body, fontSize:14, color:C.text2 }}>
              {item}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button style={tabStyle('drivers')} onClick={() => setTab('drivers')}>Drivers</button>
        <button style={tabStyle('helpers')} onClick={() => setTab('helpers')}>Helpers</button>
      </div>

      {tab === 'drivers' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <h2 style={sectionTitleStyle}>Driver Directory</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Driver ID', 'Name', 'Phone', 'License', 'Vehicle', 'Zone', 'Status', 'Commission Rate'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
                ) : (drivers ?? []).length === 0 ? (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No drivers found.</td></tr>
                ) : (
                  (drivers ?? []).map((d, i) => (
                    <tr key={d.id ?? i}>
                      <td style={{ ...tdStyle, color:C.gold }}>{d.driver_id ?? d.id}</td>
                      {cell(d.name)}{cell(d.phone)}{cell(d.license)}{cell(d.vehicle)}{cell(d.zone)}
                      <td style={tdStyle}>{statusBadge(d.status)}</td>
                      <td style={{ ...tdStyle, color:C.info }}>{d.commission_rate ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'helpers' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <h2 style={sectionTitleStyle}>Helper Directory</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Helper ID', 'Name', 'Phone', 'Assigned Driver', 'Zone', 'Status'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
                ) : (helpers ?? []).length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No helpers found.</td></tr>
                ) : (
                  (helpers ?? []).map((h, i) => (
                    <tr key={h.id ?? i}>
                      <td style={{ ...tdStyle, color:C.gold }}>{h.helper_id ?? h.id}</td>
                      {cell(h.name)}{cell(h.phone)}{cell(h.assigned_driver)}{cell(h.zone)}
                      <td style={tdStyle}>{statusBadge(h.status)}</td>
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
