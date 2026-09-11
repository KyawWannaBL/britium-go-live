// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Clock3, Headset, Loader2, Radio, RefreshCw, ShieldAlert, Truck, Users } from 'lucide-react'
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


export default function CustomerServiceCommandCenterPage() {
  const [rows, setRows] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const rpc = await (supabase as any).rpc('be_cs_dashboard_snapshot', { p_branch_code:'YGN' })
      if (!rpc.error && rpc.data?.requests) {
        setRows(rpc.data.requests || [])
        setEvents(rpc.data.events || [])
      } else {
        const req = await (supabase as any).from('be_portal_pickup_requests').select('*').order('created_at', { ascending:false }).limit(250)
        if (req.error) throw req.error
        setRows(req.data || [])
        const ev = await (supabase as any).from('be_portal_cargo_events').select('*').order('created_at', { ascending:false }).limit(40)
        setEvents(ev.data || [])
      }
      setLastSync(new Date().toISOString())
    } catch (e:any) {
      setError(e?.message || 'Unable to load CS dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const channel = (supabase as any)
      .channel('be-cs-command-center')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void load())
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'be_portal_cargo_events' }, () => void load())
      .subscribe()
    return () => { (supabase as any).removeChannel(channel) }
  }, [])

  const kpis = useMemo(() => {
    const today = new Date().toDateString()
    const sameDay = (v:any) => v && new Date(v).toDateString() === today
    const st = (r:any) => text(r.status, '').toUpperCase()
    return {
      submittedToday: rows.filter(r => sameDay(r.created_at)).length,
      pendingSupervisor: rows.filter(r => st(r) === 'SUBMITTED').length,
      assignedPickup: rows.filter(r => st(r) === 'PENDING_PICKUP').length,
      pickedUp: rows.filter(r => ['PICKED_UP','RECEIVED_WAREHOUSE','SORTED','BAGGED','READY_FOR_WAYPLAN'].includes(st(r))).length,
      urgent: rows.filter(r => ['HIGH','URGENT'].includes(text(r.priority,'').toUpperCase())).length,
      exceptions: rows.filter(r => ['FAILED_ATTEMPT','EXCEPTION','RETURNED','ON_HOLD'].includes(st(r))).length,
    }
  }, [rows])

  const liveQueue = rows.filter(r => ['SUBMITTED','PENDING_PICKUP','FAILED_ATTEMPT','EXCEPTION','ON_HOLD'].includes(text(r.status,'').toUpperCase())).slice(0, 80)

  return <div style={root()}>
    <div style={{ maxWidth:1680, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}><Headset size={17}/>CS Command Center</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>Pickup Request Control Tower</h1>
            <p style={{ margin:0, color:C.text2 }}>Live CS view for submitted orders, supervisor assignment, urgent requests, and exception follow-up.</p>
          </div>
          <button style={button()} onClick={() => void load()}>{loading ? <Loader2 size={16}/> : <RefreshCw size={16}/>}Refresh</button>
        </div>
        <div style={{ marginTop:12, display:'flex', gap:10, alignItems:'center', color:C.text2, fontSize:13 }}><Radio size={14} color={C.success}/>Realtime active <span style={{ color:C.muted }}>•</span> Last sync {lastSync ? formatDate(lastSync) : '—'}</div>
      </section>

      {error ? <section style={panel({ padding:14, borderColor:C.error })}><div style={{ display:'flex', gap:10, color:C.error }}><AlertCircle size={18}/>{error}</div></section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(6,minmax(0,1fr))', gap:14 }}>
        <Kpi label="Submitted Today" value={kpis.submittedToday} note="CS-created pickups" accent={C.gold}/>
        <Kpi label="Pending Supervisor" value={kpis.pendingSupervisor} note="Needs pickup rider" accent={C.warning}/>
        <Kpi label="Assigned Pickup" value={kpis.assignedPickup} note="Rider assigned" accent={C.info}/>
        <Kpi label="Picked Up+" value={kpis.pickedUp} note="In operation flow" accent={C.success}/>
        <Kpi label="Urgent" value={kpis.urgent} note="High priority" accent={C.orange}/>
        <Kpi label="Exceptions" value={kpis.exceptions} note="Needs follow-up" accent={C.error}/>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.25fr) minmax(420px,.75fr)', gap:18, alignItems:'start' }}>
        <section style={panel({ padding:18 })}>
          <SectionTitle title="Live Pickup Queue" subtitle="This replaces the old generic ticket/case queue with logistics pickup requests." />
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Pickup ID','Merchant','Township','Priority','Status','Assigned Rider','Created'].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} style={td()}>Loading…</td></tr> : liveQueue.map(r => <tr key={r.id || r.pickup_id}>
                  <td style={td()}><strong style={{ color:C.text }}>{text(r.pickup_id)}</strong></td>
                  <td style={td()}>{text(r.merchant_code)}<br/><span style={{ color:C.muted }}>{text(r.merchant_name)}</span></td>
                  <td style={td()}>{text(r.pickup_township)}</td>
                  <td style={td()}><span style={badge(r.priority)}>{text(r.priority,'NORMAL')}</span></td>
                  <td style={td()}><span style={badge(r.status)}>{text(r.status)}</span></td>
                  <td style={td()}>{text(r.assigned_rider_name || r.assigned_rider_id)}</td>
                  <td style={td()}>{formatDate(r.created_at)}</td>
                </tr>)}
                {!loading && !liveQueue.length ? <tr><td colSpan={7} style={td()}>No active pickup requests found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section style={panel({ padding:18 })}>
          <SectionTitle title="Activity Feed" subtitle="Events from be_portal_cargo_events." />
          <div style={{ display:'grid', gap:10, maxHeight:650, overflow:'auto' }}>
            {events.map(e => <div key={e.id || `${e.pickup_id}-${e.created_at}`} style={panel({ padding:12 })}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                <strong style={{ color:C.text }}>{text(e.event_type)}</strong>
                <span style={{ color:C.muted, fontSize:12 }}>{formatDate(e.created_at)}</span>
              </div>
              <div style={{ marginTop:6, color:C.text2, fontSize:13 }}>{text(e.pickup_id)} — {text(e.description)}</div>
            </div>)}
            {!events.length ? <div style={{ color:C.text2 }}>No recent activity yet.</div> : null}
          </div>
        </section>
      </section>
    </div>
  </div>
}
