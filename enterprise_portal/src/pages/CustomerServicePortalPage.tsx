// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }

function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function merchantPickupAddress(row: any): string {
  return pickText(
    row?.pickup_address,
    row?.merchant_pickup_address,
    row?.default_pickup_address,
    row?.registered_address,
    row?.business_address,
    row?.address,
    row?.shop_address,
    row?.warehouse_address,
    row?.origin_address
  )
}

function merchantDefaultParcelCount(row: any): number {
  const raw = Number(
    row?.default_parcel_count ??
    row?.parcel_count ??
    row?.expected_parcel_count ??
    row?.avg_parcel_count ??
    1
  )
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

function text(v:any, fallback='—') { return v === null || v === undefined || v === '' ? fallback : String(v) }
function num(v:any, fallback=0) { const n = Number(v); return Number.isFinite(n) ? n : fallback }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function formatDate(v:any) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return text(v)
  return d.toLocaleString('en-GB', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
}
function badge(status:any): React.CSSProperties {
  const s = text(status, '').toUpperCase()
  const map: Record<string, any> = {
    SUBMITTED: [C.warning, '#451a03'],
    PENDING_PICKUP: [C.gold, '#3b2503'],
    PICKED_UP: [C.info, '#082f49'],
    RECEIVED_WAREHOUSE: [C.info, '#082f49'],
    SORTED: [C.gold, '#3b2503'],
    BAGGED: [C.orange, '#431407'],
    READY_FOR_WAYPLAN: [C.success, '#052e16'],
    WAYPLAN_DRAFTED: [C.warning, '#451a03'],
    WAYPLAN_CONFIRMED: [C.gold, '#3b2503'],
    DELIVERY_ASSIGNED: [C.info, '#082f49'],
    OUT_FOR_DELIVERY: [C.info, '#082f49'],
    DELIVERED: [C.success, '#052e16'],
    FAILED_ATTEMPT: [C.error, '#4a0521'],
    RETURNED: [C.error, '#4a0521'],
    EXCEPTION: [C.error, '#4a0521'],
    ACTIVE: [C.success, '#052e16'],
    DRAFT: [C.warning, '#451a03'],
    CONFIRMED: [C.success, '#052e16'],
  }
  const v = map[s] || [C.text2, C.panel2]
  return { display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', background:v[1], color:v[0], border:`1px solid ${C.border}`, whiteSpace:'nowrap' }
}
function root(): React.CSSProperties { return { minHeight:'100%', background:C.bg, color:C.text, padding:24, fontFamily:FF.body } }
function panel(extra:React.CSSProperties = {}): React.CSSProperties { return { background:`linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}`, borderRadius:20, boxShadow:'0 18px 40px rgba(0,0,0,.20)', ...extra } }
function input(): React.CSSProperties { return { width:'100%', height:42, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:'0 12px', outline:'none', fontFamily:FF.body } }
function textarea(): React.CSSProperties { return { width:'100%', minHeight:84, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:12, outline:'none', fontFamily:FF.body, resize:'vertical' } }
function button(primary=false): React.CSSProperties { return { height:42, borderRadius:12, border:`1px solid ${primary ? C.gold : C.border}`, background:primary ? 'rgba(246,184,75,.15)' : C.panel2, color:primary ? C.gold : C.text2, padding:'0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontWeight:700, fontFamily:FF.body } }
function th(): React.CSSProperties { return { padding:'10px 12px', color:C.muted, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}` } }
function td(): React.CSSProperties { return { padding:'12px', color:C.text2, fontSize:13, borderBottom:`1px solid ${C.border}66`, verticalAlign:'top' } }
function Label({ children }: any) { return <div style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:800, marginBottom:6 }}>{children}</div> }
function Field({ label, children }: any) { return <label style={{ display:'grid', gap:6 }}><Label>{label}</Label>{children}</label> }
function Kpi({ label, value, note, accent=C.gold }: any) {
  return <div style={panel({ padding:16, borderTop:`2px solid ${accent}` })}>
    <div style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:800 }}>{label}</div>
    <div style={{ marginTop:8, fontSize:26, color:accent, fontWeight:800 }}>{value}</div>
    {note ? <div style={{ marginTop:4, fontSize:12, color:C.text2 }}>{note}</div> : null}
  </div>
}
function downloadText(filename:string, content:string, mime='text/csv;charset=utf-8') {
  const blob = new Blob([content], { type:mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function parseCsv(raw:string) {
  const rows:string[][] = []
  let row:string[] = [], cell = '', quote = false
  for (let i=0; i<raw.length; i++) {
    const ch = raw[i], next = raw[i+1]
    if (ch === '"' && quote && next === '"') { cell += '"'; i++; continue }
    if (ch === '"') { quote = !quote; continue }
    if (ch === ',' && !quote) { row.push(cell.trim()); cell=''; continue }
    if ((ch === '\n' || ch === '\r') && !quote) {
      if (ch === '\r' && next === '\n') i++
      row.push(cell.trim()); cell=''
      if (row.some(Boolean)) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  if (!rows.length) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}
function normalizeMerchant(row:any) {
  return {
    merchant_code: text(row.merchant_code || row.code, ''),
    merchant_name: text(row.merchant_name || row.name, ''),
    contact_phone: text(row.contact_phone || row.phone_primary || row.sender_phone || row.phone, ''),
    pickup_address: text(row.pickup_address || row.default_pickup_address || row.address_line_1, ''),
    pickup_township: text(row.pickup_township || row.township, ''),
    pickup_city: text(row.pickup_city || row.city, 'Yangon'),
    payment_profile: text(row.payment_profile || row.payment_terms, 'COD'),
    service_profile: text(row.service_profile, 'Standard'),
    tariff_tier: text(row.tariff_tier || row.tier || row.tier_name, 'Standard'),
    raw: row,
  }
}
function normalizeWorker(row:any) {
  return {
    worker_code: text(row.workforce_code || row.worker_id || row.rider_id || row.driver_id || row.code, ''),
    worker_type: text(row.workforce_type || row.role || row.role_type || row.type, ''),
    display_name: text(row.display_name || row.full_name || row.rider_name || row.driver_name || row.name, ''),
    phone: text(row.phone_e164 || row.phone_number || row.phone_primary || row.phone, ''),
    branch_code: text(row.branch_code, 'YGN'),
    status: text(row.status, 'active'),
    zone: text(row.assigned_zone || row.zone || row.township, ''),
    raw: row,
  }
}
function SectionTitle({ title, subtitle, right }: any) {
  return <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'start', marginBottom:16 }}>
    <div>
      <h2 style={{ margin:0, color:C.text, fontSize:18, fontWeight:800 }}>{title}</h2>
      {subtitle ? <p style={{ margin:'6px 0 0', color:C.text2, fontSize:13, lineHeight:1.5 }}>{subtitle}</p> : null}
    </div>
    {right}
  </div>
}


const EMPTY_HEADER:any = {
  merchant_code:'', merchant_name:'', contact_phone:'', pickup_address:'', pickup_township:'', pickup_city:'Yangon',
  payment_profile:'COD', service_profile:'Standard', tariff_tier:'Standard', branch_code:'YGN', priority:'NORMAL',
  requested_pickup_date: todayISO(), requested_pickup_time_window:'', cs_notes:''
}
const EMPTY_ITEM:any = {
  recipient_name:'', recipient_phone:'', delivery_address:'', delivery_township:'', parcel_count:1, weight_kg:0, cod_amount:0,
  item_description:'', special_instruction:'', priority:'NORMAL'
}
const TEMPLATE = [
  'merchant_code,requested_pickup_date,recipient_name,recipient_phone,delivery_address,delivery_township,parcel_count,weight_kg,cod_amount,priority,special_instruction',
  'M001,' + todayISO() + ',Daw Mya,09999999999,"No. 12, Yangon",Hlaing,1,2.5,15000,NORMAL,Call before delivery'
].join('\n')

export default function CustomerServicePortalPage() {
  const [header, setHeader] = useState<any>(EMPTY_HEADER)
  const [items, setItems] = useState<any[]>([{ ...EMPTY_ITEM }])
  const [orderParcelCount, setOrderParcelCount] = useState<number>(1)
  const [merchants, setMerchants] = useState<any[]>([])
  const [queue, setQueue] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<any>(null)

  const patchHeader = (key:string, value:any) => setHeader((h:any) => ({ ...h, [key]: value }))
  const patchItem = (idx:number, key:string, value:any) => setItems(rows => rows.map((r, i) => i === idx ? { ...r, [key]: value } : r))

  const loadMasters = async () => {
    const rpc = await (supabase as any).rpc('be_master_dropdown_snapshot', { p_branch_code: header.branch_code || 'YGN' })
    if (!rpc.error && rpc.data) {
      const m = Array.isArray(rpc.data?.merchants) ? rpc.data.merchants : Array.isArray(rpc.data) ? rpc.data : []
      if (m.length) { setMerchants(m.map(normalizeMerchant)); return }
    }
    const res = await (supabase as any).from('be_masterdata_merchants').select('*').order('merchant_name', { ascending:true })
    setMerchants((res.data || []).map(normalizeMerchant))
  }

  const loadQueue = async () => {
    setLoading(true)
    const res = await (supabase as any)
      .from('be_portal_pickup_requests')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(100)
    setQueue(res.data || [])
    if (!selected && res.data?.[0]) setSelected(res.data[0])
    setLoading(false)
  }

  useEffect(() => { void loadMasters(); void loadQueue() }, [])

  useEffect(() => {
    const channel = (supabase as any)
      .channel('be-cs-pickup-requests')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void loadQueue())
      .subscribe()
    return () => { (supabase as any).removeChannel(channel) }
  }, [])

  const onMerchantChange = (code:string) => {
    const m = merchants.find(x => x.merchant_code === code)
    if (!m) { patchHeader('merchant_code', code); return }
    setHeader((h:any) => ({
      ...h,
      merchant_code: m.merchant_code,
      merchant_name: m.merchant_name,
      contact_phone: m.contact_phone,
      pickup_address: m.pickup_address,
      pickup_township: m.pickup_township,
      pickup_city: m.pickup_city,
        parcel_count: orderParcelCount,
      payment_profile: m.payment_profile,
      service_profile: m.service_profile,
      tariff_tier: m.tariff_tier,
    }))
  }

  const validate = () => {
    if (!header.merchant_code) return 'Merchant is required.'
    if (!header.pickup_address) return 'Pickup address is required.'
    if (!items.length) return 'At least one delivery item is required.'
    const bad = items.findIndex(r => !r.recipient_name || !r.recipient_phone || !r.delivery_address || !r.delivery_township)
    if (bad >= 0) return `Item row ${bad + 1} is missing recipient phone/name/address/township.`
    return null
  }

  const saveRequest = async () => {
    const err = validate()
    if (err) { setMessage({ type:'error', text:err }); return }
    setSaving(true); setMessage(null)
    try {
      const payloadHeader = {
        ...header,
        total_items: items.length,
        total_parcels: items.reduce((a, r) => a + num(r.parcel_count, 1), 0),
        cod_amount: items.reduce((a, r) => a + num(r.cod_amount, 0), 0),
        weight_kg: items.reduce((a, r) => a + num(r.weight_kg, 0), 0),
      }
      const rpc = await (supabase as any).rpc('be_cs_create_pickup_request', { p_header: payloadHeader, p_items: items })
      if (rpc.error) {
        const pickupId = `PU${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
        const parent = {
          pickup_id: pickupId,
          merchant_code: header.merchant_code,
          merchant_name: header.merchant_name,
          sender_phone: header.contact_phone,
          pickup_address: header.pickup_address,
          pickup_township: header.pickup_township,
          pickup_city: header.pickup_city || 'Yangon',
          service_tier: header.service_profile || 'Standard',
          priority: header.priority || 'NORMAL',
          payment_method: header.payment_profile || 'COD',
          cod_amount: payloadHeader.cod_amount,
          weight_kg: payloadHeader.weight_kg,
          status: 'SUBMITTED',
          branch_code: header.branch_code || 'YGN',
          requester_type: 'CS',
        }
        const ins = await (supabase as any).from('be_portal_pickup_requests').insert(parent).select('id,pickup_id').single()
        if (ins.error) throw ins.error
        const itemPayload = items.map((r, i) => ({
          pickup_request_id: ins.data.id,
          pickup_id: ins.data.pickup_id,
          item_no: i + 1,
          recipient_name: r.recipient_name,
          recipient_phone: r.recipient_phone,
          delivery_address: r.delivery_address,
          delivery_township: r.delivery_township,
          delivery_city: r.delivery_city || 'Yangon',
          parcel_count: num(r.parcel_count, 1),
          weight_kg: num(r.weight_kg, 0),
          cod_amount: num(r.cod_amount, 0),
          item_description: r.item_description,
          special_instruction: r.special_instruction,
          priority: r.priority || header.priority || 'NORMAL',
          item_status: 'SUBMITTED',
        }))
        const itemIns = await (supabase as any).from('be_portal_pickup_request_items').insert(itemPayload)
        if (itemIns.error) console.warn('Item insert failed. Run child table migration.', itemIns.error)
        await (supabase as any).from('be_portal_cargo_events').insert({
          pickup_id: ins.data.pickup_id,
          event_type: 'CS_SUBMITTED_PICKUP_REQUEST',
          description: `CS submitted pickup request with ${items.length} item(s).`,
          actor_role: 'cs',
        })
      }
      setMessage({ type:'success', text:'Pickup request submitted and Supervisor queue notified.' })
      setHeader({ ...EMPTY_HEADER })
      setItems([{ ...EMPTY_ITEM }])
      await loadQueue()
    } catch (e:any) {
      setMessage({ type:'error', text:e?.message || 'Unable to submit pickup request.' })
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (file:File) => {
    const rows = parseCsv(await file.text())
    if (!rows.length) { setMessage({ type:'error', text:'Template is empty or invalid.' }); return }
    const first = rows[0]
    const m = merchants.find(x => x.merchant_code === first.merchant_code)
    if (m) onMerchantChange(m.merchant_code)
    setHeader((h:any) => ({ ...h, merchant_code:first.merchant_code || h.merchant_code, requested_pickup_date:first.requested_pickup_date || h.requested_pickup_date }))
    setItems(rows.map((r:any) => ({
      recipient_name:r.recipient_name, recipient_phone:r.recipient_phone, delivery_address:r.delivery_address, delivery_township:r.delivery_township,
      parcel_count:num(r.parcel_count, 1), weight_kg:num(r.weight_kg, 0), cod_amount:num(r.cod_amount, 0), priority:r.priority || 'NORMAL',
      special_instruction:r.special_instruction || '', item_description:r.item_description || ''
    })))
    setMessage({ type:'success', text:`Loaded ${rows.length} item row(s) into the CS form. Review and submit.` })
  }

  const metrics = useMemo(() => ({
    submitted: queue.filter(r => text(r.status,'').toUpperCase() === 'SUBMITTED').length,
    pendingPickup: queue.filter(r => text(r.status,'').toUpperCase() === 'PENDING_PICKUP').length,
    pickedUp: queue.filter(r => text(r.status,'').toUpperCase() === 'PICKED_UP').length,
    exceptions: queue.filter(r => ['FAILED_ATTEMPT','EXCEPTION','RETURNED'].includes(text(r.status,'').toUpperCase())).length,
  }), [queue])

  return <div style={root()}>
    <div style={{ maxWidth:1680, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>Britium Express</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>Customer Service Pickup Portal</h1>
            <p style={{ margin:0, color:C.text2 }}>CS is the starting point. Register pickup requests, add multiple delivery items, and notify Supervisor for pickup assignment.</p>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button style={button()} onClick={() => downloadText('cs_pickup_request_template.csv', TEMPLATE)}><Download size={16}/>Download Template</button>
            <label style={button()}>
              <FileUp size={16}/>Upload Template
              <input type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={e => e.target.files?.[0] && void onUpload(e.target.files[0])}/>
            </label>
            <button style={button()} onClick={() => void loadQueue()}>{loading ? <Loader2 size={16}/> : <RefreshCw size={16}/>}Refresh</button>
          </div>
        </div>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14 }}>
        <Kpi label="Submitted" value={metrics.submitted} note="Needs Supervisor assignment" accent={C.warning}/>
        <Kpi label="Pending Pickup" value={metrics.pendingPickup} note="Rider assigned" accent={C.gold}/>
        <Kpi label="Picked Up" value={metrics.pickedUp} note="Waiting warehouse" accent={C.info}/>
        <Kpi label="Exceptions" value={metrics.exceptions} note="Needs CS follow-up" accent={C.error}/>
      </section>

      {message ? <section style={panel({ padding:14, borderColor: message.type === 'error' ? C.error : C.success })}>
        <div style={{ display:'flex', gap:10, color: message.type === 'error' ? C.error : C.success }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{message.text}</span></div>
      </section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(440px,.8fr)', gap:18, alignItems:'start' }}>
        <section style={panel({ padding:18 })}>
          <SectionTitle title="Order Pickup Request" subtitle="Merchant data auto-fills from master data. Add multiple recipients/items before submit." />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12 }}>
            <Field label="Merchant"><select style={input()} value={header.merchant_code} onChange={e => onMerchantChange(e.target.value)}>
              <option value="">Select merchant</option>{merchants.map(m => <option key={m.merchant_code} value={m.merchant_code}>{m.merchant_code} — {m.merchant_name}</option>)}
            </select></Field>
            <Field label="Merchant Name"><input style={input()} value={header.merchant_name} onChange={e => patchHeader('merchant_name', e.target.value)}/></Field>
            <Field label="Contact Phone"><input style={input()} value={header.contact_phone} onChange={e => patchHeader('contact_phone', e.target.value)}/></Field>
            <Field label="Branch"><input style={input()} value={header.branch_code} onChange={e => patchHeader('branch_code', e.target.value)}/></Field>
            <Field label="Pickup Township"><input style={input()} value={header.pickup_township} onChange={e => patchHeader('pickup_township', e.target.value)}/></Field>
            <Field label="Pickup City"><input style={input()} value={header.pickup_city} onChange={e => patchHeader('pickup_city', e.target.value)}/></Field>
            <Field label="Payment"><input style={input()} value={header.payment_profile} onChange={e => patchHeader('payment_profile', e.target.value)}/></Field>
            <Field label="Tariff Tier"><input style={input()} value={header.tariff_tier} onChange={e => patchHeader('tariff_tier', e.target.value)}/></Field>
            <Field label="Requested Date"><input type="date" style={input()} value={header.requested_pickup_date} onChange={e => patchHeader('requested_pickup_date', e.target.value)}/></Field>
            <Field label="Time Window"><input style={input()} value={header.requested_pickup_time_window} onChange={e => patchHeader('requested_pickup_time_window', e.target.value)} placeholder="09:00-12:00"/></Field>
            <Field label="Priority"><select style={input()} value={header.priority} onChange={e => patchHeader('priority', e.target.value)}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></Field>
            <Field label="Service"><input style={input()} value={header.service_profile} onChange={e => patchHeader('service_profile', e.target.value)}/></Field>
          </div>
          <div style={{ marginTop:12 }}><Field label="Pickup Address"><textarea style={textarea()} value={header.pickup_address} onChange={e => patchHeader('pickup_address', e.target.value)}/></Field></div>

          <div style={{ marginTop:18 }}>
            
              <div>
                <label style={lbl}>Order Parcel Count</label>
                <input
                  type="number"
                  min={1}
                  value={orderParcelCount}
                  onChange={(e) => {
                    const next = Math.max(1, Number(e.target.value || 1))
                    setOrderParcelCount(next)
                    setItems((prev: any[]) => {
                      const rows = prev && prev.length ? prev : [{}]
                      return rows.map((item, index) =>
                        index === 0 ? { ...item, parcels: next } : item
                      )
                    })
                  }}
                  style={inp}
                />
              </div>

<SectionTitle title="Delivery Items / Recipients" subtitle="One pickup request may contain many delivery item rows." right={<button style={button()} onClick={() => setItems(r => [...r, { ...EMPTY_ITEM }])}><Plus size={15}/>Add Item</button>} />
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['#','Recipient','Phone','Delivery Address','Township','Parcels','Weight','COD','Priority',''].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
                <tbody>{items.map((r, i) => <tr key={i}>
                  <td style={td()}>{i+1}</td>
                  <td style={td()}><input style={input()} value={r.recipient_name} onChange={e => patchItem(i, 'recipient_name', e.target.value)}/></td>
                  <td style={td()}><input style={input()} value={r.recipient_phone} onChange={e => patchItem(i, 'recipient_phone', e.target.value)}/></td>
                  <td style={td()}><input style={{...input(), minWidth:220}} value={r.delivery_address} onChange={e => patchItem(i, 'delivery_address', e.target.value)}/></td>
                  <td style={td()}><input style={input()} value={r.delivery_township} onChange={e => patchItem(i, 'delivery_township', e.target.value)}/></td>
                  <td style={td()}><input type="number" style={{...input(), width:80}} value={r.parcel_count} onChange={e => patchItem(i, 'parcel_count', e.target.value)}/></td>
                  <td style={td()}><input type="number" style={{...input(), width:90}} value={r.weight_kg} onChange={e => patchItem(i, 'weight_kg', e.target.value)}/></td>
                  <td style={td()}><input type="number" style={{...input(), width:100}} value={r.cod_amount} onChange={e => patchItem(i, 'cod_amount', e.target.value)}/></td>
                  <td style={td()}><select style={input()} value={r.priority} onChange={e => patchItem(i, 'priority', e.target.value)}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></td>
                  <td style={td()}><button style={button()} onClick={() => setItems(rows => rows.filter((_, idx) => idx !== i))}><Trash2 size={14}/></button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:18 }}>
            <button style={button(true)} onClick={() => void saveRequest()} disabled={saving}>{saving ? <Loader2 size={16}/> : <Save size={16}/>}Submit to Supervisor</button>
          </div>
        </section>

        <section style={panel({ padding:18 })}>
          <SectionTitle title="CS Pickup Queue" subtitle="Latest pickup requests from be_portal_pickup_requests." />
          <div style={{ display:'grid', gap:10, maxHeight:700, overflow:'auto' }}>
            {loading ? <div style={{ color:C.text2 }}>Loading…</div> : queue.map(r => <button key={r.id || r.pickup_id} onClick={() => setSelected(r)} style={{ ...panel({ padding:14 }), textAlign:'left', cursor:'pointer', borderColor:selected?.pickup_id === r.pickup_id ? C.gold : C.border }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <strong style={{ color:C.text }}>{text(r.pickup_id)}</strong><span style={badge(r.status)}>{text(r.status)}</span>
              </div>
              <div style={{ marginTop:6, color:C.text2 }}>{text(r.merchant_code)} — {text(r.merchant_name)}</div>
              <div style={{ marginTop:4, color:C.muted, fontSize:12 }}>{text(r.pickup_township)} • {formatDate(r.created_at)}</div>
            </button>)}
          </div>
          {selected ? <div style={{ marginTop:14, ...panel({ padding:14 }) }}>
            <Label>Selected Request</Label>
            <div style={{ color:C.text, fontWeight:800 }}>{text(selected.pickup_id)}</div>
            <div style={{ color:C.text2, marginTop:6 }}>{text(selected.pickup_address)}</div>
            <div style={{ marginTop:10 }}><span style={badge(selected.status)}>{text(selected.status)}</span></div>
          </div> : null}
        </section>
      </section>
    </div>
  </div>
}
