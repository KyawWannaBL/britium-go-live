import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, BarChart2, CheckCheck, CheckCircle2, DollarSign, Download, FileText, Layers, Loader2, Package, Printer, RefreshCw, Scan, Search, Sparkles, Tag, Truck, X } from 'lucide-react'

type Language = 'EN' | 'MM'

interface ParcelRow {
  id: string
  tracking_no: string | null
  pickup_id?: string | null
  invoice_no?: string | null
  merchant_name?: string | null
  recipient_name: string | null
  recipient_phone: string | null
  delivery_address: string | null
  delivery_township: string | null
  cod_amount: number | null
  status: string | null
  created_at: string | null
  weight_kg: number | null
  item_value: number | null
  payment_method: string | null
}

interface SupabaseResult<T> { data: T[] | null; error: Error | null }
interface QueryChain<T> extends PromiseLike<SupabaseResult<T>> {
  select: (columns?: string) => QueryChain<T>
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>
  limit: (count: number) => QueryChain<T>
}

const PREVIEW_ROWS: ParcelRow[] = [
  { id:'1', tracking_no:'WB-0611-BVE-001', pickup_id:'P0611-BVE-001', invoice_no:'INV-20260611-BVE', merchant_name:'Britium Ventures', recipient_name:'Daw Hnin', recipient_phone:'09970000001', delivery_address:'North Dagon, Yangon', delivery_township:'North Dagon', cod_amount:45000, status:'Printed', created_at:new Date().toISOString(), weight_kg:1.4, item_value:45000, payment_method:'COD' },
  { id:'2', tracking_no:'WB-0611-MSY-002', pickup_id:'P0611-MSY-002', invoice_no:'INV-20260611-MSY', merchant_name:'Mega Store Yangon', recipient_name:'Ko Min', recipient_phone:'09970000002', delivery_address:'Sanchaung, Yangon', delivery_township:'Sanchaung', cod_amount:0, status:'Picked Up', created_at:new Date().toISOString(), weight_kg:0.8, item_value:18000, payment_method:'PREPAID' },
  { id:'3', tracking_no:'WB-0611-FHB-003', pickup_id:'P0611-FHB-003', invoice_no:'INV-20260611-FHB', merchant_name:'Fashion Hub', recipient_name:'Ma Thiri', recipient_phone:'09970000003', delivery_address:'Hlaing, Yangon', delivery_township:'Hlaing', cod_amount:72500, status:'Finance Pending', created_at:new Date().toISOString(), weight_kg:2.2, item_value:72500, payment_method:'COD' },
]

const createPreviewChain = <T,>(rows: T[]): QueryChain<T> => {
  const promise = Promise.resolve<SupabaseResult<T>>({ data: rows, error: null })
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    then: promise.then.bind(promise),
  } as QueryChain<T>
  return chain
}

const supabase = { from: (_table: string) => createPreviewChain<ParcelRow>(PREVIEW_ROWS) }

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const TRANSLATIONS = {
  EN: {
    title: 'Waybill Studio',
    subtitle: 'Label generation · Print queue · Pipeline tracking · Network usage',
    refresh: 'Refresh',
    kpiLoaded: 'Loaded Rows', kpiFiltered: 'Filtered Queue', kpiPrinted: 'Printed Status', kpiOpen: 'Open COD Rows', kpiTotal: 'Queue COD Total',
    plTitle: 'Waybill Status Pipeline',
    closeTitle: 'Waybill Close Conditions',
    closeDesc: 'All 8 conditions must be satisfied before Finance can lock and close a waybill.',
    fieldTitle: 'Waybill Fields',
    pqTitle: 'Print Queue',
    searchPh: 'Search waybills…',
    btnPrint: 'Print', btnCsv: 'CSV', btnStrategy: 'Print Strategy',
    thNo: '#', thTrack: 'Tracking No', thRecip: 'Recipient Name', thStat: 'Status', thAdd: 'Delivery Address', thPh: 'Phone', thCod: 'COD Amount', thAct: 'Actions',
    msgLoading: 'Loading waybills…',
    msgEmptyTitle: 'No waybills in print queue',
    msgEmptySub: 'Try adjusting your search or generate waybills from a pickup request.',
    netTitle: 'Waybill Usage Across Network',
    netDesc: 'Every waybill follows the same network lifecycle. The waybill number and paired invoice number are scanned and validated at each stage.',
    strategyTitle: 'Batch Optimization Briefing',
  },
  MM: {
    title: 'လမ်းညွှန်စာရွက် လုပ်ငန်းခွင်',
    subtitle: 'တံဆိပ်ထုတ်လုပ်ခြင်း · ပရင့်ထုတ်မည့်စာရင်း · လုပ်ငန်းစဉ် ခြေရာခံခြင်း',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    kpiLoaded: 'မှတ်တမ်းများ', kpiFiltered: 'စစ်ထုတ်ထားသောစာရင်း', kpiPrinted: 'ပရင့်ထုတ်ပြီး', kpiOpen: 'ကျန်ရှိသော COD', kpiTotal: 'စုစုပေါင်း COD',
    plTitle: 'လမ်းညွှန်စာရွက် အခြေအနေ လုပ်ငန်းစဉ်',
    closeTitle: 'လမ်းညွှန်စာရွက် ပိတ်သိမ်းရန် သတ်မှတ်ချက်များ',
    closeDesc: 'ငွေကြေးဌာနမှ အပြီးသတ်ပိတ်သိမ်းရန်အတွက် အချက် ၈ ချက်စလုံး ပြည့်စုံရမည်။',
    fieldTitle: 'အချက်အလက် ကွက်လပ်များ',
    pqTitle: 'ပရင့်ထုတ်မည့် စာရင်း',
    searchPh: 'ရှာဖွေရန်…',
    btnPrint: 'ပရင့်ထုတ်မည်', btnCsv: 'CSV', btnStrategy: 'ပရင့် ဗျူဟာ',
    thNo: 'စဉ်', thTrack: 'ခြေရာခံအမှတ်', thRecip: 'လက်ခံမည့်သူ', thStat: 'အခြေအနေ', thAdd: 'လိပ်စာ', thPh: 'ဖုန်း', thCod: 'COD ပမာဏ', thAct: 'လုပ်ဆောင်ချက်',
    msgLoading: 'ဆွဲယူနေပါသည်…',
    msgEmptyTitle: 'ပရင့်ထုတ်ရန် မရှိပါ',
    msgEmptySub: 'ရှာဖွေမှုကို ပြောင်းလဲကြည့်ပါ သို့မဟုတ် အသစ်ဖန်တီးပါ။',
    netTitle: 'ကွန်ရက်အတွင်း အသုံးပြုမှုများ',
    netDesc: 'လမ်းညွှန်စာရွက်တိုင်းသည် တူညီသော လုပ်ငန်းစဉ်ကို ဖြတ်သန်းရပြီး အဆင့်တိုင်းတွင် စကင်န်ဖတ်၍ စစ်ဆေးအတည်ပြုသည်။',
    strategyTitle: 'အုပ်စုဖွဲ့ ပရင့်ထုတ်မှု အကြံပြုချက်',
  },
}

type Translation = typeof TRANSLATIONS.EN

const WAYBILL_STATUSES = [
  { key:'Printed', color:'#9ca3af', bg:'rgba(156,163,175,0.15)' },
  { key:'Picked Up', color:'#60a5fa', bg:'rgba(96,165,250,0.15)' },
  { key:'Received', color:'#2dd4bf', bg:'rgba(45,212,191,0.15)' },
  { key:'In Warehouse', color:'#818cf8', bg:'rgba(129,140,248,0.15)' },
  { key:'Sorting', color:'#c084fc', bg:'rgba(192,132,252,0.15)' },
  { key:'Bagged', color:'#e879f9', bg:'rgba(232,121,249,0.15)' },
  { key:'Dispatched', color:'#22d3ee', bg:'rgba(34,211,238,0.15)' },
  { key:'Out for Delivery', color:'#fbbf24', bg:'rgba(251,191,36,0.15)' },
  { key:'Delivered', color:'#34d399', bg:'rgba(52,211,153,0.15)' },
  { key:'Failed Attempt', color:'#f87171', bg:'rgba(248,113,113,0.15)' },
  { key:'Returned', color:'#fbbf24', bg:'rgba(251,191,36,0.12)' },
  { key:'Finance Pending', color:'#fb923c', bg:'rgba(251,146,60,0.15)' },
  { key:'Closed', color:'#10b981', bg:'rgba(16,185,129,0.15)' },
]

const CLOSE_CONDITIONS = ['Shipment delivered, returned, or cancelled', 'POD or failure proof captured and validated', 'COD status = Settled or Not Applicable', 'Rider handover verified', 'Merchant settlement generated or Not Required', 'Invoice status = Issued, Paid, or On Hold', 'No unresolved warehouse exceptions', 'Finance locked the waybill record']
const WAYBILL_FIELDS = ['Waybill No', 'Pickup ID', 'Deliver ID', 'Invoice No', 'Merchant ID', 'Sender', 'Receiver', 'Pickup Address', 'Delivery Address']
const NETWORK_USES = [
  { icon:Tag, label:'Label Printing', color:'#60a5fa' }, { icon:Scan, label:'Warehouse Scanning', color:'#34d399' }, { icon:Archive, label:'Bag Scan / Dispatch', color:'#c084fc' }, { icon:Truck, label:'Rider Delivery', color:'#fbbf24' }, { icon:DollarSign, label:'COD Collection', color:'#F5C842' }, { icon:CheckCheck, label:'POD Validation', color:'#2dd4bf' }, { icon:FileText, label:'Invoice Matching', color:'#fb923c' }, { icon:BarChart2, label:'Merchant Settlement', color:'#e879f9' }, { icon:Layers, label:'Audit Trail', color:'#94a3b8' },
]

function fmtCOD(n: number | null | undefined) { return n == null || n === 0 ? '—' : Number(n).toLocaleString() }
function statusStyle(raw: string | null | undefined) {
  const key = String(raw ?? '').toLowerCase().replace(/_/g, ' ')
  const match = WAYBILL_STATUSES.find(s => s.key.toLowerCase() === key)
  return match ? { bg:match.bg, color:match.color } : { bg:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.55)' }
}

function localPrintStrategy(rows: ParcelRow[], t: Translation): string {
  if (rows.length === 0) return `${t.strategyTitle}: No waybills are queued. Generate labels after pickup request validation.`
  const byTownship = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.delivery_township ?? 'Unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const top = Object.entries(byTownship).sort((a, b) => b[1] - a[1])[0]
  const codRows = rows.filter(row => Number(row.cod_amount ?? 0) > 0).length
  return `Print ${rows.length} waybill(s) by township batch first. Highest queue: ${top?.[0] ?? 'N/A'} (${top?.[1] ?? 0}). Keep COD labels (${codRows}) in a separate tray for finance visibility, then hand warehouse scanning the same township order to speed bagging.`
}

function downloadCsv(rows: ParcelRow[]) {
  const headers = ['tracking_no','pickup_id','invoice_no','merchant_name','recipient_name','recipient_phone','delivery_township','cod_amount','status']
  const body = rows.map(row => headers.map(key => JSON.stringify(String(row[key as keyof ParcelRow] ?? ''))).join(',')).join('\n')
  const blob = new Blob([headers.join(',') + '\n' + body], { type:'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `waybill-print-queue-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function WaybillLabel({ row }: { row: ParcelRow }) {
  const tracking = row.tracking_no ?? 'BE-000000'
  return (
    <div style={{ width:'105mm', minHeight:'148mm', background:'#fff', border:'1px solid #ddd', fontFamily:"'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize:11, color:'#111', boxSizing:'border-box', padding:'3mm 4mm', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8, paddingBottom:'3mm' }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'#0A1628' }} />
        <div style={{ flex:1 }}><p style={{ fontSize:13, fontWeight:700, margin:0 }}>BRITIUM EXPRESS</p><p style={{ fontSize:9, margin:'2px 0 0' }}>Delivery Service</p><p style={{ fontSize:9, margin:'2px 0 0', color:'#444' }}>HotLine : +95-9-897447711</p></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:8, fontFamily:'monospace' }}>{tracking}</div><div style={{ width:56, height:56, border:'1px solid #111', display:'grid', placeItems:'center', fontSize:9 }}>QR</div></div>
      </div>
      <div style={{ height:1, background:'#ccc', margin:'2mm 0' }} />
      <div style={{ display:'grid', gap:'2mm' }}>
        <div><strong>Merchant:</strong> {row.merchant_name ?? '—'}</div>
        <div><strong>Recipient:</strong> {row.recipient_name ?? '—'} / {row.recipient_phone ?? '—'}</div>
        <div><strong>Address:</strong> {row.delivery_address ?? row.delivery_township ?? '—'}</div>
        <div><strong>Pickup:</strong> {row.pickup_id ?? '—'} / <strong>Invoice:</strong> {row.invoice_no ?? '—'}</div>
      </div>
      <div style={{ marginTop:'auto', borderTop:'1px solid #ccc', paddingTop:'3mm', display:'flex', justifyContent:'space-between' }}><span>Payment: {row.payment_method ?? '—'}</span><strong>COD {fmtCOD(row.cod_amount)}</strong></div>
    </div>
  )
}

function KpiCard({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone: string; icon: React.ComponentType<{ size?: number; color?: string }> }) {
  return <div style={{ border:`1px solid ${C.border}`, background:`linear-gradient(180deg, rgba(8,27,46,.92), rgba(11,34,54,.98))`, borderRadius:18, padding:16 }}><div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}><div style={{ width:32, height:32, borderRadius:10, display:'grid', placeItems:'center', background:`${tone}16`, border:`1px solid ${tone}33` }}><Icon size={14} color={tone}/></div><span style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase' }}>{label}</span></div><div style={{ fontSize:24, fontWeight:700, color:tone }}>{value}</div></div>
}

export default function WaybillStudioPage() {
  const [lang, setLang] = useState<Language>('EN')
  const [rows, setRows] = useState<ParcelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [briefing, setBriefing] = useState<string | null>(null)

  const t = TRANSLATIONS[lang]

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const result = await supabase.from('parcel_rows').select('*').order('created_at', { ascending: false }).limit(200)
      if (result.error) throw result.error
      setRows(result.data ?? [])
    } catch {
      setRows(PREVIEW_ROWS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row => !q || [row.tracking_no, row.pickup_id, row.invoice_no, row.recipient_name, row.delivery_township].some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const totalCod = filtered.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0)
  const printedRows = filtered.filter(row => String(row.status || '').toLowerCase() === 'printed').length
  const openCod = filtered.filter(row => Number(row.cod_amount || 0) > 0 && String(row.status || '').toLowerCase() !== 'closed').length

  return <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body, color:C.text }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body *{visibility:hidden}.print-label,.print-label *{visibility:visible}.print-label{position:absolute;left:0;top:0}}`}</style>
    <div style={{ display:'grid', gap:18, maxWidth:1600, margin:'0 auto' }}>
      <section style={{ borderRadius:26, padding:24, background:`linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}` }}><div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}><div><p style={{ margin:0, color:C.orange, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.28em' }}>DATA ENTRY OPERATIONS</p><h1 style={{ margin:'6px 0 0', fontSize:24, fontWeight:700, textTransform:'uppercase', color:C.gold, letterSpacing:'.12em' }}>{t.title}</h1><p style={{ margin:'8px 0 0', fontSize:14, color:C.text2 }}>{t.subtitle}</p></div><div style={{ display:'flex', gap:10, flexWrap:'wrap' }}><div style={{ display:'flex', background:C.panel2, borderRadius:8, padding:4, border:`1px solid ${C.border}` }}><button type="button" onClick={() => setLang('EN')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'EN' ? C.panelHover : 'transparent', color:lang === 'EN' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>EN</button><button type="button" onClick={() => setLang('MM')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'MM' ? C.panelHover : 'transparent', color:lang === 'MM' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>မြန်မာ</button></div><button type="button" onClick={() => setBriefing(localPrintStrategy(filtered, t))} style={{ background:`linear-gradient(135deg, ${C.gold}, ${C.orange})`, color:'#082032', border:'none', borderRadius:10, padding:'0 16px', fontWeight:700, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}><Sparkles size={14}/>{t.btnStrategy}</button><button type="button" onClick={() => void loadRows()} disabled={loading} style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'0 16px', fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}><RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined}/>{t.refresh}</button></div></div></section>

      {briefing ? <section style={{ padding:18, background:'linear-gradient(135deg,#0f2a42,#0b2236)', border:`1px solid ${C.info}`, borderRadius:18 }}><div style={{ display:'flex', justifyContent:'space-between' }}><strong style={{ color:C.info, display:'flex', gap:8, alignItems:'center' }}><Sparkles size={16}/>{t.strategyTitle}</strong><button type="button" onClick={() => setBriefing(null)} style={{ background:'transparent', border:'none', color:C.muted, cursor:'pointer' }}><X size={18}/></button></div><p style={{ color:C.text2, lineHeight:1.6, margin:'10px 0 0' }}>{briefing}</p></section> : null}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}><KpiCard label={t.kpiLoaded} value={rows.length} tone={C.info} icon={Package}/><KpiCard label={t.kpiFiltered} value={filtered.length} tone={C.gold} icon={Printer}/><KpiCard label={t.kpiPrinted} value={printedRows} tone={C.success} icon={CheckCircle2}/><KpiCard label={t.kpiOpen} value={openCod} tone={C.warning} icon={DollarSign}/><KpiCard label={t.kpiTotal} value={fmtCOD(totalCod)} tone={C.orange} icon={BarChart2}/></section>

      <section style={{ border:`1px solid ${C.border}`, background:C.panel, borderRadius:22, padding:18 }}><div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}><Printer size={16} color={C.gold}/><h2 style={{ margin:0, fontSize:18, fontWeight:600, color:C.text }}>{t.pqTitle}</h2><span style={{ background:`${C.gold}14`, border:`1px solid ${C.gold}33`, color:C.gold, padding:'2px 10px', borderRadius:999, fontSize:11, fontWeight:700 }}>{filtered.length}</span><div style={{ marginLeft:'auto', display:'flex', gap:10, flexWrap:'wrap' }}><div style={{ position:'relative' }}><Search size={14} color={C.muted} style={{ position:'absolute', left:10, top:9 }}/><input value={search} onChange={(e: { target: { value: string } }) => setSearch(e.target.value)} placeholder={t.searchPh} style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text, borderRadius:10, padding:'8px 14px 8px 32px', fontSize:13, outline:'none' }}/></div><button type="button" onClick={() => downloadCsv(filtered)} style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'0 14px', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}><Download size={14}/>{t.btnCsv}</button><button type="button" onClick={() => window.print()} disabled={filtered.length === 0} style={{ background:C.gold, border:'none', color:'#111', borderRadius:10, padding:'0 14px', fontWeight:700, cursor:'pointer' }}>{t.btnPrint}</button></div></div><div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}><thead><tr>{[t.thNo,t.thTrack,t.thRecip,t.thStat,t.thAdd,t.thPh,t.thCod].map(h => <th key={h} style={{ padding:12, background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:C.muted }}><Loader2 size={16}/> {t.msgLoading}</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:C.muted }}><strong>{t.msgEmptyTitle}</strong><br/>{t.msgEmptySub}</td></tr> : filtered.map((row, i) => { const sc = statusStyle(row.status); return <tr key={row.id}><td style={{ padding:12, borderBottom:`1px solid ${C.border}55`, color:C.muted }}>{i + 1}</td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55`, color:C.gold, fontWeight:700 }}>{row.tracking_no ?? '—'}</td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55` }}>{row.recipient_name ?? '—'}</td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55` }}><span style={{ padding:'4px 10px', borderRadius:999, background:sc.bg, color:sc.color, fontSize:11, fontWeight:700 }}>{row.status ?? '—'}</span></td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55`, color:C.text2 }}>{row.delivery_township ?? '—'}</td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55`, color:C.text2 }}>{row.recipient_phone ?? '—'}</td><td style={{ padding:12, borderBottom:`1px solid ${C.border}55`, color:C.gold, fontWeight:700 }}>{fmtCOD(row.cod_amount)}</td></tr>})}</tbody></table></div></section>

      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(320px,.7fr)', gap:18 }}><div style={{ border:`1px solid ${C.border}`, background:C.panel, borderRadius:18, padding:18 }}><h2 style={{ margin:'0 0 12px', fontSize:18 }}>{t.plTitle}</h2><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{WAYBILL_STATUSES.map(s => <span key={s.key} style={{ background:s.bg, color:s.color, border:`1px solid ${s.color}33`, borderRadius:999, padding:'6px 10px', fontSize:12, fontWeight:700 }}>{s.key}</span>)}</div><h3 style={{ color:C.text2 }}>{t.netTitle}</h3><p style={{ color:C.muted, fontSize:13 }}>{t.netDesc}</p><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:8 }}>{NETWORK_USES.map(item => { const Icon = item.icon; return <div key={item.label} style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:10, display:'flex', gap:8, alignItems:'center' }}><Icon size={14} color={item.color}/><span style={{ color:C.text2, fontSize:12 }}>{item.label}</span></div>})}</div></div><div style={{ border:`1px solid ${C.border}`, background:C.panel, borderRadius:18, padding:18 }}><h2 style={{ margin:'0 0 6px', fontSize:18 }}>{t.closeTitle}</h2><p style={{ color:C.muted, fontSize:13 }}>{t.closeDesc}</p><ol style={{ color:C.text2, paddingLeft:18 }}>{CLOSE_CONDITIONS.map(condition => <li key={condition} style={{ marginBottom:6 }}>{condition}</li>)}</ol><h3 style={{ color:C.text2 }}>{t.fieldTitle}</h3><div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{WAYBILL_FIELDS.map(field => <span key={field} style={{ background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:999, padding:'4px 9px', fontSize:12 }}>{field}</span>)}</div></div></section>

      <div className="print-label" style={{ display:'none' }}>{filtered[0] ? <WaybillLabel row={filtered[0]}/> : null}</div>
    </div>
  </div>
}
