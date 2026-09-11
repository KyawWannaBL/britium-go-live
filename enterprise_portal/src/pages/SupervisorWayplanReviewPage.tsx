// @ts-nocheck

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save, Send, Sparkles } from 'lucide-react'
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


export default function SupervisorWayplanReviewPage() {
  const [wayplans, setWayplans] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [selectedWayplan, setSelectedWayplan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    const w = await (supabase as any).from('be_delivery_wayplans').select('*').order('created_at', { ascending:false }).limit(100)
    const wp = w.data || []
    setWayplans(wp)
    setSelectedWayplan((cur:any) => cur && wp.some(x => x.wayplan_id === cur.wayplan_id) ? cur : wp[0] || null)

    const wf = await (supabase as any).from('be_mobile_workforce_accounts').select('*').eq('is_active', true).limit(300)
    setWorkers((wf.data || []).map(normalizeWorker).filter(w => ['rider','driver','helper'].includes(text(w.worker_type || w.raw?.role,'').toLowerCase())))
    setLoading(false)
  }

  const loadItems = async (wayplan:any) => {
    if (!wayplan?.wayplan_id) { setItems([]); return }
    const res = await (supabase as any).from('be_delivery_wayplan_items').select('*').eq('wayplan_id', wayplan.wayplan_id).order('proposed_sequence', { ascending:true })
    const rows = (res.data || []).map((r:any, i:number) => ({ ...r, final_sequence: r.final_sequence || r.proposed_sequence || i + 1, include_in_wayplan: r.include_in_wayplan !== false }))
    setItems(rows)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { void loadItems(selectedWayplan) }, [selectedWayplan?.wayplan_id])
  useEffect(() => {
    const ch = (supabase as any).channel('be-supervisor-wayplan-review')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_delivery_wayplans' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'be_delivery_wayplan_items' }, () => selectedWayplan && void loadItems(selectedWayplan))
      .subscribe()
    return () => { (supabase as any).removeChannel(ch) }
  }, [selectedWayplan?.wayplan_id])

  const patchItem = (idx:number, key:string, value:any) => setItems(rows => rows.map((r, i) => i === idx ? { ...r, [key]: value } : r))

  const saveDraft = async () => {
    if (!selectedWayplan) return
    setSaving(true); setMessage(null)
    const payload = items.map(r => ({
      id:r.id,
      pickup_item_id:r.pickup_item_id,
      final_sequence:num(r.final_sequence, r.proposed_sequence),
      final_worker_code:r.final_worker_code,
      final_worker_name:r.final_worker_name || workers.find(w => w.worker_code === r.final_worker_code)?.display_name,
      include_in_wayplan:r.include_in_wayplan !== false,
      supervisor_note:r.supervisor_note || '',
    }))
    const rpc = await (supabase as any).rpc('be_supervisor_update_wayplan', { p_wayplan_id:selectedWayplan.wayplan_id, p_items:payload })
    if (rpc.error) {
      for (const row of payload) {
        await (supabase as any).from('be_delivery_wayplan_items').update({
          final_sequence:row.final_sequence,
          final_worker_code:row.final_worker_code,
          final_worker_name:row.final_worker_name,
          include_in_wayplan:row.include_in_wayplan,
          supervisor_note:row.supervisor_note,
          updated_at:new Date().toISOString(),
        }).eq('id', row.id)
      }
      await (supabase as any).from('be_delivery_wayplans').update({ status:'DRAFT', reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('wayplan_id', selectedWayplan.wayplan_id)
    }
    setMessage({type:'success', text:'Wayplan draft saved.'})
    await loadItems(selectedWayplan)
    setSaving(false)
  }

  const confirm = async () => {
    if (!selectedWayplan) return
    setSaving(true); setMessage(null)
    const rpc = await (supabase as any).rpc('be_confirm_delivery_wayplan', { p_wayplan_id:selectedWayplan.wayplan_id })
    if (rpc.error) {
      const wp = await (supabase as any).from('be_delivery_wayplans').update({
        status:'CONFIRMED',
        confirmed_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }).eq('wayplan_id', selectedWayplan.wayplan_id)
      if (wp.error) { setMessage({type:'error', text:wp.error.message}); setSaving(false); return }
      const included = items.filter(r => r.include_in_wayplan !== false)
      for (const r of included) {
        await (supabase as any).from('be_portal_pickup_request_items').update({
          item_status:'DELIVERY_ASSIGNED',
          assigned_delivery_worker_code:r.final_worker_code,
          assigned_delivery_worker_name:r.final_worker_name,
          wayplan_id:selectedWayplan.wayplan_id,
          updated_at:new Date().toISOString(),
        }).eq('item_id', r.pickup_item_id)
        await (supabase as any).from('be_portal_pickup_requests').update({
          status:'DELIVERY_ASSIGNED',
          delivery_wayplan_id:selectedWayplan.wayplan_id,
          updated_at:new Date().toISOString(),
        }).eq('pickup_id', r.pickup_id)
      }
      await (supabase as any).from('be_portal_cargo_events').insert({
        pickup_id:selectedWayplan.wayplan_no,
        event_type:'WAYPLAN_CONFIRMED',
        description:`Supervisor confirmed wayplan with ${included.length} included row(s).`,
        actor_role:'supervisor',
      })
    }
    setMessage({type:'success', text:'Wayplan confirmed and delivery assignments created.'})
    await load()
    setSaving(false)
  }

  const kpis = useMemo(() => ({
    draft:wayplans.filter(w => text(w.status,'').toUpperCase() === 'DRAFT').length,
    confirmed:wayplans.filter(w => text(w.status,'').toUpperCase() === 'CONFIRMED').length,
    totalItems:items.length,
    included:items.filter(i => i.include_in_wayplan !== false).length,
  }), [wayplans, items])

  return <div style={root()}>
    <div style={{ maxWidth:1680, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>Supervisor</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>Wayplan Review & Delivery Assignment</h1>
            <p style={{ margin:0, color:C.text2 }}>Review generated wayplans, adjust route sequence, include/exclude shipments, and assign delivery rider/driver before confirmation.</p>
          </div>
          <button style={button()} onClick={() => void load()}>{loading ? <Loader2 size={16}/> : <RefreshCw size={16}/>}Refresh</button>
        </div>
      </section>

      {message ? <section style={panel({ padding:14, borderColor:message.type === 'error' ? C.error : C.success })}>
        <div style={{ color:message.type === 'error' ? C.error : C.success, display:'flex', gap:10 }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}</div>
      </section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14 }}>
        <Kpi label="Draft Wayplans" value={kpis.draft} note="Needs supervisor review" accent={C.warning}/>
        <Kpi label="Confirmed" value={kpis.confirmed} note="Delivery assigned" accent={C.success}/>
        <Kpi label="Rows in Plan" value={kpis.totalItems} note="Selected wayplan" accent={C.gold}/>
        <Kpi label="Included" value={kpis.included} note="Will be assigned" accent={C.info}/>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'380px minmax(0,1fr)', gap:18, alignItems:'start' }}>
        <section style={panel({ padding:18 })}>
          <SectionTitle title="Wayplans" subtitle="Select a draft or confirmed plan." />
          <div style={{ display:'grid', gap:10, maxHeight:720, overflow:'auto' }}>
            {wayplans.map(w => <button key={w.wayplan_id} onClick={() => setSelectedWayplan(w)} style={{ ...panel({ padding:12 }), cursor:'pointer', textAlign:'left', borderColor:selectedWayplan?.wayplan_id === w.wayplan_id ? C.gold : C.border }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><strong style={{ color:C.text }}>{text(w.wayplan_no)}</strong><span style={badge(w.status)}>{text(w.status)}</span></div>
              <div style={{ color:C.text2, marginTop:5 }}>{text(w.branch_code)} • {text(w.planned_delivery_date)}</div>
              <div style={{ color:C.muted, fontSize:12, marginTop:5 }}>Created {formatDate(w.created_at)}</div>
            </button>)}
            {!wayplans.length ? <div style={{ color:C.text2 }}>No wayplans generated yet.</div> : null}
          </div>
        </section>

        <section style={panel({ padding:18 })}>
          <SectionTitle title={selectedWayplan ? `Review ${selectedWayplan.wayplan_no}` : 'Review Items'} subtitle="Supervisor can change worker, sequence, grouping decision, and notes." right={<div style={{ display:'flex', gap:10 }}><button style={button()} onClick={() => void saveDraft()} disabled={saving || !selectedWayplan}><Save size={15}/>Save Draft</button><button style={button(true)} onClick={() => void confirm()} disabled={saving || !selectedWayplan}><Send size={15}/>Confirm Wayplan</button></div>} />
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Include','Seq','Pickup ID','Township','Worker','Note'].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
              <tbody>{items.map((r, i) => <tr key={r.id}>
                <td style={td()}><input type="checkbox" checked={r.include_in_wayplan !== false} onChange={e => patchItem(i, 'include_in_wayplan', e.target.checked)}/></td>
                <td style={td()}><input type="number" style={{...input(), width:76}} value={r.final_sequence} onChange={e => patchItem(i, 'final_sequence', e.target.value)}/></td>
                <td style={td()}><strong style={{ color:C.text }}>{text(r.pickup_id)}</strong></td>
                <td style={td()}>{text(r.delivery_township)}<br/><span style={{ color:C.muted }}>{text(r.delivery_zone)}</span></td>
                <td style={td()}><select style={{...input(), minWidth:230}} value={r.final_worker_code || r.proposed_worker_code || ''} onChange={e => {
                  const w = workers.find(x => x.worker_code === e.target.value)
                  patchItem(i, 'final_worker_code', e.target.value)
                  patchItem(i, 'final_worker_name', w?.display_name || '')
                }}>
                  <option value="">Select worker</option>{workers.map(w => <option key={w.worker_code} value={w.worker_code}>{w.worker_code} — {w.display_name}</option>)}
                </select>
                {r.proposed_worker_code ? <div style={{ marginTop:5, color:C.gold, fontSize:12, display:'flex', alignItems:'center', gap:5 }}><Sparkles size={12}/>Suggested {r.proposed_worker_code}</div> : null}</td>
                <td style={td()}><input style={{...input(), minWidth:220}} value={r.supervisor_note || ''} onChange={e => patchItem(i, 'supervisor_note', e.target.value)} placeholder="Supervisor note"/></td>
              </tr>)}
              {!items.length ? <tr><td colSpan={6} style={td()}>No items in selected wayplan.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  </div>
}
