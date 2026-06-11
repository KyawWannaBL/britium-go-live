// @ts-nocheck
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { t } from '@/lib/i18n'
import {
  ShieldCheck, ClipboardList, Package, Truck, Warehouse, Building2,
  UserCircle, UserCheck, Wallet, FileText, TrendingUp, Users,
  Eye, EyeOff, Loader2, Shield,
} from 'lucide-react'

const VIDEO_URL = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/background_a93e0a05bfce4d5fa60d226584905742.mp4'
const LOGO_URL = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/logo_869b883bce9e40f59d6394b5f754ef08.png'
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const DASHBOARD_ROUTES: Record<string, string> = {
  super_admin:'/dashboard', supervisor:'/supervisor', ops_manager:'/ops-manager',
  dispatch:'/dispatch', cs_agent:'/customer-service', finance:'/finance',
  data_entry:'/data-entry', warehouse:'/warehouse', rider:'/rider-dashboard',
  driver:'/driver', branch_admin:'/branch-office', merchant:'/merchant',
  customer:'/customer', biz_dev:'/biz-dev',
}

const ROLES = [
  { value:'super_admin', icon:ShieldCheck, accent:'#ef4444' },
  { value:'supervisor', icon:ShieldCheck, accent:'#f97316' },
  { value:'ops_manager', icon:ClipboardList, accent:'#3b82f6' },
  { value:'dispatch', icon:Package, accent:'#06b6d4' },
  { value:'cs_agent', icon:Users, accent:'#14b8a6' },
  { value:'finance', icon:Wallet, accent:'#22c55e' },
  { value:'data_entry', icon:FileText, accent:'#8b5cf6' },
  { value:'warehouse', icon:Warehouse, accent:'#eab308' },
  { value:'rider', icon:Truck, accent:'#0ea5e9' },
  { value:'driver', icon:Truck, accent:'#6366f1' },
  { value:'branch_admin', icon:Building2, accent:'#ec4899' },
  { value:'merchant', icon:UserCircle, accent:'#f59e0b' },
  { value:'customer', icon:UserCheck, accent:'#84cc16' },
  { value:'biz_dev', icon:TrendingUp, accent:'#f43f5e' },
]

const inputStyle: React.CSSProperties = {
  width:'100%',
  height:46,
  background:'#fafafa',
  border:'1px solid #e4e4e7',
  borderRadius:14,
  padding:'0 14px',
  color:'#18181b',
  fontSize:13.5,
  fontFamily:FF.body,
  outline:'none',
  boxSizing:'border-box',
}

export default function SignupPage() {
  const { lang } = useLanguage()
  const nav = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [role, setRole] = useState('')
  const [form, setForm] = useState({ name:'', email:'', phone:'', password:'', confirm:'' })
  const [showPwd, setShowPwd] = useState(false)
  const [showCfm, setShowCfm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const roleObj = ROLES.find(r => r.value === role)
  const roleLabel = role ? t(`role.${role}`, lang) : ''

  function pick(v: string) { setRole(v); setError('') }
  function toForm() {
    if (!role) { setError(t('signup.error.role', lang)); return }
    setStep(2)
    setError('')
  }
  function set(k: string) { return (e: any) => { setForm(p => ({ ...p, [k]: e.target.value })); setError('') } }

  async function submit(e: any) {
    e.preventDefault()
    if (!form.name.trim()) { setError(t('signup.error.name', lang)); return }
    if (!form.email.trim()) { setError(t('signup.error.email', lang)); return }
    if (form.password.length < 8) { setError(t('signup.error.password', lang)); return }
    if (form.password !== form.confirm) { setError(t('signup.error.confirm', lang)); return }
    setLoading(true)
    setError('')
    try {
      const { error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.name, phone: form.phone, role } },
      })
      if (authErr) throw authErr
      setSuccess(true)
      setTimeout(() => nav(DASHBOARD_ROUTES[role] || '/dashboard'), 2200)
    } catch (err: any) {
      setError(err?.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ position:'relative', minHeight:'100vh', background:'#061524', overflow:'hidden', fontFamily:FF.body }}>
        <video autoPlay muted loop playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} src={VIDEO_URL} />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(140deg, rgba(4,14,28,0.90), rgba(8,22,45,0.78), rgba(6,12,24,0.88))' }} />
        <div style={{ position:'relative', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ width:'100%', maxWidth:420, background:'#ffffff', borderRadius:20, boxShadow:'0 24px 70px rgba(0,0,0,0.5)', padding:'34px 30px', textAlign:'center' }}>
            <img src={LOGO_URL} alt="Britium Express" style={{ width:62, height:62, objectFit:'contain', margin:'0 auto 16px' }} />
            <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:10 }}>Enterprise Portal</div>
            <h1 style={{ margin:'0 0 10px', fontSize:22, fontWeight:700, color:'#18181b' }}>{t('signup.success.title', lang)}</h1>
            <p style={{ margin:0, fontSize:13.5, lineHeight:1.6, color:'#52525b' }}>{t('signup.success.redirect', lang).replace('{role}', roleLabel)}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'#061524', overflow:'hidden', fontFamily:FF.body }}>
      <video autoPlay muted loop playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} src={VIDEO_URL} />
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(140deg, rgba(4,14,28,0.90), rgba(8,22,45,0.78), rgba(6,12,24,0.88))' }} />
      <div style={{ position:'relative', minHeight:'100vh', display:'grid', gridTemplateColumns:'minmax(280px, 1fr) minmax(340px, 420px)', gap:28, alignItems:'center', justifyContent:'center', padding:'32px clamp(20px, 4vw, 48px)' }}>
        <div style={{ color:'#fff', maxWidth:620 }}>
          <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:12 }}>BRITIUM EXPRESS</div>
          <h1 style={{ color:'#fff', fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 12px' }}>{t('signup.title', lang)}</h1>
          <p style={{ margin:0, color:'rgba(255,255,255,0.78)', fontSize:14, lineHeight:1.7, maxWidth:520 }}>{step === 1 ? t('signup.step.role', lang) : t('signup.step.form', lang).replace('{role}', roleLabel)}</p>
        </div>

        <div style={{ width:'100%', maxWidth:420, background:'#ffffff', borderRadius:20, boxShadow:'0 24px 70px rgba(0,0,0,0.5)', padding:'28px 26px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:22 }}>
            <img src={LOGO_URL} alt="Britium Express" style={{ width:54, height:54, objectFit:'contain' }} />
            <div>
              <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:6 }}>Enterprise Portal</div>
              <div style={{ color:'#18181b', fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Sign Up</div>
            </div>
          </div>

          {step === 1 && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10, marginBottom:18 }}>
                {ROLES.map(({ value, icon: Icon, accent }) => {
                  const sel = role === value
                  return (
                    <button key={value} onClick={() => pick(value)} style={{ border:`1px solid ${sel ? accent : '#e4e4e7'}`, background:sel ? `${accent}12` : '#fff', borderRadius:14, padding:'12px 10px', cursor:'pointer', textAlign:'left' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <Icon size={15} color={sel ? accent : '#71717a'} />
                        <span style={{ fontSize:12.5, fontWeight:700, color:'#18181b' }}>{t(`role.${value}`, lang)}</span>
                      </div>
                      <p style={{ margin:0, fontSize:11.5, lineHeight:1.45, color:'#71717a' }}>{t(`role.${value}.desc`, lang)}</p>
                    </button>
                  )
                })}
              </div>
              {error && <div style={{ marginBottom:14, color:'#e11d48', fontSize:12.5 }}>{error}</div>}
              <button onClick={toForm} style={{ width:'100%', height:46, border:'none', borderRadius:14, background:'#f59e0b', color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>{t('signup.continue', lang)}</button>
              <p style={{ textAlign:'center', fontSize:12.5, color:'#71717a', margin:'16px 0 0' }}>
                {t('signup.login_link', lang)} <Link to="/login" style={{ color:'#b45309', fontWeight:700, textDecoration:'none' }}>Sign In</Link>
              </p>
            </>
          )}

          {step === 2 && (
            <form onSubmit={submit}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #fde68a', background:'#fffaf0', borderRadius:14, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {roleObj && <roleObj.icon size={15} color={roleObj.accent} />}
                  <div>
                    <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase' }}>{t('signup.selected_role', lang)}</div>
                    <div style={{ color:'#18181b', fontSize:13.5, fontWeight:700 }}>{roleLabel}</div>
                  </div>
                </div>
                <button type="button" onClick={() => { setStep(1); setError('') }} style={{ border:'none', background:'transparent', color:'#b45309', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>{t('signup.change', lang)}</button>
              </div>

              <div style={{ display:'grid', gap:12 }}>
                <label>
                  <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('signup.label.full_name', lang)}</div>
                  <input style={inputStyle} value={form.name} onChange={set('name')} placeholder={t('signup.placeholder.name', lang)} />
                </label>
                <label>
                  <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('signup.label.email', lang)}</div>
                  <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder={t('signup.placeholder.email', lang)} />
                </label>
                <label>
                  <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('signup.label.phone', lang)}</div>
                  <input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder={t('signup.placeholder.phone', lang)} />
                </label>
                <label>
                  <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('signup.label.password', lang)}</div>
                  <div style={{ position:'relative' }}>
                    <input style={{ ...inputStyle, paddingRight:42 }} type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder={t('signup.placeholder.password', lang)} />
                    <button type="button" onClick={() => setShowPwd(p => !p)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', cursor:'pointer', padding:0 }}>{showPwd ? <EyeOff size={15} color="#71717a" /> : <Eye size={15} color="#71717a" />}</button>
                  </div>
                </label>
                <label>
                  <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('signup.label.confirm', lang)}</div>
                  <div style={{ position:'relative' }}>
                    <input style={{ ...inputStyle, paddingRight:42 }} type={showCfm ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder={t('signup.placeholder.password', lang)} />
                    <button type="button" onClick={() => setShowCfm(p => !p)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', cursor:'pointer', padding:0 }}>{showCfm ? <EyeOff size={15} color="#71717a" /> : <Eye size={15} color="#71717a" />}</button>
                  </div>
                </label>
              </div>

              {error && <div style={{ marginTop:12, color:'#e11d48', fontSize:12.5 }}>{error}</div>}

              <button type="submit" disabled={loading} style={{ width:'100%', height:46, border:'none', borderRadius:14, background:'#f59e0b', color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', marginTop:16, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {loading ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> {t('signup.submitting', lang)}</> : t('signup.submit', lang)}
              </button>

              <p style={{ textAlign:'center', fontSize:12.5, color:'#71717a', margin:'16px 0 0' }}>
                {t('signup.login_link', lang)} <Link to="/login" style={{ color:'#b45309', fontWeight:700, textDecoration:'none' }}>Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
