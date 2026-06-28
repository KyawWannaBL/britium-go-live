import React, { useState, useCallback, useEffect } from 'react'
import { Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useEnterpriseMasterData } from '@/hooks/useEnterpriseMasterData'
import { useLanguage } from '@/contexts/LanguageContext'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type PaymentMethod = 'COD' | 'Prepaid' | 'Monthly'
type ServiceType = 'Standard' | 'Express' | 'Overnight'
type Priority = 'Normal' | 'High' | 'Urgent'
type Tier = 'Standard' | 'Royal'

interface FormState {
  merchantId: string
  merchantName: string
  merchantCode: string
  senderPhone: string
  pickupAddress: string
  pickupTownship: string
  pickupCity: string
  pickupDate: string
  pickupTime: string
  parcelCount: number
  recipientName: string
  recipientPhone: string
  deliveryTownship: string
  deliveryAddress: string
  paymentMethod: PaymentMethod
  codAmount: number
  serviceType: ServiceType
  priority: Priority
  tier: Tier
  weightKg: number
  baseFee: number
  isHighway: boolean
  remarks: string
}

// ... Keep calcTariff, pickupId, deliverId, invoiceNo, waybillNo helper functions ...
function calcTariff(tier: Tier, weightKg: number, baseFee: number, isHighway: boolean) {
  const ceilWt = Math.ceil(weightKg)
  const allow = tier === 'Royal' ? 5 : 3
  const extra = Math.max(0, ceilWt - allow)
  const surcharge = extra * 500
  const hwFee = isHighway ? 3000 : 0
  return { ceilWt, allow, extra, surcharge, hwFee, total: baseFee + surcharge + hwFee }
}
function pickupId(date: string, code: string, count: number): string {
  if (!date || !code) return 'P----'
  return `P${new Date(date).toISOString().slice(5, 10).replace('-','')}-${code.toUpperCase().slice(0, 3).padEnd(3, 'X')}-${String(count).padStart(3, '0')}`
}
function deliverId(date: string, code: string, count: number): string { return pickupId(date, code, count).replace(/^P/, 'D') }
function invoiceNo(date: string, code: string): string { return deliverId(date, code, 0).replace(/^D/, 'INV') }
function waybillNo(pickId: string): string { return pickId.replace(/^P/, 'WB') }

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ borderBottom: '1px solid ' + C.border, paddingBottom: 12, marginBottom: 16 }}>
      <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 4px' }}>{title}</h2>
      {sub ? <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{sub}</p> : null}
    </div>
  )
}
function Label({ children }: { children?: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>{children}</label>
}

const today = new Date().toISOString().slice(0, 10)
const defaultForm: FormState = {
  merchantId: '', merchantName: '', merchantCode: '', senderPhone: '', pickupAddress: '', pickupTownship: '', pickupCity: 'Yangon', pickupDate: today, pickupTime: '09:00', parcelCount: 1, recipientName: '', recipientPhone: '', deliveryTownship: '', deliveryAddress: '', paymentMethod: 'COD', codAmount: 0, serviceType: 'Standard', priority: 'Normal', tier: 'Standard', weightKg: 1, baseFee: 4000, isHighway: false, remarks: '',
}

export default function PickupFormPage() {
  const { lang, setLang } = useLanguage()
  const { snapshot, loading: loadingMaster } = useEnterpriseMasterData() // Globally wired Master Data
  
  const [form, setForm] = useState<FormState>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  // Dynamically map from unified registry 
  const merchants = snapshot.merchant || []
  const townships = snapshot.township || []

  const handleMerchantSelect = useCallback((merchantCode: string) => {
    const m = merchants.find((x: any) => x.record_code === merchantCode || x.merchant_code === merchantCode)
    if (m) {
      setForm(prev => ({
        ...prev,
        merchantId: merchantCode,
        merchantCode: String(merchantCode).slice(0, 3).toUpperCase(),
        merchantName: m.display_name || m.merchant_name || '',
        senderPhone: m.phone_primary || m.contact_phone || '',
        pickupAddress: m.address_line_1 || m.pickup_address || '',
        pickupTownship: m.township || m.pickup_township || '',
      }))
    }
  }, [merchants])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }))

  const pickId = pickupId(form.pickupDate, form.merchantCode, form.parcelCount)
  const tariff = calcTariff(form.tier, form.weightKg, form.baseFee, form.isHighway)

  const handleSubmit = async () => {
    if (!form.merchantId || !form.pickupAddress || !form.recipientName) {
      setSubmitError('Please fill in Merchant, Pickup Address, and Recipient Name.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    
    try {
      // Create Pickup Request Backend Record
      const { error } = await supabase.from('be_portal_pickup_requests').insert({
        pickup_id: pickId,
        merchant_id: form.merchantId,
        merchant_name: form.merchantName,
        merchant_code: form.merchantCode,
        sender_phone: form.senderPhone,
        pickup_address: form.pickupAddress,
        pickup_township: form.pickupTownship,
        pickup_city: form.pickupCity,
        expected_parcels: form.parcelCount,
        payment_terms: form.paymentMethod,
        priority: form.priority,
        status: 'PICKUP_REQUESTED'
      })

      if (error) throw error

      // Log the event securely
      await supabase.from('be_portal_cargo_events').insert({
        pickup_id: pickId,
        event_type: 'PICKUP_REQUESTED',
        description: `Pickup request created by Operations via Portal.`,
        actor_role: 'operations'
      })

      setSuccessId(pickId)
      setForm(defaultForm)
    } catch (e: any) {
      setSubmitError(e.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: C.panel2, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: FF.body, outline: 'none' }

  if (successId) {
    return (
      <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 520, background: C.panel, border: '1px solid ' + C.border, borderRadius: 16, padding: 36, textAlign: 'center' }}>
          <CheckCircle size={52} color={C.success} style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.success, marginBottom: 8 }}>Pickup Request Submitted</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.gold, marginBottom: 8, fontFamily: 'monospace' }}>{successId}</div>
          <p style={{ fontSize: 14, color: C.text2, marginTop: 0, marginBottom: 24 }}>Your pickup request has been registered. The rider will be assigned shortly.</p>
          <button onClick={() => setSuccessId(null)} style={{ display: 'inline-flex', padding: '9px 18px', background: C.gold, color: '#1a0a00', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>New Pickup Request</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase', color: C.gold, margin: 0 }}>Pickup Request Form</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '4px 0 0' }}>Register a new pickup with real-time master data mapping.</p>
        </div>
        <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border }}>
          <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>EN</button>
          <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>မြန်မာ</button>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title="1. Merchant / Sender" sub="Select merchant to auto-fill details from Master Data Registry" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            <Label>Merchant Select</Label>
            <select value={form.merchantId} onChange={e => handleMerchantSelect(e.target.value)} style={inputStyle}>
              <option value="">{loadingMaster ? 'Loading synced master data...' : '— Select Merchant —'}</option>
              {merchants.map((m: any) => <option key={m.record_code} value={m.record_code}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <Label>Merchant Name</Label>
            <input value={form.merchantName} onChange={e => set('merchantName', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>Sender Phone</Label>
            <input value={form.senderPhone} onChange={e => set('senderPhone', e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title="2. Pickup Details" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Pickup Address</Label>
            <input value={form.pickupAddress} onChange={e => set('pickupAddress', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>Township</Label>
            <select value={form.pickupTownship} onChange={e => set('pickupTownship', e.target.value)} style={inputStyle}>
              <option value="">— Select Township —</option>
              {townships.length > 0 ? townships.map((t: any) => <option key={t.display_name} value={t.display_name}>{t.display_name}</option>) : <option>Yangon Central</option>}
            </select>
          </div>
          <div>
            <Label>Parcel Count</Label>
            <input type="number" min={1} value={form.parcelCount} onChange={e => set('parcelCount', parseInt(e.target.value) || 1)} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title="3. Recipient Details" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div><Label>Recipient Name</Label><input value={form.recipientName} onChange={e => set('recipientName', e.target.value)} style={inputStyle} /></div>
          <div><Label>Recipient Phone</Label><input value={form.recipientPhone} onChange={e => set('recipientPhone', e.target.value)} style={inputStyle} /></div>
          <div><Label>Delivery Address</Label><input value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} style={inputStyle} /></div>
        </div>
      </div>

      {submitError && (
        <div style={{ background: '#4a0521', border: '1px solid #831843', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={15} color={C.error} />
          <p style={{ color: C.error, fontSize: 13, margin: 0 }}>{submitError}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{ width: '100%', padding: '12px 18px', background: submitting ? '#a16207' : C.gold, color: '#1a0a00', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}
      >
        {submitting ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null} 
        {submitting ? 'Submitting...' : 'Submit Pickup Request'}
      </button>
    </div>
  )
}