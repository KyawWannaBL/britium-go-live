// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { Building2, Bell, Save, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

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

const FIELDS: { key: string; label: string; placeholder: string; span2?: boolean }[] = [
  { key: 'company_name', label: 'COMPANY NAME', placeholder: 'Enter company name' },
  { key: 'business_license', label: 'BUSINESS LICENSE', placeholder: 'License number' },
  { key: 'email_address', label: 'EMAIL ADDRESS', placeholder: 'contact@example.com' },
  { key: 'phone_number', label: 'PHONE NUMBER', placeholder: '+95-9-XXXXXXX' },
  { key: 'address', label: 'ADDRESS', placeholder: 'Street, Township, City', span2: true },
  { key: 'website', label: 'WEBSITE', placeholder: 'https://...' },
]

const NOTIFICATION_KEYS = ['order_status', 'new_order', 'failed_delivery', 'cod_reminders'] as const
const NOTIFICATIONS = [
  { key: 'order_status', title: 'Order Status Updates', desc: 'Get notified when order status changes' },
  { key: 'new_order', title: 'New Order Alerts', desc: 'Immediate alert on new merchant orders' },
  { key: 'failed_delivery', title: 'Failed Delivery Alerts', desc: 'Notify supervisors on failed deliveries' },
  { key: 'cod_reminders', title: 'COD Settlement Reminders', desc: 'Reminders to settle COD with riders and drivers' },
]

type NotifKey = typeof NOTIFICATION_KEYS[number]

export default function SettingsPage() {
  const [company, setCompany] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(f => [f.key, ''])))
  const [toggles, setToggles] = useState<Record<NotifKey, boolean>>(Object.fromEntries(NOTIFICATION_KEYS.map(k => [k, false])) as Record<NotifKey, boolean>)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [rowId, setRowId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (error) throw error
      if (data) {
        setRowId(data.id ?? null)
        setCompany({
          company_name: data.company_name ?? '',
          business_license: data.business_license ?? '',
          email_address: data.email_address ?? '',
          phone_number: data.phone_number ?? '',
          address: data.address ?? '',
          website: data.website ?? '',
        })
        setToggles({
          order_status: data.notif_order_status ?? false,
          new_order: data.notif_new_order ?? false,
          failed_delivery: data.notif_failed_delivery ?? false,
          cod_reminders: data.notif_cod_reminders ?? false,
        })
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    setStatus('idle')
    setErrorMsg('')
    const payload = {
      company_name: company.company_name,
      business_license: company.business_license,
      email_address: company.email_address,
      phone_number: company.phone_number,
      address: company.address,
      website: company.website,
      notif_order_status: toggles.order_status,
      notif_new_order: toggles.new_order,
      notif_failed_delivery: toggles.failed_delivery,
      notif_cod_reminders: toggles.cod_reminders,
      updated_at: new Date().toISOString(),
    }
    try {
      let error: any
      if (rowId) {
        ;({ error } = await supabase.from('company_settings').update(payload).eq('id', rowId))
      } else {
        const { data: inserted, error: insErr } = await supabase.from('company_settings').insert(payload).select('id').single()
        error = insErr
        if (inserted?.id) setRowId(inserted.id)
      }
      if (error) throw error
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Save failed')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const Toggle = ({ k }: { k: NotifKey }) => {
    const on = toggles[k]
    return (
      <div onClick={() => setToggles(p => ({ ...p, [k]: !p[k] }))} style={{ width:46, height:26, borderRadius:99, cursor:'pointer', position:'relative', flexShrink:0, background:on ? C.gold : C.panel2, border:`1px solid ${on ? C.gold : C.border}`, transition:'all 0.2s' }}>
        <div style={{ width:20, height:20, borderRadius:'50%', background:on ? '#1c1917' : C.text2, position:'absolute', top:2, left:on ? 23 : 2, transition:'left 0.2s' }} />
      </div>
    )
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>SYSTEM SETTINGS</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Portal configuration, company profile data, and notification preferences.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} disabled={loading} style={{ height:40, padding:'0 14px', borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.text2, fontFamily:FF.body, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
          </button>
          <button onClick={save} disabled={saving || loading} style={{ height:40, padding:'0 18px', borderRadius:12, border:'none', background:C.gold, color:'#1c1917', fontFamily:FF.body, fontSize:13.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
            {saving ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {status === 'saved' && (
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:14, padding:'12px 14px', marginBottom:16, color:C.success, fontSize:13.5, fontWeight:600 }}>
          <CheckCircle size={15} /> Settings saved successfully.
        </div>
      )}
      {status === 'error' && (
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,79,134,0.12)', border:'1px solid rgba(255,79,134,0.25)', borderRadius:14, padding:'12px 14px', marginBottom:16, color:C.error, fontSize:13.5, fontWeight:600 }}>
          <AlertCircle size={15} /> {errorMsg || 'Save failed. Please try again.'}
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:220, color:C.muted, gap:10, fontSize:14 }}>
          <Loader2 size={18} style={{ animation:'spin 1s linear infinite' }} /> Loading settings from Supabase…
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:18 }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <Building2 size={18} color={C.info} />
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Company Profile</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:14 }}>
              {FIELDS.map(f => (
                <div key={f.key} style={f.span2 ? { gridColumn:'span 2' } : undefined}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{f.label}</div>
                  <input value={company[f.key] ?? ''} onChange={e => setCompany(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                </div>
              ))}
            </div>
            {!rowId && !loading && (
              <p style={{ marginTop:12, fontSize:12, color:C.muted }}>No settings record found. Fill in the fields above and save to create one.</p>
            )}
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:18, padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <Bell size={18} color={C.gold} />
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Notification Preferences</h2>
            </div>
            <div style={{ display:'grid', gap:2 }}>
              {NOTIFICATIONS.map(n => (
                <div key={n.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'16px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div>
                    <div style={{ color:C.text, fontSize:13.5, fontWeight:600 }}>{n.title}</div>
                    <div style={{ color:C.muted, fontSize:12.5, marginTop:4 }}>{n.desc}</div>
                  </div>
                  <Toggle k={n.key as NotifKey} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
