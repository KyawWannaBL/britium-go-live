// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Search, UserCog } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string,any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, completed:{bg:'#052e16',c:'#22c55e',b:'#166534'}, paid:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const ROLES = [
  'Super Admin','Operations Manager','Supervisor','Branch Manager',
  'Warehouse Manager','Data Entry Officer','CS Agent','Finance Officer',
  'Merchant','Customer','Rider','Driver','Helper','Admin',
]

const ROLE_PERMS: Record<string, number> = {
  'Super Admin': 58, 'Operations Manager': 45, 'Supervisor': 38, 'Branch Manager': 35,
  'Warehouse Manager': 30, 'Data Entry Officer': 25, 'CS Agent': 20, 'Finance Officer': 28,
  'Merchant': 15, 'Customer': 8, 'Rider': 12, 'Driver': 10, 'Helper': 5, 'Admin': 50,
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = { active:'active', blocked:'failed', pending:'pending' }
  return <span style={badge(map[status?.toLowerCase()] ?? status)}>{status ?? '—'}</span>
}

const inputStyle: React.CSSProperties = {
  background: C.panel2, border: `1px solid ${C.border}`, color: C.text2,
  borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', width: '100%', fontFamily: FF.body,
}

const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }

type Tab = 'users' | 'create' | 'reset' | 'roles' | 'approvals'

export default function AccountsPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('users')
  const [search, setSearch] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CS Agent', phone: '', branch_zone: '' })

  const load = () => {
    setLoading(true)
    supabase.from('user_accounts').select('*').order('created_at', { ascending: false })
      .then(({ data: d }) => { setData(d ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const safeData = data ?? []
  const filtered = search
    ? safeData.filter(u => (u.name ?? '').toLowerCase().includes(search.toLowerCase()) || (u.email ?? '').toLowerCase().includes(search.toLowerCase()))
    : safeData

  const pending = safeData.filter(u => u.status?.toLowerCase() === 'pending')

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'users', label: 'Users' },
    { key: 'create', label: 'Create Account' },
    { key: 'reset', label: 'Reset / Block' },
    { key: 'roles', label: 'Roles & Permissions' },
    { key: 'approvals', label: 'Approvals', badge: pending.length },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
          <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><UserCog size={22} color={C.gold} /></div>
          <div>
            <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>ACCOUNT MANAGEMENT</h1>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Create accounts, approve requests, reset access, block users and assign permissions.</p>
          </div>
        </div>
        <button onClick={load} style={btnBase}><RefreshCw size={15} style={loading ? { animation:'spin 0.8s linear infinite' } : undefined} /> Refresh</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          { label:'Total Users', value:safeData.length },
          { label:'Active', value:safeData.filter(u => (u.status ?? '').toLowerCase() === 'active').length },
          { label:'Pending', value:pending.length },
          { label:'Roles', value:ROLES.length },
        ].map(item => (
          <div key={item.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{item.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btnBase, background: tab === t.key ? C.panelHover : C.panel2, color: tab === t.key ? C.gold : C.text2, border:`1px solid ${tab === t.key ? C.gold : C.border}` }}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && <span style={{ ...badge('pending'), marginLeft:4 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Users</h2>
          <div style={{ position:'relative', maxWidth:320, marginBottom:16 }}>
            <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
            <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft:38 }} />
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['Name','Email','Role','Phone','Status','Action'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:32, color:C.muted, fontSize:13.5 }}>Loading...</td></tr>
                ) : (filtered ?? []).length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:32, color:C.muted, fontSize:13.5 }}>No users found.</td></tr>
                ) : (
                  (filtered ?? []).map((u, i) => (
                    <tr key={u.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ padding:'11px 14px', color:C.text2, fontWeight:500, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.name ?? '—'}</td>
                      <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.email ?? '—'}</td>
                      <td style={{ padding:'11px 14px', color:C.gold, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.role ?? '—'}</td>
                      <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.phone ?? '—'}</td>
                      <td style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}22` }}>{statusBadge(u.status)}</td>
                      <td style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}22` }}>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          <button style={{ ...btnBase, padding:'5px 10px', fontSize:12 }}>Edit</button>
                          <button style={{ ...btnBase, padding:'5px 10px', fontSize:12, background:'rgba(255,79,134,0.08)', color:C.error, border:`1px solid ${C.error}33` }}>Block</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'create' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, maxWidth:720 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Create New Account</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:16 }}>
            {(['name','email','password','phone','branch_zone'] as const).map(f => (
              <div key={f}>
                <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{f.replace('_',' ')}</label>
                <input type={f === 'password' ? 'password' : 'text'} value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                {(ROLES ?? []).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button style={{ ...btnBase, marginTop:20, background:C.gold, color:'#1b1406', border:`1px solid ${C.gold}` }}>Create Account</button>
        </div>
      )}

      {tab === 'reset' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, maxWidth:560 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Reset / Block Account</h2>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Search by Email</label>
            <input placeholder="user@example.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <button style={btnBase}>Reset Password</button>
            <button style={{ ...btnBase, background:'rgba(255,79,134,0.08)', color:C.error, border:`1px solid ${C.error}33` }}>Block Account</button>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Role Definitions</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['Role','Permissions'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(ROLES ?? []).map((r, i) => (
                  <tr key={r} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={{ padding:'11px 14px', color:C.text2, fontWeight:500, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{r}</td>
                    <td style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}22` }}><span style={{ ...badge('processing'), background:'rgba(56,189,248,0.08)', color:C.info, border:`1px solid ${C.info}33` }}>{ROLE_PERMS[r] ?? 0} permissions</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Approvals</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['Name','Email','Role','Requested At','Action'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(pending ?? []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:C.muted, fontSize:13.5 }}>No pending account requests.</td></tr>
                ) : (pending ?? []).map((u, i) => (
                  <tr key={u.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.name ?? '—'}</td>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.email ?? '—'}</td>
                    <td style={{ padding:'11px 14px', color:C.gold, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.role ?? '—'}</td>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                    <td style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}22` }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button style={{ ...btnBase, padding:'5px 10px', fontSize:12, background:'rgba(34,197,94,0.08)', color:C.success, border:`1px solid ${C.success}33` }}>Approve</button>
                        <button style={{ ...btnBase, padding:'5px 10px', fontSize:12, background:'rgba(255,79,134,0.08)', color:C.error, border:`1px solid ${C.error}33` }}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
