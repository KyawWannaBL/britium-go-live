// @ts-nocheck
import React, { useState } from 'react'
import { useAuth } from '@/contexts/auth'
import { supabase } from '@/integrations/supabase/client'
import { User, Lock, Save } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string, any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, enabled:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, inactive:{bg:C.panel2,c:C.muted,b:C.border}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, info:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'} }
  const v = m[s?.toLowerCase()] ?? { bg:C.panel2, c:C.muted, b:C.border }
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const inputStyle: React.CSSProperties = {
  background: C.panel2,
  border: `1px solid ${C.border}`,
  color: C.text2,
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13.5,
  outline: 'none',
  width: '100%',
  fontFamily: FF.body,
}

const getInitials = (email: string) => {
  const parts = email?.split('@')[0]?.split(/[._-]/) ?? []
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function ProfilePage() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const displayName = email.split('@')[0] ?? 'User'

  const [form, setForm] = useState({
    displayName,
    phone: '',
    department: '',
  })

  const [pwForm, setPwForm] = useState({
    current: '',
    newPw: '',
    confirm: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState('')

  const initials = getInitials(email) || 'SU'

  const saveProfile = async () => {
    setSavingProfile(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: form.displayName,
        phone: form.phone,
        department: form.department,
      },
    })
    setSavingProfile(false)
    setMessage(error ? (error.message || 'Unable to save profile.') : 'Profile updated successfully.')
  }

  const changePassword = async () => {
    if (!pwForm.newPw || pwForm.newPw !== pwForm.confirm) {
      setMessage('New password and confirmation must match.')
      return
    }
    setSavingPassword(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    setSavingPassword(false)
    setMessage(error ? (error.message || 'Unable to update password.') : 'Password updated successfully.')
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>PROFILE</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>User identity, contact details, and credential management.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <span style={badge('active')}>Authenticated User</span>
        </div>
      </div>

      {message && (
        <div style={{ marginBottom:16, padding:'12px 14px', borderRadius:14, background:C.panel, border:`1px solid ${C.border}`, color:C.text2, fontSize:13.5 }}>
          {message}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'minmax(260px, 320px) minmax(0, 1fr)', gap:18 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:28, display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
          <div style={{ width:96, height:96, borderRadius:'50%', background:C.panel2, border:`3px solid ${C.gold}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, fontWeight:700, color:C.gold }}>
            {initials}
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ color:C.text, fontSize:18, fontWeight:700 }}>{form.displayName || displayName}</div>
            <div style={{ color:C.muted, fontSize:13.5, marginTop:4 }}>{email}</div>
          </div>
          <span style={badge('info')}>Super Admin</span>
        </div>

        <div style={{ display:'grid', gap:18 }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <User size={16} color={C.info} />
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Profile Information</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:14, marginBottom:18 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Display Name</div>
                <input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Email Address</div>
                <input value={email} readOnly style={{ ...inputStyle, opacity:0.7, cursor:'not-allowed' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Phone</div>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+95-9-..." style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Department</div>
                <input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <button onClick={saveProfile} style={{ height:42, padding:'0 18px', borderRadius:12, border:'none', background:C.gold, color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
              <Save size={14} /> {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <Lock size={16} color={C.info} />
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Change Password</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:14, marginBottom:18 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Current Password</div>
                <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>New Password</div>
                <input type="password" value={pwForm.newPw} onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Confirm Password</div>
                <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <button onClick={changePassword} style={{ height:42, padding:'0 18px', borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
              <Lock size={14} /> {savingPassword ? 'Updating…' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
