// @ts-nocheck
import React, { FormEvent, useCallback, useState } from 'react'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

const VIDEO_URL = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/background_a93e0a05bfce4d5fa60d226584905742.mp4'
const LOGO_URL = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/logo_869b883bce9e40f59d6394b5f754ef08.png'
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setMessage('Please enter your account email.')
      return
    }
    setBusy(true)
    try {
      const redirectTo = `${window.location.origin}/login`
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
      if (error) throw error
      setMessage('Password reset email sent. Please check your inbox.')
    } catch (error: any) {
      setMessage(error?.message || 'Unable to send password reset email.')
    } finally {
      setBusy(false)
    }
  }, [email])

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'#061524', overflow:'hidden', fontFamily:FF.body }}>
      <video autoPlay muted loop playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} src={VIDEO_URL} />
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(140deg, rgba(4,14,28,0.90), rgba(8,22,45,0.78), rgba(6,12,24,0.88))' }} />
      <div style={{ position:'relative', minHeight:'100vh', display:'grid', gridTemplateColumns:'minmax(280px, 1fr) minmax(320px, 420px)', gap:28, alignItems:'center', padding:'32px clamp(20px, 4vw, 48px)' }}>
        <div style={{ color:'#fff', maxWidth:620 }}>
          <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:12 }}>BRITIUM EXPRESS</div>
          <h1 style={{ color:'#fff', fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 12px' }}>FORGOT PASSWORD</h1>
          <p style={{ margin:0, color:'rgba(255,255,255,0.78)', fontSize:14, lineHeight:1.7, maxWidth:520 }}>Enter your BRITIUM work email and we will send a secure password reset link.</p>
        </div>

        <form onSubmit={submit} style={{ width:'100%', maxWidth:420, background:'#ffffff', borderRadius:20, boxShadow:'0 24px 70px rgba(0,0,0,0.5)', padding:'28px 26px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
            <img src={LOGO_URL} alt="Britium Express" style={{ width:54, height:54, objectFit:'contain' }} />
            <div>
              <div style={{ color:'#f59e0b', fontSize:9.5, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:6 }}>Enterprise Portal</div>
              <div style={{ color:'#18181b', fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Password Reset</div>
            </div>
          </div>

          <Link to="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, color:'#b45309', textDecoration:'none', fontSize:12.5, fontWeight:700, marginBottom:18 }}>
            <ArrowLeft size={14} /> Back to login
          </Link>

          {message && (
            <div style={{ marginBottom:14, border:'1px solid #e4e4e7', background:'#fafafa', color:'#52525b', borderRadius:14, padding:'12px 14px', fontSize:13.5, lineHeight:1.55 }}>
              {message}
            </div>
          )}

          <label style={{ display:'block' }}>
            <div style={{ marginBottom:6, color:'#52525b', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Work Email</div>
            <div style={{ display:'flex', alignItems:'center', gap:10, height:46, border:'1px solid #e4e4e7', background:'#fafafa', borderRadius:14, padding:'0 14px' }}>
              <Mail size={16} color="#71717a" />
              <input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="name@britiumexpress.com" style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:13.5, fontFamily:FF.body, color:'#18181b' }} />
            </div>
          </label>

          <button type="submit" disabled={busy} style={{ width:'100%', height:46, border:'none', borderRadius:14, background:'#f59e0b', color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', marginTop:18, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {busy && <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} />}
            Send reset link
          </button>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
