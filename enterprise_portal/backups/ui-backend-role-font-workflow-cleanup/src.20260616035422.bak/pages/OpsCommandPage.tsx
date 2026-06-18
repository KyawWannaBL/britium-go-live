// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MapPin, RefreshCw, Route, Send, Truck } from 'lucide-react'
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


export default function OpsCommandPage() {
  const [readyRows, setReadyRows] = useState<any[]>([])
  const [wayplans, setWayplans] = useState<any[]>([])
  const [date, setDate] = useState(todayISO())
  const [branch, setBranch] = useState('YGN')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    const r = await (supabase as any).from('be_portal_pickup_requests').select('*').eq('status', 'READY_FOR_WAYPLAN').order('updated_at', { ascending:true }).limit(300)
    const w = await (supabase as any).from('be_delivery_wayplans').select('*').order('created_at', { ascending:false }).limit(100)
    setReadyRows(r.data || [])
    setWayplans(w.data || [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const ch = (supabase as any).channel('be-ops-command')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'be_delivery_wayplans' }, () => void load())
      .subscribe()
    return () => { (supabase as any).removeChannel(ch) }
  }, [])

  const generateWayplan = async () => {
    setMessage(null)
    const rpc = await (supabase as any).rpc('be_generate_delivery_wayplan', { p_branch_code:branch, p_delivery_date:date })
    if (rpc.error) {
      try {
        const wayplanNo = `WP-${branch}-${date.replace(/-/g,'')}-${String(Date.now()).slice(-5)}`
        const wp = await (supabase as any).from('be_delivery_wayplans').insert({
          wayplan_no:wayplanNo,
          branch_code:branch,
          planned_delivery_date:date,
          status:'DRAFT',
        }).select('wayplan_id,wayplan_no').single()
        if (wp.error) throw wp.error
        const items = readyRows.map((r, i) => ({
          wayplan_id:wp.data.wayplan_id,
          pickup_request_id:r.id,
          pickup_item_id:r.id,
          pickup_id:r.pickup_id,
          delivery_township:r.delivery_township || r.pickup_township,
          proposed_sequence:i + 1,
          include_in_wayplan:true,
        }))
        if (items.length) await (supabase as any).from('be_delivery_wayplan_items').insert(items)
        await (supabase as any).from('be_portal_pickup_requests').update({ status:'WAYPLAN_DRAFTED', delivery_wayplan_id:wp.data.wayplan_id, updated_at:new Date().toISOString() }).in('pickup_id', readyRows.map(r => r.pickup_id))
        await (supabase as any).from('be_portal_cargo_events').insert({ pickup_id:wayplanNo, event_type:'WAYPLAN_DRAFTED', description:`Draft wayplan generated for ${items.length} request(s).`, actor_role:'operation' })
      } catch(e:any) {
        setMessage({type:'error', text:e?.message || 'Unable to generate wayplan. Check wayplan tables.'}); return
      }
    }
    setMessage({type:'success', text:'Draft wayplan generated. Supervisor can now review and adjust.'})
    await load()
  }

  const kpis = useMemo(() => ({
    ready:readyRows.length,
    draft:wayplans.filter(w => text(w.status,'').toUpperCase() === 'DRAFT').length,
    confirmed:wayplans.filter(w => text(w.status,'').toUpperCase() === 'CONFIRMED').length,
    today:wayplans.filter(w => text(w.planned_delivery_date,'') === todayISO()).length,
  }), [readyRows, wayplans])

  const byTownship = useMemo(() => {
    const map:Record<string, number> = {}
    readyRows.forEach(r => { const k = text(r.delivery_township || r.pickup_township, 'Unknown'); map[k] = (map[k] || 0) + 1 })
    return Object.entries(map).sort((a,b) => b[1] - a[1])
  }, [readyRows])

  return <div style={root()}>
    <div style={{ maxWidth:1600, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>Operation Command</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>Wayplan Generation & Route Control</h1>
            <p style={{ margin:0, color:C.text2 }}>Generate draft wayplans only after warehouse-ready status. Supervisor reviews and confirms delivery assignments.</p>
          </div>
          <button style={button()} onClick={() => void load()}>{loading ? <Loader2 size={16}/> : <RefreshCw size={16}/>}Refresh</button>
        </div>
      </section>

      {message ? <section style={panel({ padding:14, borderColor:message.type === 'error' ? C.error : C.success })}>
        <div style={{ color:message.type === 'error' ? C.error : C.success, display:'flex', gap:10 }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}</div>
      </section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14 }}>
        <Kpi label="Ready for Wayplan" value={kpis.ready} note="Warehouse-ready" accent={C.success}/>
        <Kpi label="Draft Wayplans" value={kpis.draft} note="Supervisor review" accent={C.warning}/>
        <Kpi label="Confirmed" value={kpis.confirmed} note="Delivery assigned" accent={C.gold}/>
        <Kpi label="Today Plans" value={kpis.today} note={date} accent={C.info}/>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title="Generate Draft Wayplan" subtitle="Operation generates. Supervisor adjusts and confirms." />
        <div style={{ display:'grid', gridTemplateColumns:'180px 220px auto 1fr', gap:12, alignItems:'end' }}>
          <Field label="Branch"><input style={input()} value={branch} onChange={e => setBranch(e.target.value)}/></Field>
          <Field label="Delivery Date"><input type="date" style={input()} value={date} onChange={e => setDate(e.target.value)}/></Field>
          <button style={button(true)} onClick={() => void generateWayplan()}><Route size={16}/>Generate Draft Wayplan</button>
          <div style={{ color:C.text2, fontSize:13 }}>Available records: {readyRows.length}</div>
        </div>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(380px,.8fr)', gap:18, alignItems:'start' }}>
        <section style={panel({ padding:18 })}>
          <SectionTitle title="Warehouse-Ready Requests" subtitle="These rows are eligible for draft wayplan generation." />
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Pickup ID','Merchant','Township','Status','Updated'].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
              <tbody>{readyRows.map(r => <tr key={r.id || r.pickup_id}>
                <td style={td()}><strong style={{ color:C.text }}>{text(r.pickup_id)}</strong></td>
                <td style={td()}>{text(r.merchant_name)}<br/><span style={{ color:C.muted }}>{text(r.merchant_code)}</span></td>
                <td style={td()}>{text(r.delivery_township || r.pickup_township)}</td>
                <td style={td()}><span style={badge(r.status)}>{text(r.status)}</span></td>
                <td style={td()}>{formatDate(r.updated_at)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section style={panel({ padding:18 })}>
          <SectionTitle title="Township Grouping" subtitle="Draft grouping basis for delivery plan." />
          <div style={{ display:'grid', gap:10 }}>
            {byTownship.map(([name, count]) => <div key={name} style={panel({ padding:12 })}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><span style={{ display:'inline-flex', alignItems:'center', gap:8 }}><MapPin size={15} color={C.gold}/>{name}</span><strong style={{ color:C.gold }}>{count}</strong></div>
            </div>)}
            {!byTownship.length ? <div style={{ color:C.text2 }}>No warehouse-ready rows yet.</div> : null}
          </div>
        </section>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title="Wayplan Register" subtitle="Supervisor should review DRAFT wayplans." />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Wayplan No','Branch','Date','Status','Reviewed','Confirmed','Created'].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>{wayplans.map(w => <tr key={w.wayplan_id || w.wayplan_no}>
              <td style={td()}><strong style={{ color:C.text }}>{text(w.wayplan_no)}</strong></td>
              <td style={td()}>{text(w.branch_code)}</td>
              <td style={td()}>{text(w.planned_delivery_date)}</td>
              <td style={td()}><span style={badge(w.status)}>{text(w.status)}</span></td>
              <td style={td()}>{formatDate(w.reviewed_at)}</td>
              <td style={td()}>{formatDate(w.confirmed_at)}</td>
              <td style={td()}>{formatDate(w.created_at)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
}
