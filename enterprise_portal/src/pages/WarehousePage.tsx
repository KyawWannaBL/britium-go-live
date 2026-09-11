// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, PackageCheck, RefreshCw, ScanLine } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
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


const EVENTS = [
  { key:'WAREHOUSE_RECEIVED', label:'Receive', status:'RECEIVED_WAREHOUSE' },
  { key:'WAREHOUSE_SORTED', label:'Sort', status:'SORTED' },
  { key:'WAREHOUSE_BAGGED', label:'Bag', status:'BAGGED' },
  { key:'READY_FOR_WAYPLAN', label:'Ready for Wayplan', status:'READY_FOR_WAYPLAN' },
]

export default function WarehousePage() {
  const [rows, setRows] = useState<any[]>([])
  const [scan, setScan] = useState('')
  const [location, setLocation] = useState('YGN-WH')
  const [eventType, setEventType] = useState('WAREHOUSE_RECEIVED')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    const res = await (supabase as any)
      .from('be_portal_pickup_requests')
      .select('*')
      .in('status', ['PICKED_UP','RECEIVED_WAREHOUSE','SORTED','BAGGED','READY_FOR_WAYPLAN','EXCEPTION'])
      .order('updated_at', { ascending:false })
      .limit(300)
    setRows(res.data || [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const ch = (supabase as any).channel('be-warehouse')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void load())
      .subscribe()
    return () => { (supabase as any).removeChannel(ch) }
  }, [])

  const runScan = async (pickupId = scan, eventOverride = eventType, locationOverride = location) => {
    if (!pickupId) { setMessage({type:'error', text:'Enter or select a pickup ID.'}); return }
    const selectedEvent = EVENTS.find(e => e.key === eventOverride)
    setMessage(null)
    const rpc = await (supabase as any).rpc('be_warehouse_scan_event', { p_pickup_id: pickupId, p_event_type:eventOverride, p_location:locationOverride })
    if (rpc.error) {
      const upd = await (supabase as any).from('be_portal_pickup_requests').update({
        status:selectedEvent?.status || 'RECEIVED_WAREHOUSE',
        warehouse_location:locationOverride,
        warehouse_ready_at:selectedEvent?.status === 'READY_FOR_WAYPLAN' ? new Date().toISOString() : undefined,
        updated_at:new Date().toISOString(),
      }).eq('pickup_id', pickupId)
      if (upd.error) { setMessage({type:'error', text:upd.error.message}); return }
      await (supabase as any).from('be_portal_pickup_request_items').update({
        item_status:selectedEvent?.status || 'RECEIVED_WAREHOUSE',
        updated_at:new Date().toISOString(),
      }).eq('pickup_id', pickupId)
      await (supabase as any).from('be_portal_cargo_events').insert({
        pickup_id:pickupId,
        event_type:eventOverride,
        description:`Warehouse scan ${eventOverride} at ${locationOverride}.`,
        actor_role:'warehouse',
      })
    }
    setMessage({type:'success', text:`${pickupId} marked as ${selectedEvent?.status}.`})
    setScan('')
    await load()
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(r => {
      const st = statusFilter === 'ALL' || text(r.status,'').toUpperCase() === statusFilter
      const qs = !q || [r.pickup_id, r.merchant_code, r.merchant_name, r.pickup_township, r.status].some(v => text(v,'').toLowerCase().includes(q))
      return st && qs
    })
  }, [rows, search, statusFilter])

  const template = ['pickup_id,event_type,warehouse_location', `PU202606100001,WAREHOUSE_RECEIVED,${location}`].join('\n')

  const uploadScan = async (file:File) => {
    const parsed = parseCsv(await file.text())
    let ok = 0
    for (const r of parsed) {
      if (!r.pickup_id || !r.event_type) continue
      setEventType(r.event_type)
      await runScan(r.pickup_id, r.event_type || eventType, r.warehouse_location || location)
      ok++
    }
    setMessage({type:'success', text:`Processed ${ok} warehouse scan row(s).`})
  }

  const kpis = useMemo(() => ({
    picked: rows.filter(r => text(r.status,'').toUpperCase() === 'PICKED_UP').length,
    received: rows.filter(r => text(r.status,'').toUpperCase() === 'RECEIVED_WAREHOUSE').length,
    bagged: rows.filter(r => text(r.status,'').toUpperCase() === 'BAGGED').length,
    ready: rows.filter(r => text(r.status,'').toUpperCase() === 'READY_FOR_WAYPLAN').length,
  }), [rows])

  return <div style={root()}>
    <div style={{ maxWidth:1600, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>Warehouse</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>Receive / Sort / Bag / Ready for Wayplan</h1>
            <p style={{ margin:0, color:C.text2 }}>Warehouse actions prepare parcels for delivery wayplan generation. Wayplan is generated only after READY_FOR_WAYPLAN.</p>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button style={button()} onClick={() => downloadText('warehouse_scan_template.csv', template)}><Download size={16}/>Template</button>
            <label style={button()}><FileUp size={16}/>Upload Scans<input type="file" accept=".csv" style={{display:'none'}} onChange={e => e.target.files?.[0] && void uploadScan(e.target.files[0])}/></label>
            <button style={button()} onClick={() => void load()}>{loading ? <Loader2 size={16}/> : <RefreshCw size={16}/>}Refresh</button>
          </div>
        </div>
      </section>

      {message ? <section style={panel({ padding:14, borderColor:message.type === 'error' ? C.error : C.success })}>
        <div style={{ color:message.type === 'error' ? C.error : C.success, display:'flex', gap:10 }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}</div>
      </section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14 }}>
        <Kpi label="Picked Up" value={kpis.picked} note="Inbound to warehouse" accent={C.info}/>
        <Kpi label="Received" value={kpis.received} note="Warehouse accepted" accent={C.success}/>
        <Kpi label="Bagged" value={kpis.bagged} note="Ready soon" accent={C.gold}/>
        <Kpi label="Ready Wayplan" value={kpis.ready} note="Can generate wayplan" accent={C.orange}/>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title="Scan Action" subtitle="Scan or enter pickup ID, select warehouse event, then submit." />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 240px 220px auto', gap:12 }}>
          <input style={input()} value={scan} onChange={e => setScan(e.target.value)} placeholder="Pickup ID / Waybill"/>
          <select style={input()} value={eventType} onChange={e => setEventType(e.target.value)}>{EVENTS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
          <input style={input()} value={location} onChange={e => setLocation(e.target.value)} placeholder="Warehouse location"/>
          <button style={button(true)} onClick={() => void runScan()}><ScanLine size={16}/>Submit Scan</button>
        </div>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title="Warehouse Work Queue" subtitle="Rows are loaded from be_portal_pickup_requests." right={<div style={{ display:'flex', gap:10 }}><input style={{...input(), width:260}} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"/><select style={{...input(), width:220}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>ALL</option>{['PICKED_UP','RECEIVED_WAREHOUSE','SORTED','BAGGED','READY_FOR_WAYPLAN','EXCEPTION'].map(s => <option key={s}>{s}</option>)}</select></div>} />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Pickup ID','Merchant','Township','Status','Warehouse','Updated','Quick Action'].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(r => <tr key={r.id || r.pickup_id}>
              <td style={td()}><strong style={{ color:C.text }}>{text(r.pickup_id)}</strong></td>
              <td style={td()}>{text(r.merchant_name)}<br/><span style={{ color:C.muted }}>{text(r.merchant_code)}</span></td>
              <td style={td()}>{text(r.pickup_township)}</td>
              <td style={td()}><span style={badge(r.status)}>{text(r.status)}</span></td>
              <td style={td()}>{text(r.warehouse_location)}</td>
              <td style={td()}>{formatDate(r.updated_at)}</td>
              <td style={td()}><button style={button()} onClick={() => void runScan(r.pickup_id)}><PackageCheck size={15}/>Apply Selected Event</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
}
