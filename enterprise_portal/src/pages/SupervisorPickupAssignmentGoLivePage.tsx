import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react'

// --- GO-LIVE IMPORTS (Commented out for sandbox preview compilation) ---
// import { supabase } from '@/integrations/supabase/client'
// -----------------------------------------------------------------------

// --- PREVIEW ENVIRONMENT STUBS ---
// Safely stubs the external Supabase client to prevent compilation errors in this sandbox
const mockChain = () => {
  const chain: any = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    insert: () => chain,
    then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
    catch: (rej: any) => Promise.resolve({ data: [], error: null }).catch(rej)
  }
  return chain
}

const supabase: any = {
  rpc: async () => {
    await new Promise(resolve => setTimeout(resolve, 600))
    return { data: [], error: null }
  },
  from: mockChain,
  channel: () => {
    const ch = {
      on: () => ch,
      subscribe: (cb?: Function) => {
        if (cb) cb('SUBSCRIBED')
        return ch
      }
    }
    return ch
  },
  removeChannel: () => {}
}
// ---------------------------------

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type Language = 'EN' | 'MM'

function text(v:any, fallback='—') { return v === null || v === undefined || v === '' ? fallback : String(v) }
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
    ACTIVE: [C.success, '#052e16'],
  }
  const v = map[s] || [C.text2, C.panel2]
  return { display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', background:v[1], color:v[0], border:`1px solid ${C.border}`, whiteSpace:'nowrap' }
}
function root(): React.CSSProperties { return { minHeight:'100%', background:C.bg, color:C.text, padding:24, fontFamily:FF.body } }
function panel(extra:React.CSSProperties = {}): React.CSSProperties { return { background:`linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}`, borderRadius:20, boxShadow:'0 18px 40px rgba(0,0,0,.20)', ...extra } }
function input(): React.CSSProperties { return { width:'100%', height:42, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:'0 12px', outline:'none', fontFamily:FF.body } }
function button(primary=false): React.CSSProperties { return { height:42, borderRadius:12, border:`1px solid ${primary ? C.gold : C.border}`, background:primary ? 'rgba(246,184,75,.15)' : C.panel2, color:primary ? C.gold : C.text2, padding:'0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontWeight:700, fontFamily:FF.body, transition: 'all 0.2s ease' } }
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

function scoreWorker(worker:any, request:any, all:any[]) {
  let score = 0
  const zone = text(worker.zone,'').toLowerCase()
  const pickupTownship = text(request.pickup_township,'').toLowerCase()
  if (zone && pickupTownship && zone === pickupTownship) score += 40
  if (text(worker.branch_code,'YGN') === text(request.branch_code,'YGN')) score += 20
  if (text(worker.status,'').toLowerCase() === 'active') score += 20
  const open = all.filter(r => text(r.assigned_rider_id || r.assigned_rider_code,'') === worker.worker_code && ['PENDING_PICKUP','SUBMITTED'].includes(text(r.status,'').toUpperCase())).length
  score -= open * 5
  return score
}

const TRANSLATIONS = {
  EN: {
    title: 'Pickup Rider Assignment',
    subtitle: 'Manual assignment with AI-suggested riders after CS submission.',
    refresh: 'Refresh',
    kpiSubmitted: 'Needs Assignment',
    kpiAssigned: 'Assigned Pickup',
    kpiRiders: 'Active Workforce',
    kpiUrgent: 'Urgent Requests',
    qTitle: 'Supervisor Assignment Queue',
    qSub: 'Only SUBMITTED and PENDING_PICKUP requests are shown.',
    searchPh: 'Search queue',
    colPickId: 'Pickup ID',
    colMerch: 'Merchant',
    colTown: 'Township',
    colPri: 'Priority',
    colStat: 'Status',
    colRider: 'Rider',
    colDate: 'Created',
    manTitle: 'Manual Assignment',
    manSub: 'Suggested riders are ranked by zone and workload.',
    selReq: 'Selected Request',
    sugRiders: 'Suggested Pickup Riders',
    selRider: 'Selected Rider',
    selOpt: 'Select rider',
    btnConfirm: 'Confirm Pickup Assignment',
    btnAi: '✨ AI Matchmaker',
    aiTitle: '✨ AI Rider Suggestion',
    aiLoading: 'Analyzing best rider match for this pickup...',
  },
  MM: {
    title: 'ပစ္စည်းလာယူမည့်သူ တာဝန်ချထားခြင်း',
    subtitle: 'CS မှတင်သွင်းပြီးနောက် AI အကြံပြုချက်ဖြင့် ပို့ဆောင်ရေးသမားကို တာဝန်ချထားခြင်း။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    kpiSubmitted: 'တာဝန်ချထားရန် လိုအပ်',
    kpiAssigned: 'တာဝန်ချထားပြီး',
    kpiRiders: 'လက်ရှိ ဝန်ထမ်းအင်အား',
    kpiUrgent: 'အရေးပေါ် တောင်းဆိုမှုများ',
    qTitle: 'ကြီးကြပ်သူ တာဝန်ချထားရေး စာရင်း',
    qSub: 'တင်သွင်းပြီး နှင့် စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများကိုသာ ပြသထားပါသည်။',
    searchPh: 'ရှာဖွေရန်',
    colPickId: 'လာယူမည့် ID',
    colMerch: 'ကုန်သည်',
    colTown: 'မြို့နယ်',
    colPri: 'ဦးစားပေးအဆင့်',
    colStat: 'အခြေအနေ',
    colRider: 'ပို့ဆောင်ရေးသမား',
    colDate: 'ဖန်တီးခဲ့သည့်အချိန်',
    manTitle: 'ကိုယ်တိုင် တာဝန်ချထားခြင်း',
    manSub: 'အကြံပြုထားသော ဝန်ထမ်းများကို ဇုန်နှင့် လုပ်ငန်းခွင်အရ စီစဉ်ထားပါသည်။',
    selReq: 'ရွေးချယ်ထားသော တောင်းဆိုမှု',
    sugRiders: 'အကြံပြုထားသော ပို့ဆောင်ရေးသမားများ',
    selRider: 'ရွေးချယ်ထားသော ဝန်ထမ်း',
    selOpt: 'ဝန်ထမ်း ရွေးချယ်ပါ',
    btnConfirm: 'တာဝန်ချထားမှုကို အတည်ပြုမည်',
    btnAi: '✨ AI အကြံပြုချက်',
    aiTitle: '✨ AI ဝန်ထမ်း အကြံပြုချက်',
    aiLoading: 'ဤတောင်းဆိုမှုအတွက် အသင့်တော်ဆုံး ဝန်ထမ်းကို ရှာဖွေနေပါသည်...',
  }
}

export default function SupervisorPickupAssignmentGoLivePage() {
  const [lang, setLang] = useState<Language>('EN')
  const [queue, setQueue] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [selectedWorker, setSelectedWorker] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<any>(null)
  const [aiBriefing, setAiBriefing] = useState<string | null>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)

  const t = TRANSLATIONS[lang]

  const load = async () => {
    setLoading(true)
    const qrpc = await supabase.rpc('be_supervisor_pickup_assignment_queue', { p_branch_code:'YGN' })
    let q:any[] = []
    if (!qrpc.error && Array.isArray(qrpc.data)) q = qrpc.data
    else {
      const res = await supabase.from('be_portal_pickup_requests').select('*').in('status', ['SUBMITTED','PENDING_PICKUP']).order('created_at', { ascending:true }).limit(250)
      q = res.data || []
    }
    setQueue(q)
    setSelected((cur:any) => cur && q.some(r => (r.id || r.pickup_id) === (cur.id || cur.pickup_id)) ? cur : q[0] || null)

    const w = await supabase.from('be_mobile_workforce_accounts').select('*').eq('is_active', true).order('display_name', { ascending:true })
    const normalized = (w.data || []).map(normalizeWorker).filter(x => ['rider','pickup','driver'].includes(text(x.worker_type || x.raw?.role,'').toLowerCase()) || text(x.raw?.role,'').toLowerCase() === 'rider')
    setWorkers(normalized.length ? normalized : (w.data || []).map(normalizeWorker))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const channel = supabase.channel('be-supervisor-pickup-assignment')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return queue.filter(r => !q || [r.pickup_id, r.merchant_code, r.merchant_name, r.pickup_township, r.status].some(v => text(v,'').toLowerCase().includes(q)))
  }, [queue, search])

  const suggestions = useMemo(() => {
    if (!selected) return []
    return workers
      .map(w => ({ ...w, score: scoreWorker(w, selected, queue) }))
      .sort((a,b) => b.score - a.score)
      .slice(0, 8)
  }, [workers, selected, queue])

  useEffect(() => {
    setSelectedWorker(suggestions[0]?.worker_code || '')
  }, [selected?.pickup_id, suggestions[0]?.worker_code])

  const assign = async () => {
    if (!selected || !selectedWorker) { setMessage({type:'error', text:'Select a pickup request and rider.'}); return }
    const worker = workers.find(w => w.worker_code === selectedWorker)
    setSaving(true); setMessage(null)
    try {
      const rpc = await supabase.rpc('be_assign_pickup_rider', { p_pickup_id:selected.pickup_id, p_worker_code:selectedWorker })
      if (rpc.error) {
        const res = await supabase.from('be_portal_pickup_requests').update({
          assigned_rider_id:selectedWorker,
          assigned_rider_name: worker?.display_name || selectedWorker,
          status:'PENDING_PICKUP',
          supervisor_assigned_at:new Date().toISOString(),
          updated_at:new Date().toISOString(),
        }).eq('pickup_id', selected.pickup_id)
        if (res.error) throw res.error
        await supabase.from('be_portal_cargo_events').insert({
          pickup_id:selected.pickup_id,
          event_type:'SUPERVISOR_ASSIGNED_PICKUP_RIDER',
          description:`Supervisor assigned pickup rider ${worker?.display_name || selectedWorker}.`,
          actor_role:'supervisor',
        })
      }
      setMessage({type:'success', text:'Pickup rider assigned successfully.'})
      setAiBriefing(null)
      await load()
    } catch(e:any) {
      setMessage({type:'error', text:e?.message || 'Assignment failed.'})
    } finally {
      setSaving(false)
    }
  }

  const generateAiSuggestion = async () => {
    if (!selected) return
    setIsAiLoading(true)
    setAiBriefing(null)
    try {
      const apiKey = "" // Runtime injected API key
      const prompt = `You are an AI Dispatch Assistant for Britium Express.
      We need to assign a pickup rider for Request ID: ${selected.pickup_id}.
      Location: ${selected.pickup_township}, ${selected.pickup_city}.
      Merchant: ${selected.merchant_name}.
      
      Here are the top available riders:
      ${JSON.stringify(suggestions.slice(0, 5).map(w => ({ name: w.display_name, code: w.worker_code, zone: w.zone, score: w.score })))}
      
      Analyze the location and rider zones, and recommend the best rider for this task. Provide a brief, professional justification in ${lang === 'MM' ? 'Myanmar' : 'English'}.`

      const fetchWithRetry = async (url: string, options: any, maxRetries = 5) => {
        let delay = 1000
        for (let i = 0; i < maxRetries; i++) {
          try {
            const res = await fetch(url, options)
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
            return res
          } catch (error) {
            if (i === maxRetries - 1) throw error
            await new Promise(r => setTimeout(r, delay))
            delay *= 2
          }
        }
      }

      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: "You are a highly capable logistics dispatch AI." }] }
        })
      })

      const data = await (response as Response).json()
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (generatedText) setAiBriefing(generatedText)
      else throw new Error('No content returned')
    } catch (e) {
      console.error(e)
      setAiBriefing(lang === 'EN' ? "Failed to generate AI suggestion." : "AI အကြံပြုချက်ကို ယခုအချိန်တွင် မထုတ်ယူနိုင်ပါ။")
    } finally {
      setIsAiLoading(false)
    }
  }

  const kpis = useMemo(() => ({
    submitted: queue.filter(r => text(r.status,'').toUpperCase() === 'SUBMITTED').length,
    assigned: queue.filter(r => text(r.status,'').toUpperCase() === 'PENDING_PICKUP').length,
    riders: workers.length,
    urgent: queue.filter(r => ['HIGH','URGENT'].includes(text(r.priority,'').toUpperCase())).length
  }), [queue, workers])

  return <div style={root()}>
    <div style={{ maxWidth:1680, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>Supervisor</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>{t.title}</h1>
            <p style={{ margin:0, color:C.text2 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border }}>
              <button onClick={() => setLang('EN')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'EN' ? C.panelHover : 'transparent', color: lang === 'EN' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}>EN</button>
              <button onClick={() => setLang('MM')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'MM' ? C.panelHover : 'transparent', color: lang === 'MM' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}>မြန်မာ</button>
            </div>
            <button style={button()} onClick={() => void load()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16}/>}{t.refresh}</button>
          </div>
        </div>
      </section>

      {message ? <section style={panel({ padding:14, borderColor:message.type === 'error' ? C.error : C.success })}>
        <div style={{ color:message.type === 'error' ? C.error : C.success, display:'flex', gap:10 }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}</div>
      </section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14 }}>
        <Kpi label={t.kpiSubmitted} value={kpis.submitted} note="SUBMITTED" accent={C.warning}/>
        <Kpi label={t.kpiAssigned} value={kpis.assigned} note="PENDING_PICKUP" accent={C.info}/>
        <Kpi label={t.kpiRiders} value={kpis.riders} note="Available choices" accent={C.success}/>
        <Kpi label={t.kpiUrgent} value={kpis.urgent} note="Priority high/urgent" accent={C.error}/>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(460px,.8fr)', gap:18, alignItems:'start' }}>
        <section style={panel({ padding:18 })}>
          <SectionTitle title={t.qTitle} subtitle={t.qSub} right={<div style={{ position:'relative', width:320 }}><Search size={16} color={C.muted} style={{ position:'absolute', left:13, top:13 }}/><input style={{...input(), paddingLeft:38}} value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPh}/></div>} />
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{[t.colPickId, t.colMerch, t.colTown, t.colPri, t.colStat, t.colRider, t.colDate].map(h => <th key={h} style={th()}>{h}</th>)}</tr></thead>
              <tbody>{filtered.map(r => <tr key={r.id || r.pickup_id} onClick={() => { setSelected(r); setAiBriefing(null) }} style={{ cursor:'pointer', background:(selected?.pickup_id === r.pickup_id) ? 'rgba(246,184,75,.08)' : 'transparent' }}>
                <td style={td()}><strong style={{ color:C.text }}>{text(r.pickup_id)}</strong></td>
                <td style={td()}>{text(r.merchant_code)}<br/><span style={{ color:C.muted }}>{text(r.merchant_name)}</span></td>
                <td style={td()}>{text(r.pickup_township)}</td>
                <td style={td()}><span style={badge(r.priority)}>{text(r.priority,'NORMAL')}</span></td>
                <td style={td()}><span style={badge(r.status)}>{text(r.status)}</span></td>
                <td style={td()}>{text(r.assigned_rider_name || r.assigned_rider_id)}</td>
                <td style={td()}>{formatDate(r.created_at)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section style={panel({ padding:18 })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <SectionTitle title={t.manTitle} subtitle={t.manSub} />
             {selected && (
               <button style={{ ...button(), background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032', border: 'none', padding: '6px 12px', height: 36 }} onClick={generateAiSuggestion} disabled={isAiLoading}>
                 {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14}/>} {t.btnAi}
               </button>
             )}
          </div>

          {!selected ? <div style={{ color:C.text2 }}>Select a request.</div> : <div style={{ display:'grid', gap:14 }}>
            <div style={panel({ padding:14 })}>
              <Label>{t.selReq}</Label>
              <div style={{ fontSize:20, fontWeight:800, color:C.text }}>{text(selected.pickup_id)}</div>
              <div style={{ color:C.text2, marginTop:6 }}>{text(selected.merchant_name)} • {text(selected.pickup_township)}</div>
              <div style={{ marginTop:8 }}><span style={badge(selected.status)}>{text(selected.status)}</span></div>
            </div>

            {(aiBriefing || isAiLoading) && (
              <div style={panel({ padding: 16, background: 'linear-gradient(135deg, #0f2a42, #0b2236)', border: `1px solid ${C.info}` })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.info, fontWeight: 800, fontSize: 13 }}>
                    <Sparkles size={14} /> {t.aiTitle}
                  </div>
                  <button onClick={() => setAiBriefing(null)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}><X size={16} /></button>
                </div>
                {isAiLoading ? (
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text2, fontSize: 13 }}><Loader2 size={14} className="animate-spin" /> {t.aiLoading}</div>
                ) : (
                   <div style={{ color: C.text2, lineHeight: 1.5, fontSize: 13, whiteSpace: 'pre-wrap' }}>{aiBriefing}</div>
                )}
              </div>
            )}

            <div style={{ display:'grid', gap:10 }}>
              <Label>{t.sugRiders}</Label>
              {suggestions.map(w => <button key={w.worker_code} style={{ ...panel({ padding:12 }), cursor:'pointer', textAlign:'left', borderColor:selectedWorker === w.worker_code ? C.gold : C.border }} onClick={() => setSelectedWorker(w.worker_code)}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                  <strong style={{ color:C.text }}>{w.display_name}</strong>
                  <span style={{ color:C.gold, display:'inline-flex', alignItems:'center', gap:6 }}><Sparkles size={14}/>{w.score}</span>
                </div>
                <div style={{ color:C.text2, marginTop:4 }}>{w.worker_code} • {w.phone} • Zone {text(w.zone)}</div>
              </button>)}
            </div>

            <Field label={t.selRider}><select style={input()} value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
              <option value="">{t.selOpt}</option>{workers.map(w => <option key={w.worker_code} value={w.worker_code}>{w.worker_code} — {w.display_name}</option>)}
            </select></Field>
            <button style={{ ...button(true), width: '100%' }} onClick={() => void assign()} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16}/>}{t.btnConfirm}</button>
          </div>}
        </section>
      </section>
    </div>
  </div>
}