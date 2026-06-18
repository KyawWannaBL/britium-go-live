// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Search, Plus, Users, ShieldCheck, FileBarChart2 } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    active:   { bg: 'rgba(34,197,94,0.12)', color: C.success, border: 'rgba(34,197,94,0.28)' },
    inactive: { bg: 'rgba(255,79,134,0.12)', color: C.error, border: 'rgba(255,79,134,0.24)' },
    blocked:  { bg: 'rgba(255,79,134,0.12)', color: C.error, border: 'rgba(255,79,134,0.24)' },
    pending:  { bg: 'rgba(245,158,11,0.12)', color: C.warning, border: 'rgba(245,158,11,0.24)' },
  }
  const s = map[status?.toLowerCase()] ?? { bg: 'rgba(56,189,248,0.10)', color: C.info, border: 'rgba(56,189,248,0.22)' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, background:s.bg, color:s.color, border:`1px solid ${s.border}`, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>
      {status ?? '—'}
    </span>
  )
}

const inputStyle: React.CSSProperties = {
  width:'100%',
  background:C.panel2,
  border:`1px solid ${C.border}`,
  color:C.text2,
  borderRadius:10,
  padding:'10px 12px',
  fontFamily:FF.body,
  fontSize:14,
}

const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

export default function AdminHRPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'employees' | 'access' | 'reports'>('overview')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      supabase.from('employee_masters').select('*').order('created_at', { ascending: false }),
      supabase.from('user_accounts').select('*').order('created_at', { ascending: false }),
    ]).then(([eRes, aRes]) => {
      setEmployees(eRes.data ?? [])
      setAccounts(aRes.data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const safeEmp = employees ?? []
  const safeAcc = accounts ?? []
  const filteredEmp = search
    ? safeEmp.filter(e => (e.name ?? '').toLowerCase().includes(search.toLowerCase()) || (e.email ?? '').toLowerCase().includes(search.toLowerCase()))
    : safeEmp

  const kpis = [
    { label: 'Employees', value: safeEmp.length, icon: <Users size={16} color={C.gold} /> },
    { label: 'Active Employees', value: safeEmp.filter(e => e.status?.toLowerCase() === 'active').length, icon: <Users size={16} color={C.success} /> },
    { label: 'Access Users', value: safeAcc.length, icon: <ShieldCheck size={16} color={C.info} /> },
    { label: 'Active Users', value: safeAcc.filter(a => a.status?.toLowerCase() === 'active').length, icon: <ShieldCheck size={16} color={C.orange} /> },
  ]

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'employees', label: 'Employees' },
    { key: 'access', label: 'Admin/Access' },
    { key: 'reports', label: 'Reports' },
  ]

  const tabStyle = (t: string): React.CSSProperties => ({
    padding:'9px 16px',
    borderRadius:10,
    fontSize:13,
    fontWeight:600,
    cursor:'pointer',
    background: tab === t ? C.gold : 'transparent',
    color: tab === t ? C.bg : C.text2,
    border: tab === t ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
    fontFamily:FF.body,
  })

  const EmployeeTable = () => (
    <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Employee Directory</h2>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>Employee master records, roles, and contact details.</p>
        </div>
        <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:C.gold, border:`1px solid ${C.gold}`, borderRadius:8, color:C.bg, fontSize:13, fontFamily:FF.body, fontWeight:700, cursor:'pointer' }}>
          <Plus size={14} /> Add Employee
        </button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1 1 280px', maxWidth:320 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
          <input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft:32 }} />
        </div>
        <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted }}>{filteredEmp.length} visible row(s)</div>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
          <thead>
            <tr>
              {['Name','Department','Title','Role','Status','Branch/Zone','Phone','Email','Action'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
            ) : (filteredEmp ?? []).length === 0 ? (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No employees found.</td></tr>
            ) : (filteredEmp ?? []).map((e, i) => (
              <tr key={e.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                <td style={{ ...tdStyle, color:C.text }}>{e.name ?? '—'}</td>
                <td style={tdStyle}>{e.department ?? '—'}</td>
                <td style={tdStyle}>{e.title ?? '—'}</td>
                <td style={{ ...tdStyle, color:C.info }}>{e.role ?? '—'}</td>
                <td style={tdStyle}>{statusBadge(e.status)}</td>
                <td style={tdStyle}>{e.branch_zone ?? e.zone ?? '—'}</td>
                <td style={tdStyle}>{e.phone ?? '—'}</td>
                <td style={tdStyle}>{e.email ?? '—'}</td>
                <td style={tdStyle}><button style={{ padding:'6px 10px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.gold, fontFamily:FF.body, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Admin & HR Portal</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Employee management, HR visibility, and access administration.</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</span>
              {k.icon}
            </div>
            <div style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {tabs.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {(tab === 'overview' || tab === 'employees') && <EmployeeTable />}

      {tab === 'access' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ marginBottom:16 }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Admin & Access Accounts</h2>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>User accounts and access status across the operation.</p>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead>
                <tr>
                  {['Name','Email','Role','Phone','Status','Action'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading...</td></tr>
                ) : (safeAcc ?? []).length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No user accounts found.</td></tr>
                ) : (safeAcc ?? []).map((u, i) => (
                  <tr key={u.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                    <td style={{ ...tdStyle, color:C.text }}>{u.name ?? '—'}</td>
                    <td style={tdStyle}>{u.email ?? '—'}</td>
                    <td style={{ ...tdStyle, color:C.info }}>{u.role ?? '—'}</td>
                    <td style={tdStyle}>{u.phone ?? '—'}</td>
                    <td style={tdStyle}>{statusBadge(u.status)}</td>
                    <td style={tdStyle}><button style={{ padding:'6px 10px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.gold, fontFamily:FF.body, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <FileBarChart2 size={16} color={C.gold} />
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Reports</h2>
          </div>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.text2, margin:0 }}>HR reports coming soon.</p>
        </div>
      )}
    </div>
  )
}
