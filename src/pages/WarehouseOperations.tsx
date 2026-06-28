import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, Loader2, PackageCheck, RefreshCw, ScanLine, Sparkles, X, FileUp } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

type Language = 'EN' | 'MM'
type WarehouseEventKey = 'WAREHOUSE_RECEIVED' | 'WAREHOUSE_SORTED' | 'WAREHOUSE_BAGGED' | 'READY_FOR_WAYPLAN'
type WarehouseStatus = 'PICKED_UP' | 'RECEIVED_WAREHOUSE' | 'SORTED' | 'BAGGED' | 'READY_FOR_WAYPLAN' | 'EXCEPTION' | string

interface WarehouseRow {
  id?: string | number
  pickup_id: string
  merchant_code?: string | null
  merchant_name?: string | null
  pickup_township?: string | null
  status?: WarehouseStatus | null
  warehouse_location?: string | null
  updated_at?: string | null
  created_at?: string | null
}

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

function text(value: unknown, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value) }
function formatDate(value: unknown) { const d = new Date(String(value ?? '')); return Number.isNaN(d.getTime()) ? text(value) : d.toLocaleString('en-GB', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }
function root(): React.CSSProperties { return { minHeight:'100%', background:C.bg, color:C.text, padding:24, fontFamily:FF.body } }
function panel(extra: React.CSSProperties = {}): React.CSSProperties { return { background:`linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}`, borderRadius:20, boxShadow:'0 18px 40px rgba(0,0,0,.20)', ...extra } }
function input(): React.CSSProperties { return { width:'100%', height:42, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:'0 12px', outline:'none', fontFamily:FF.body } }
function button(primary=false): React.CSSProperties { return { height:42, borderRadius:12, border:`1px solid ${primary ? C.gold : C.border}`, background:primary ? 'rgba(246,184,75,.15)' : C.panel2, color:primary ? C.gold : C.text2, padding:'0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontWeight:700, fontFamily:FF.body, transition:'all .2s' } }

function badgeStyle(status: unknown): React.CSSProperties {
  const s = text(status, '').toUpperCase()
  const map: Record<string, [string, string]> = {
    PICKED_UP: [C.info, '#082f49'],
    RECEIVED_WAREHOUSE: [C.info, '#082f49'],
    SORTED: [C.gold, '#3b2503'],
    BAGGED: [C.orange, '#431407'],
    READY_FOR_WAYPLAN: [C.success, '#052e16'],
    EXCEPTION: [C.error, '#4a0521'],
  }
  const tone = map[s] ?? [C.text2, C.panel2]
  return { display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', background:tone[1], color:tone[0], border:`1px solid ${C.border}`, whiteSpace:'nowrap' }
}

const TRANSLATIONS = {
  EN: {
    whTitle:'Warehouse', title:'Receive / Sort / Bag / Ready for Wayplan', desc:'Warehouse actions prepare parcels for delivery wayplan generation. Wayplan is generated only after READY_FOR_WAYPLAN.',
    template:'Template', uploadScans:'Upload Scans', refresh:'Refresh', download:'Download CSV',
    kpiPicked:'Picked Up', kpiPickedNote:'Inbound to warehouse', kpiReceived:'Received', kpiReceivedNote:'Warehouse accepted', kpiSorted:'Sorted', kpiSortedNote:'Sorting complete', kpiBagged:'Bagged', kpiBaggedNote:'Ready soon', kpiReady:'Ready Wayplan', kpiReadyNote:'Can generate wayplan',
    scanTitle:'Scan Action', scanDesc:'Scan or enter pickup ID, select warehouse event, then submit.', phPickupId:'Pickup ID / Waybill', phLocation:'Warehouse location', phSearch:'Search', submitScan:'Submit Scan',
    queueTitle:'Warehouse Work Queue', queueDesc:'Rows are loaded from recent pickup requests.', thPickupId:'Pickup ID', thMerchant:'Merchant', thTownship:'Township', thStatus:'Status', thWarehouse:'Warehouse', thUpdated:'Updated', thAction:'Quick Action', btnApply:'Apply Selected Event', optAll:'ALL',
    errNoPickup:'Enter or select a pickup ID.', msgMarked:(id:string, status:string) => `${id} marked as ${status}.`, evtReceive:'Receive', evtSort:'Sort', evtBag:'Bag', evtReady:'Ready for Wayplan',
    floorBtn:'Floor Priority', floorTitle:'Floor Prioritization Briefing', noRecords:'No records found.',
  },
  MM: {
    whTitle:'ကုန်လှောင်ရုံ', title:'လက်ခံရန် / အမျိုးအစားခွဲရန် / အိတ်သွင်းရန် / လမ်းကြောင်းဆွဲရန် အသင့်', desc:'ကုန်လှောင်ရုံ လုပ်ငန်းစဉ်များသည် ပို့ဆောင်ရေး လမ်းကြောင်းများ ရေးဆွဲရန်အတွက် ပါဆယ်ထုပ်များကို ပြင်ဆင်ပေးပါသည်။ READY_FOR_WAYPLAN အဆင့်ရောက်မှသာ လမ်းကြောင်းရေးဆွဲခြင်းကို လုပ်ဆောင်နိုင်မည်ဖြစ်သည်။',
    template:'နမူနာပုံစံ', uploadScans:'စကင်န်များ တင်ရန်', refresh:'ပြန်လည်ဆန်းသစ်ရန်', download:'CSV ဒေါင်းလုဒ်',
    kpiPicked:'လာရောက်ယူဆောင်ပြီး', kpiPickedNote:'ကုန်လှောင်ရုံသို့ ဝင်ရောက်မည်', kpiReceived:'လက်ခံရရှိပြီး', kpiReceivedNote:'ကုန်လှောင်ရုံမှ လက်ခံပြီး', kpiSorted:'အမျိုးအစားခွဲပြီး', kpiSortedNote:'ခွဲခြားပြီး', kpiBagged:'အိတ်သွင်းပြီး', kpiBaggedNote:'မကြာမီ အသင့်ဖြစ်မည်', kpiReady:'လမ်းကြောင်းဆွဲရန် အသင့်', kpiReadyNote:'လမ်းကြောင်း ရေးဆွဲနိုင်ပါပြီ',
    scanTitle:'စကင်န်ဖတ်ခြင်း လုပ်ငန်းစဉ်', scanDesc:'လာယူမည့် ID သို့မဟုတ် Waybill ကို စကင်န်ဖတ်ပါ သို့မဟုတ် ရိုက်ထည့်ပါ၊ လုပ်ငန်းစဉ်ကို ရွေးချယ်ပြီး တင်သွင်းပါ။', phPickupId:'လာယူမည့် ID / Waybill', phLocation:'ကုန်လှောင်ရုံ တည်နေရာ', phSearch:'ရှာဖွေရန်', submitScan:'စကင်န် တင်သွင်းရန်',
    queueTitle:'ကုန်လှောင်ရုံ လုပ်ငန်းစဉ် စာရင်း', queueDesc:'မှတ်တမ်းများကို နောက်ခံစနစ်မှ ဆွဲယူထားပါသည်။', thPickupId:'လာယူမည့် ID', thMerchant:'ကုန်သည်', thTownship:'မြို့နယ်', thStatus:'အခြေအနေ', thWarehouse:'ကုန်လှောင်ရုံ', thUpdated:'နောက်ဆုံးပြင်ဆင်ချိန်', thAction:'အမြန်လုပ်ဆောင်ရန်', btnApply:'လုပ်ငန်းစဉ်ကို အတည်ပြုရန်', optAll:'အားလုံး',
    errNoPickup:'လာယူမည့် ID ကို ရိုက်ထည့်ပါ သို့မဟုတ် ရွေးချယ်ပါ။', msgMarked:(id:string, status:string) => `${id} အား ${status} အဖြစ် သတ်မှတ်ပြီးပါပြီ။`, evtReceive:'လက်ခံရန်', evtSort:'အမျိုးအစားခွဲရန်', evtBag:'အိတ်သွင်းရန်', evtReady:'လမ်းကြောင်းဆွဲရန် အသင့်',
    floorBtn:'အလုပ်စားပွဲ ဦးစားပေး', floorTitle:'အလုပ်စားပွဲ ဦးစားပေးမှု အကျဉ်းချုပ်', noRecords:'မှတ်တမ်း မတွေ့ရှိပါ။',
  },
}

const EVENTS: { key: WarehouseEventKey; labelKey: 'evtReceive' | 'evtSort' | 'evtBag' | 'evtReady'; status: WarehouseStatus }[] = [
  { key:'WAREHOUSE_RECEIVED', labelKey:'evtReceive', status:'RECEIVED_WAREHOUSE' },
  { key:'WAREHOUSE_SORTED', labelKey:'evtSort', status:'SORTED' },
  { key:'WAREHOUSE_BAGGED', labelKey:'evtBag', status:'BAGGED' },
  { key:'READY_FOR_WAYPLAN', labelKey:'evtReady', status:'READY_FOR_WAYPLAN' },
]

function Kpi({ label, value, note, accent=C.gold }: { label: string; value: number | string; note?: string; accent?: string }) {
  return <div style={panel({ padding:16, borderTop:`2px solid ${accent}` })}><div style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:800 }}>{label}</div><div style={{ marginTop:8, fontSize:26, color:accent, fontWeight:800 }}>{value}</div>{note ? <div style={{ marginTop:4, fontSize:12, color:C.text2 }}>{note}</div> : null}</div>
}

function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'start', marginBottom:16, flexWrap:'wrap' }}><div><h2 style={{ margin:0, color:C.text, fontSize:18, fontWeight:800 }}>{title}</h2>{subtitle ? <p style={{ margin:'6px 0 0', color:C.text2, fontSize:13, lineHeight:1.5 }}>{subtitle}</p> : null}</div>{right}</div>
}

export default function WarehouseOperations() {
  const [lang, setLang] = useState<Language>('EN')
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [scan, setScan] = useState('')
  const [location, setLocation] = useState('YGN-WH')
  const [eventType, setEventType] = useState<WarehouseEventKey>('WAREHOUSE_RECEIVED')
  const [statusFilter, setStatusFilter] = useState<'ALL' | WarehouseStatus>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [briefing, setBriefing] = useState<string | null>(null)

  const t = TRANSLATIONS[lang]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .in('status', ['PICKED_UP','RECEIVED_WAREHOUSE','SORTED','BAGGED','READY_FOR_WAYPLAN','EXCEPTION'])
        .order('updated_at', { ascending:false })
        .limit(300)
      if (error) throw error
      setRows(data ?? [])
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const channel = supabase.channel('be-warehouse')
      .on('postgres_changes', { event:'*', schema:'public', table:'be_portal_pickup_requests' }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const runScan = async (pickupId = scan, eventOverride: WarehouseEventKey = eventType, locationOverride = location) => {
    if (!pickupId.trim()) { setMessage({ type:'error', text:t.errNoPickup }); return }
    const selectedEvent = EVENTS.find(event => event.key === eventOverride)
    const newStatus = selectedEvent?.status ?? 'RECEIVED_WAREHOUSE'
    
    setLoading(true)
    setMessage(null)
    
    try {
      // Direct updates mapped to our workflow rules
      await supabase.from('be_portal_pickup_requests').update({ 
        status: newStatus, 
        warehouse_location: locationOverride, 
        warehouse_ready_at: newStatus === 'READY_FOR_WAYPLAN' ? new Date().toISOString() : undefined, 
        updated_at: new Date().toISOString() 
      }).eq('pickup_id', pickupId)

      await supabase.from('be_portal_cargo_events').insert({ 
        pickup_id: pickupId, 
        event_type: eventOverride, 
        status_code: newStatus,
        description: `Warehouse scan ${eventOverride} at ${locationOverride}.`, 
        actor_role: 'warehouse' 
      })

      setRows(current => current.map(row => row.pickup_id === pickupId ? { ...row, status:newStatus, warehouse_location:locationOverride, updated_at:new Date().toISOString() } : row))
      setMessage({ type:'success', text:t.msgMarked(pickupId, newStatus) })
      setScan('')
    } catch (error) {
      setMessage({ type:'error', text:error instanceof Error ? error.message : 'Warehouse scan failed.' })
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(row => {
      const statusOk = statusFilter === 'ALL' || text(row.status,'').toUpperCase() === statusFilter
      const searchOk = !q || [row.pickup_id, row.merchant_code, row.merchant_name, row.pickup_township, row.status].some(value => text(value,'').toLowerCase().includes(q))
      return statusOk && searchOk
    })
  }, [rows, search, statusFilter])

  const kpis = useMemo(() => ({
    picked: rows.filter(row => text(row.status,'').toUpperCase() === 'PICKED_UP').length,
    received: rows.filter(row => text(row.status,'').toUpperCase() === 'RECEIVED_WAREHOUSE').length,
    sorted: rows.filter(row => text(row.status,'').toUpperCase() === 'SORTED').length,
    bagged: rows.filter(row => text(row.status,'').toUpperCase() === 'BAGGED').length,
    ready: rows.filter(row => text(row.status,'').toUpperCase() === 'READY_FOR_WAYPLAN').length,
  }), [rows])

  return <div style={root()}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important}`}</style>
    <div style={{ maxWidth:1600, margin:'0 auto', display:'grid', gap:18 }}>
      <section style={panel({ padding:22 })}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'start', flexWrap:'wrap' }}>
          <div>
            <div style={{ color:C.gold, textTransform:'uppercase', letterSpacing:'0.16em', fontWeight:800, fontSize:12 }}>{t.whTitle}</div>
            <h1 style={{ margin:'8px 0', fontSize:28 }}>{t.title}</h1>
            <p style={{ margin:0, color:C.text2 }}>{t.desc}</p>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ display:'flex', background:C.panel2, borderRadius:8, padding:4, border:`1px solid ${C.border}` }}>
              <button onClick={() => setLang('EN')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'EN' ? C.panelHover : 'transparent', color:lang === 'EN' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>EN</button>
              <button onClick={() => setLang('MM')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'MM' ? C.panelHover : 'transparent', color:lang === 'MM' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>မြန်မာ</button>
            </div>
            <button style={button()} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}{t.refresh}
            </button>
          </div>
        </div>
      </section>

      {message && <section style={panel({ padding:14, borderColor:message.type === 'error' ? C.error : C.success })}><div style={{ color:message.type === 'error' ? C.error : C.success, display:'flex', gap:10 }}>{message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}</div></section>}
      
      <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
        <Kpi label={t.kpiPicked} value={kpis.picked} note={t.kpiPickedNote} accent={C.info}/>
        <Kpi label={t.kpiReceived} value={kpis.received} note={t.kpiReceivedNote} accent={C.success}/>
        <Kpi label={t.kpiSorted} value={kpis.sorted} note={t.kpiSortedNote} accent={C.gold}/>
        <Kpi label={t.kpiBagged} value={kpis.bagged} note={t.kpiBaggedNote} accent={C.orange}/>
        <Kpi label={t.kpiReady} value={kpis.ready} note={t.kpiReadyNote} accent={C.success}/>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title={t.scanTitle} subtitle={t.scanDesc}/>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(220px,1fr) 240px 220px auto', gap:12 }}>
          <input style={input()} value={scan} onChange={e => setScan(e.target.value)} placeholder={t.phPickupId}/>
          <select style={input()} value={eventType} onChange={e => setEventType(e.target.value as WarehouseEventKey)}>{EVENTS.map(e => <option key={e.key} value={e.key}>{t[e.labelKey]}</option>)}</select>
          <input style={input()} value={location} onChange={e => setLocation(e.target.value)} placeholder={t.phLocation}/>
          <button style={button(true)} onClick={() => void runScan()} disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin"/> : <ScanLine size={16}/>} {t.submitScan}</button>
        </div>
      </section>

      <section style={panel({ padding:18 })}>
        <SectionTitle title={t.queueTitle} subtitle={t.queueDesc} right={
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <input style={{ ...input(), width:260 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={t.phSearch}/>
            <select style={{ ...input(), width:220 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | WarehouseStatus)}>
              <option value="ALL">{t.optAll}</option>
              {['PICKED_UP','RECEIVED_WAREHOUSE','SORTED','BAGGED','READY_FOR_WAYPLAN','EXCEPTION'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        }/>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign: 'left' }}>
            <thead>
              <tr>{[t.thPickupId,t.thMerchant,t.thTownship,t.thStatus,t.thWarehouse,t.thUpdated,t.thAction].map(h => <th key={h} style={{ padding:'10px 14px', color:C.muted, fontSize:11, fontWeight:800, textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id ?? row.pickup_id}>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}><strong style={{ color:C.text }}>{text(row.pickup_id)}</strong></td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}>{text(row.merchant_name)}<br/><span style={{ color:C.muted }}>{text(row.merchant_code)}</span></td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}>{text(row.pickup_township)}</td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}><span style={badgeStyle(row.status)}>{text(row.status)}</span></td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}>{text(row.warehouse_location)}</td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}>{formatDate(row.updated_at)}</td>
                  <td style={{ padding:'12px', borderBottom:`1px solid ${C.border}66` }}><button style={button()} onClick={() => void runScan(row.pickup_id)}><PackageCheck size={15}/>{t.btnApply}</button></td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:C.muted }}>{t.noRecords}</td></tr>}
              {loading && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:C.muted }}><Loader2 size={16} className="animate-spin" /> Loading...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
}