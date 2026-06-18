// @ts-nocheck
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Download,
  FileText,
  Languages,
  Loader2,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'

import goLivePrintApi from '@/lib/goLivePrintApi'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const translations = {
  en: {
    appTitle: 'Document Print Studio',
    appSubtitle: 'Centralized Waybill and Invoice Generation',
    tabWaybills: 'Waybill Studio',
    tabInvoices: 'Invoice Studio',
    printControl: 'Print Control',
    waybillTitle: 'Waybill Printing Studio',
    waybillDesc: 'Search pickup ways, print labels, generate QR/barcodes, export rows and record every print action.',
    invoiceTitle: 'Invoice Print Studio',
    invoiceDesc: 'Issue official invoices from live waybill rows and synchronized Finance totals.',
    loadedRows: 'Loaded Rows',
    selectedRows: 'Selected',
    printUser: 'Print User',
    pickupOrder: 'Pickup Order',
    selectPickup: 'Select Pickup Order...',
    searchPlaceholder: 'Search waybill, merchant, receiver...',
    loadBtn: 'Load Data',
    syncPickups: 'Sync Pickups',
    printPdf: 'Print / Save PDF',
    markPrinted: 'Mark Printed',
    qrBarcode: 'QR / Barcode',
    exportExcel: 'Export CSV',
    issueInvoice: 'Issue Invoice',
    waybillRows: 'Delivery Waybill Rows',
    waybillRowsDesc: 'Checked rows are printed; if none are checked, the filtered row list prints.',
    selectVisible: 'Select Visible',
    clearSelection: 'Clear Selection',
    colPrint: 'Print',
    colWayId: 'Delivery Way ID',
    colMerchant: 'Merchant',
    colReceiver: 'Receiver',
    colPhone: 'Phone',
    colTownship: 'Township',
    colAddress: 'Address',
    colItemPrice: 'Item Price',
    colDeliFee: 'Deli Fee',
    colSurcharge: 'Surcharge',
    colFinalCod: 'Final COD',
    colPrinted: 'Printed',
    emptyWaybills: 'No waybill rows loaded yet.',
    emptyInvoices: 'Select a pickup and issue invoice.',
    draftInvoice: 'Draft / Not Issued',
    summaryParcelCount: 'Total Parcel Count',
    summaryDeliTotal: 'Delivery Fee Total',
    summarySurcharge: 'Surcharge Total',
    summaryCod: 'Total COD',
    actionSuccess: 'Action completed successfully.',
    actionError: 'Failed to complete action.',
    goLiveChecks: 'Go-Live Checks',
    lastSync: 'Last Sync',
    dataSource: 'Live Supabase RPC / table fallback',
    noPickup: 'Please select a pickup order first.',
    noRowsSelected: 'Select at least one waybill or load rows first.',
    printedAudit: 'Last print audit',
  },
  mm: {
    appTitle: 'စာရွက်စာတမ်း ထုတ်ဝေခြင်း စင်တာ',
    appSubtitle: 'ပို့ဆောင်ရေးပြေစာနှင့် ငွေတောင်းခံလွှာ စီမံခန့်ခွဲမှုစနစ်',
    tabWaybills: 'ပြေစာထုတ်ဝေခြင်း',
    tabInvoices: 'ငွေတောင်းခံလွှာထုတ်ဝေခြင်း',
    printControl: 'ထုတ်ဝေမှု ထိန်းချုပ်ရေး',
    waybillTitle: 'ပို့ဆောင်ရေးပြေစာ ထုတ်ဝေခြင်း စင်တာ',
    waybillDesc: 'အော်ဒါများရှာဖွေခြင်း၊ လေဘယ်ထုတ်ခြင်း၊ QR/Barcode ထုတ်လုပ်ခြင်းနှင့် မှတ်တမ်းများကို စီမံပါ။',
    invoiceTitle: 'ငွေတောင်းခံလွှာ ထုတ်ဝေခြင်း စင်တာ',
    invoiceDesc: 'ဘဏ္ဍာရေးဌာန၏ စာရင်းများနှင့် ကိုက်ညီသော တရားဝင် ငွေတောင်းခံလွှာများ ထုတ်ပေးရန်။',
    loadedRows: 'ရယူထားသော စာရင်းများ',
    selectedRows: 'ရွေးချယ်ထားသော အရေအတွက်',
    printUser: 'ထုတ်ဝေသူ',
    pickupOrder: 'ပစ္စည်းလက်ခံမည့် အော်ဒါ',
    selectPickup: 'Pickup အော်ဒါ ရွေးချယ်ပါ...',
    searchPlaceholder: 'ပို့ဆောင်ရေးပြေစာ၊ ကုန်သည်၊ လက်ခံသူ ရှာဖွေရန်...',
    loadBtn: 'အချက်အလက် ရယူမည်',
    syncPickups: 'Pickup စာရင်းများ ထပ်မံရယူမည်',
    printPdf: 'ပရင့်ထုတ်မည် / PDF သိမ်းမည်',
    markPrinted: 'ပရင့်ထုတ်ပြီးအဖြစ် သတ်မှတ်မည်',
    qrBarcode: 'QR / Barcode ထုတ်မည်',
    exportExcel: 'CSV ထုတ်ယူမည်',
    issueInvoice: 'ငွေတောင်းခံလွှာ အတည်ပြုထုတ်ဝေမည်',
    waybillRows: 'ပေးပို့ရမည့် ပြေစာစာရင်းများ',
    waybillRowsDesc: 'ရွေးချယ်ထားသော စာရင်းများကိုသာ ပရင့်ထုတ်ပါမည်။ မရွေးပါက ပြထားသမျှကို ထုတ်ပါမည်။',
    selectVisible: 'ပြသထားသမျှ ရွေးချယ်မည်',
    clearSelection: 'ရွေးချယ်မှု ဖျက်မည်',
    colPrint: 'ရွေးချယ်ရန်',
    colWayId: 'ပြေစာအမှတ်',
    colMerchant: 'ကုန်သည်',
    colReceiver: 'လက်ခံသူ',
    colPhone: 'ဖုန်းနံပါတ်',
    colTownship: 'မြို့နယ်',
    colAddress: 'လိပ်စာ',
    colItemPrice: 'ပစ္စည်းတန်ဖိုး',
    colDeliFee: 'ပို့ဆောင်ခ',
    colSurcharge: 'အပိုဆောင်းကြေး',
    colFinalCod: 'ကောက်ခံရမည့် COD',
    colPrinted: 'ထုတ်ဝေပြီးချိန်',
    emptyWaybills: 'ပြေစာစာရင်းများ မရှိသေးပါ။',
    emptyInvoices: 'Pickup ရွေးချယ်၍ ငွေတောင်းခံလွှာ ထုတ်ဝေပါ။',
    draftInvoice: 'မူကြမ်း / မထုတ်ဝေရသေးပါ',
    summaryParcelCount: 'စုစုပေါင်း ပါဆယ်အရေအတွက်',
    summaryDeliTotal: 'စုစုပေါင်း ပို့ဆောင်ခ',
    summarySurcharge: 'စုစုပေါင်း အပိုဆောင်းကြေး',
    summaryCod: 'စုစုပေါင်း COD',
    actionSuccess: 'လုပ်ဆောင်ချက် အောင်မြင်ပါသည်။',
    actionError: 'လုပ်ဆောင်ချက် မအောင်မြင်ပါ။',
    goLiveChecks: 'Go-Live စစ်ဆေးချက်များ',
    lastSync: 'နောက်ဆုံး Sync',
    dataSource: 'Live Supabase RPC / Table Fallback',
    noPickup: 'Pickup အော်ဒါရွေးချယ်ရန်လိုအပ်သည်။',
    noRowsSelected: 'Waybill အနည်းဆုံးတစ်ခု ရွေးပါ သို့မဟုတ် စာရင်းများရယူပါ။',
    printedAudit: 'နောက်ဆုံး ထုတ်ဝေမှုမှတ်တမ်း',
  },
}

type Lang = 'en' | 'mm'
type TranslationKey = keyof typeof translations.en
type I18nContextValue = { lang: Lang; t: (k: TranslationKey) => string; toggle: () => void }

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  t: (k) => k,
  toggle: () => undefined,
})

function useI18n() {
  return useContext(I18nContext)
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()} MMK`
}

function dateText(value?: string | null) {
  if (!value) return '-'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB')
}

function rowWayId(row: any) {
  return String(row.delivery_way_id || row.deliver_way_id || row.way_id || row.waybill_id || row.tracking_no || row.id || '').trim()
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\'/g, '&#039;')
}

function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '-9999px'
  iframe.style.bottom = '-9999px'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000)
  }, 350)
}

function buildWaybillPrintHtml(rows: any[], printSize: string) {
  const sizeCss =
    printSize === 'a4'
      ? '@page{size:A4;margin:10mm}.label{width:100%;min-height:120mm;page-break-after:always}'
      : printSize === 'a5'
        ? '@page{size:A5;margin:8mm}.label{width:100%;min-height:100mm;page-break-after:always}'
        : printSize === '4x3_two_up'
          ? '@page{size:4in 6in;margin:0.12in}.label{width:3.7in;height:2.75in;display:inline-block;vertical-align:top;margin:0.08in}'
          : '@page{size:4in 6in;margin:0.12in}.label{width:3.7in;height:5.65in;page-break-after:always}'

  const labels = rows
    .map((row) => {
      const wayId = rowWayId(row)
      const cod = row.actual_collect || row.final_cod || row.cod_amount || row.total_amount || 0
      return `
        <section class="label">
          <div class="brand">BRITIUM EXPRESS</div>
          <div class="way">${escapeHtml(wayId)}</div>
          <div class="barcode">|||| ||| |||| || |||||</div>
          <div class="grid">
            <div><b>Merchant</b><br/>${escapeHtml(row.merchant_name || row.merchant_code || '-')}</div>
            <div><b>Receiver</b><br/>${escapeHtml(row.receiver_name || row.customer_name || '-')}</div>
            <div><b>Phone</b><br/>${escapeHtml(row.receiver_phone || row.customer_phone || '-')}</div>
            <div><b>Township</b><br/>${escapeHtml(row.township || row.receiver_township || '-')}</div>
          </div>
          <div class="address"><b>Address</b><br/>${escapeHtml(row.delivery_address || row.address || '-')}</div>
          <div class="cod">COD: ${escapeHtml(money(cod))}</div>
        </section>
      `
    })
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Britium Waybill Print</title>
      <style>
        ${sizeCss}
        *{box-sizing:border-box}
        body{font-family:Arial,"Noto Sans Myanmar",sans-serif;margin:0;color:#111827}
        .label{border:2px solid #111827;border-radius:10px;padding:12px;margin-bottom:10px;overflow:hidden}
        .brand{font-weight:900;font-size:14px;letter-spacing:.16em;text-transform:uppercase}
        .way{font-family:monospace;font-weight:900;font-size:22px;margin-top:8px}
        .barcode{font-family:monospace;font-size:34px;letter-spacing:2px;line-height:1.1;margin:6px 0}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px}
        .address{margin-top:10px;font-size:12px;line-height:1.45}
        .cod{margin-top:10px;border-top:1px solid #111827;padding-top:8px;font-size:18px;font-weight:900}
      </style>
    </head>
    <body>${labels}</body>
  </html>`
}

const shellCard: React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12 }
const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

export default function DocumentPrintStudioPage() {
  const [lang, setLang] = useState<Lang>('mm')
  const t = useCallback((k: TranslationKey) => translations[lang][k] || k, [lang])

  return (
    <I18nContext.Provider value={{ lang, t, toggle: () => setLang((current) => (current === 'en' ? 'mm' : 'en')) }}>
      <DocumentPrintStudioShell />
    </I18nContext.Provider>
  )
}

function DocumentPrintStudioShell() {
  const { t, lang, toggle } = useI18n()
  const [activeTab, setActiveTab] = useState<'waybill' | 'invoice'>('waybill')

  const [pickups, setPickups] = useState<any[]>([])
  const [selectedPickupId, setSelectedPickupId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [actorEmail, setActorEmail] = useState('system')

  const [rows, setRows] = useState<any[]>([])
  const [selectedWayIds, setSelectedWayIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [printSize, setPrintSize] = useState('4x6')
  const [lastAudit, setLastAudit] = useState<any>(null)

  const [invoice, setInvoice] = useState<any>(null)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
  }, [rows, search])

  const rowsToPrint = useMemo(() => {
    if (!selectedWayIds.length) return filteredRows
    const selected = new Set(selectedWayIds)
    return filteredRows.filter((row) => selected.has(rowWayId(row)))
  }, [filteredRows, selectedWayIds])

  const readiness = useMemo(
    () => [
      { label: 'Pickup sync', ok: pickups.length > 0, value: pickups.length },
      { label: 'Waybill rows', ok: rows.length > 0, value: rows.length },
      { label: 'Invoice rows', ok: Array.isArray(invoice?.rows) && invoice.rows.length > 0, value: invoice?.rows?.length || 0 },
      { label: 'Audit ready', ok: Boolean(lastAudit || selectedPickupId), value: lastAudit ? 'written' : selectedPickupId ? 'ready' : 'pending' },
    ],
    [invoice?.rows, lastAudit, pickups.length, rows.length, selectedPickupId],
  )

  const selectedCount = activeTab === 'waybill' ? rowsToPrint.length : invoice?.rows?.length || 0

  async function resolveActor() {
    try {
      const { data } = await supabase.auth.getUser()
      setActorEmail(data?.user?.email || data?.user?.id || 'system')
    } catch {
      setActorEmail('system')
    }
  }

  async function syncPickups(options: { keepSelection?: boolean } = {}) {
    setLoading(true)
    setMessage(null)
    try {
      await resolveActor()
      const opts = await goLivePrintApi.getPickupOptions(250)
      setPickups(opts)
      setLastSyncedAt(new Date().toISOString())

      const nextPickupId = options.keepSelection && selectedPickupId ? selectedPickupId : opts[0]?.pickup_id || ''
      if (nextPickupId) await handlePickupSelect(nextPickupId)
      else {
        setRows([])
        setInvoice(null)
      }
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void syncPickups()
  }, [])

  async function handlePickupSelect(id: string) {
    setSelectedPickupId(id)
    setSelectedWayIds([])
    setLoading(true)
    setMessage(null)

    if (!id) {
      setRows([])
      setInvoice(null)
      setLoading(false)
      return
    }

    try {
      const [wbRows, invData] = await Promise.all([goLivePrintApi.getWaybillPrintRows(id), goLivePrintApi.getInvoicePrintRows(id)])
      setRows(Array.isArray(wbRows) ? wbRows : [])
      setInvoice(invData || null)
      setLastSyncedAt(new Date().toISOString())
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function toggleWayId(id: string) {
    if (!id) return
    setSelectedWayIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function validatePickupAndRows() {
    if (!selectedPickupId) return t('noPickup')
    if (!rowsToPrint.length) return t('noRowsSelected')
    return null
  }

  async function handlePrintWaybills() {
    const validationError = validatePickupAndRows()
    if (validationError) return setMessage({ text: validationError, type: 'error' })

    setLoading(true)
    try {
      const deliveryWayIds = rowsToPrint.map(rowWayId).filter(Boolean)
      const audit = await goLivePrintApi.recordPrintEvent({
        eventType: 'print',
        documentType: 'waybill',
        pickupId: selectedPickupId,
        deliveryWayIds,
        rowCount: rowsToPrint.length,
        actor: { email: actorEmail },
        payload: { print_size: printSize },
      })

      setLastAudit(audit)
      printHtml(buildWaybillPrintHtml(rowsToPrint, printSize))
      await goLivePrintApi.markWaybillsPrinted(selectedPickupId, deliveryWayIds)
      setMessage({ text: `${t('actionSuccess')} (${dateText((audit as any)?.printed_at)})`, type: 'success' })
      await handlePickupSelect(selectedPickupId)
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkPrinted() {
    const validationError = validatePickupAndRows()
    if (validationError) return setMessage({ text: validationError, type: 'error' })

    setLoading(true)
    try {
      const deliveryWayIds = rowsToPrint.map(rowWayId).filter(Boolean)
      const audit = await goLivePrintApi.markWaybillsPrinted(selectedPickupId, deliveryWayIds)
      setLastAudit(audit)
      setMessage({ text: t('actionSuccess'), type: 'success' })
      await handlePickupSelect(selectedPickupId)
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleQrExport() {
    if (!selectedPickupId) return setMessage({ text: t('noPickup'), type: 'error' })
    setLoading(true)
    try {
      const payloads = await goLivePrintApi.getQrPayloads(selectedPickupId)
      goLivePrintApi.downloadRowsCsv(`britium-qr-payloads-${selectedPickupId}.csv`, payloads)
      setMessage({ text: t('actionSuccess'), type: 'success' })
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleExportRows() {
    const data = activeTab === 'waybill' ? filteredRows : invoice?.rows || []
    if (!Array.isArray(data) || data.length === 0) return setMessage({ text: t('emptyWaybills'), type: 'error' })
    goLivePrintApi.downloadRowsCsv(`britium-${activeTab}-${selectedPickupId || 'export'}.csv`, data)
  }

  async function handleIssueInvoice() {
    if (!selectedPickupId) return setMessage({ text: t('noPickup'), type: 'error' })

    setLoading(true)
    try {
      const issued = await goLivePrintApi.generateInvoiceForPickup(selectedPickupId)
      setLastAudit(issued)
      setMessage({ text: t('actionSuccess'), type: 'success' })
      await handlePickupSelect(selectedPickupId)
    } catch (err: any) {
      setMessage({ text: err?.message || t('actionError'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>{t('appTitle')}</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>{t('appSubtitle')}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <button onClick={toggle} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
            <Languages size={14} /> {lang === 'en' ? 'မြန်မာ' : 'English'}
          </button>
          <button onClick={() => void syncPickups({ keepSelection: true })} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
            <RefreshCw size={14} /> {t('syncPickups')}
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(320px,420px)', gap:16, marginBottom:18 }}>
        <div style={{ ...shellCard, padding:20 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
            <button onClick={() => setActiveTab('waybill')} style={{ padding:'9px 14px', borderRadius:10, border:`1px solid ${activeTab === 'waybill' ? C.gold : C.border}`, background:activeTab === 'waybill' ? C.gold : 'transparent', color:activeTab === 'waybill' ? C.bg : C.text2, fontFamily:FF.body, fontSize:13, fontWeight:700, cursor:'pointer' }}>{t('tabWaybills')}</button>
            <button onClick={() => setActiveTab('invoice')} style={{ padding:'9px 14px', borderRadius:10, border:`1px solid ${activeTab === 'invoice' ? C.gold : C.border}`, background:activeTab === 'invoice' ? C.gold : 'transparent', color:activeTab === 'invoice' ? C.bg : C.text2, fontFamily:FF.body, fontSize:13, fontWeight:700, cursor:'pointer' }}>{t('tabInvoices')}</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 }}>
            <Stat label={t('loadedRows')} value={activeTab === 'waybill' ? rows.length : invoice?.rows?.length || 0} />
            <Stat label={t('selectedRows')} value={selectedCount} />
            <Stat label={t('printUser')} value={actorEmail} />
          </div>
        </div>

        <div style={{ ...shellCard, padding:20 }}>
          <div style={{ marginBottom:10 }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 6px' }}>{t('pickupOrder')}</h2>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>{t('printControl')}</p>
          </div>

          <select value={selectedPickupId} onChange={(e) => void handlePickupSelect(e.target.value)} style={{ width:'100%', background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'10px 12px', fontFamily:FF.body, fontSize:14, marginBottom:12 }}>
            <option value="">{t('selectPickup')}</option>
            {(pickups ?? []).map((p) => (
              <option key={p.pickup_id || p.value} value={p.pickup_id || p.value}>{p.label || p.pickup_id}</option>
            ))}
          </select>

          <div style={{ position:'relative', marginBottom:12 }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} style={{ width:'100%', background:C.panel2, border:`1px solid ${C.border}`, color:C.text2, borderRadius:10, padding:'10px 12px 10px 32px', fontFamily:FF.body, fontSize:14 }} />
          </div>

          <button type="button" onClick={() => void handlePickupSelect(selectedPickupId)} disabled={loading || !selectedPickupId} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 14px', borderRadius:10, background:C.gold, border:`1px solid ${C.gold}`, color:C.bg, fontFamily:FF.body, fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading || !selectedPickupId ? 0.6 : 1 }}>
            {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />} {t('loadBtn')}
          </button>

          <div style={{ marginTop:12, fontFamily:FF.body, fontSize:14, color:C.muted }}>{t('lastSync')}: {dateText(lastSyncedAt)} · {t('dataSource')}</div>
          {lastAudit ? <div style={{ marginTop:8, fontFamily:FF.body, fontSize:14, color:C.success }}>{t('printedAudit')}: {dateText((lastAudit as any)?.printed_at || (lastAudit as any)?.issued_at)}</div> : null}
        </div>
      </div>

      {message ? (
        <div style={{ ...shellCard, padding:14, marginBottom:16, borderColor: message.type === 'error' ? `${C.error}66` : message.type === 'warning' ? `${C.warning}66` : `${C.success}66`, color: message.type === 'error' ? C.error : message.type === 'warning' ? C.warning : C.success }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, fontFamily:FF.body, fontSize:14 }}>
            {message.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{message.text}</span>
          </div>
        </div>
      ) : null}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:18 }}>
        {readiness.map((check) => (
          <div key={check.label} style={{ ...shellCard, padding:18, borderColor: check.ok ? `${C.success}44` : `${C.warning}44` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, color:check.ok ? C.success : C.warning }}>
              {check.ok ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
              <span style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{check.ok ? 'Ready' : 'Check'}</span>
            </div>
            <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2, marginBottom:6 }}>{check.label}</div>
            <div style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color:C.gold }}>{String(check.value)}</div>
          </div>
        ))}
      </div>

      {activeTab === 'waybill' ? (
        <WaybillWorkspace
          t={t}
          loading={loading}
          rows={rows}
          filteredRows={filteredRows}
          selectedWayIds={selectedWayIds}
          setSelectedWayIds={setSelectedWayIds}
          toggleWayId={toggleWayId}
          printSize={printSize}
          setPrintSize={setPrintSize}
          onPrintWaybills={handlePrintWaybills}
          onMarkPrinted={handleMarkPrinted}
          onQrExport={handleQrExport}
          onExportRows={handleExportRows}
          onSyncPickups={() => void syncPickups({ keepSelection: true })}
        />
      ) : (
        <InvoiceWorkspace
          t={t}
          loading={loading}
          pickupId={selectedPickupId}
          invoice={invoice}
          onIssueInvoice={handleIssueInvoice}
          onExportRows={handleExportRows}
        />
      )}
    </div>
  )
}

function WaybillWorkspace({
  t,
  loading,
  rows,
  filteredRows,
  selectedWayIds,
  setSelectedWayIds,
  toggleWayId,
  printSize,
  setPrintSize,
  onPrintWaybills,
  onMarkPrinted,
  onQrExport,
  onExportRows,
  onSyncPickups,
}: any) {
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10, marginBottom:16 }}>
        <ActionButton onClick={onSyncPickups} busy={loading} icon={RefreshCw} label={t('syncPickups')} />
        <ActionButton onClick={onPrintWaybills} busy={loading} icon={Printer} label={t('printPdf')} primary />
        <ActionButton onClick={onMarkPrinted} busy={loading} icon={CheckCircle2} label={t('markPrinted')} />
        <ActionButton onClick={onQrExport} busy={loading} icon={QrCode} label={t('qrBarcode')} />
        <ActionButton onClick={onExportRows} icon={Download} label={t('exportExcel')} />
        <label style={{ ...shellCard, display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
          <FileText size={14} color={C.gold} />
          <select value={printSize} onChange={(e) => setPrintSize(e.target.value)} style={{ flex:1, background:'transparent', border:'none', color:C.text2, fontFamily:FF.body, fontSize:14 }}>
            <option value="4x6">4 x 6 Label</option>
            <option value="4x3_two_up">4 x 3 Two-Up</option>
            <option value="a5">A5 Document</option>
            <option value="a4">A4 Document</option>
          </select>
        </label>
      </div>

      <div style={{ ...shellCard, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', padding:'16px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px', display:'flex', alignItems:'center', gap:8 }}><Barcode size={16} color={C.gold} /> {t('waybillRows')}</h2>
            <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>{t('waybillRowsDesc')}</p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button type="button" onClick={() => setSelectedWayIds(filteredRows.map(rowWayId).filter(Boolean))} style={{ padding:'8px 12px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }}>{t('selectVisible')}</button>
            <button type="button" onClick={() => setSelectedWayIds([])} style={{ padding:'8px 12px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }}>{t('clearSelection')}</button>
          </div>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', minWidth:1500, borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('colPrint')}</th>
                <th style={thStyle}>{t('colWayId')}</th>
                <th style={thStyle}>{t('colMerchant')}</th>
                <th style={thStyle}>{t('colReceiver')}</th>
                <th style={thStyle}>{t('colPhone')}</th>
                <th style={thStyle}>{t('colTownship')}</th>
                <th style={thStyle}>{t('colAddress')}</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('colItemPrice')}</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('colDeliFee')}</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('colSurcharge')}</th>
                <th style={{ ...thStyle, textAlign:'right' }}>{t('colFinalCod')}</th>
                <th style={thStyle}>{t('colPrinted')}</th>
              </tr>
            </thead>
            <tbody>
              {(filteredRows ?? []).map((row: any, idx: number) => {
                const id = rowWayId(row)
                return (
                  <tr key={id || row.id || idx} style={{ background: idx % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={tdStyle}><input type="checkbox" checked={selectedWayIds.includes(id)} onChange={() => toggleWayId(id)} /></td>
                    <td style={{ ...tdStyle, color:C.info }}>{id || '-'}</td>
                    <td style={{ ...tdStyle, color:C.text }}>{row.merchant_name || row.merchant_code || '-'}</td>
                    <td style={tdStyle}>{row.receiver_name || row.customer_name || row.recipient_name || '-'}</td>
                    <td style={tdStyle}>{row.receiver_phone || row.customer_phone || row.recipient_phone || '-'}</td>
                    <td style={tdStyle}>{row.township || row.receiver_township || row.recipient_town || '-'}</td>
                    <td style={tdStyle}>{row.delivery_address || row.address || row.recipient_address || '-'}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>{money(row.item_price)}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>{money(row.delivery_fee_os || row.delivery_fee || row.deli_fee_os)}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>{money(row.surcharge)}</td>
                    <td style={{ ...tdStyle, textAlign:'right', color:C.gold }}>{money(row.actual_collect || row.final_cod || row.total_amount || row.cod_amount)}</td>
                    <td style={tdStyle}>{row.printed_at ? dateText(row.printed_at) : '-'}</td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 ? (
                <tr><td colSpan={12} style={{ ...tdStyle, textAlign:'center', padding:'32px 14px', color:C.muted }}>{t('emptyWaybills')}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function InvoiceWorkspace({ t, loading, pickupId, invoice, onIssueInvoice, onExportRows }: any) {
  const pickup = invoice?.pickup || {}
  const rows = Array.isArray(invoice?.rows) ? invoice.rows : []
  const totals = invoice?.totals || {}

  return (
    <>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
        <ActionButton onClick={onIssueInvoice} busy={loading} icon={ReceiptText} label={t('issueInvoice')} primary disabled={!pickupId} />
        <ActionButton onClick={onExportRows} icon={Download} label={t('exportExcel')} disabled={!rows.length} />
        <ActionButton onClick={() => window.print()} icon={Printer} label={t('printPdf')} disabled={!rows.length} />
      </div>

      <div style={{ ...shellCard, padding:24 }}>
        {loading ? <div style={{ padding:'24px 0', textAlign:'center', color:C.muted }}><Loader2 size={16} /> </div> : null}
        {!loading && !rows.length ? <div style={{ textAlign:'center', padding:'32px 0', fontFamily:FF.body, fontSize:14, color:C.muted }}>{t('emptyInvoices')}</div> : null}

        {!!rows.length ? (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 280px', gap:16, borderBottom:`1px solid ${C.border}`, paddingBottom:18, marginBottom:18 }}>
              <div>
                <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 6px' }}>{invoice?.company?.name || 'BRITIUM EXPRESS'}</h2>
                <p style={{ fontFamily:FF.body, fontSize:14, color:C.text2, margin:'0 0 4px' }}>{invoice?.company?.address || 'Yangon, Myanmar'}</p>
                <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>{invoice?.company?.phone || ''} {invoice?.company?.email ? `· ${invoice.company.email}` : ''}</p>
              </div>
              <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>Invoice</div>
                <div style={{ fontFamily:FF.body, fontSize:18, fontWeight:700, color:C.gold, marginBottom:8 }}>{pickup.invoice_no || pickup.invoice_id || t('draftInvoice')}</div>
                <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2, marginBottom:4 }}>Pickup: {pickup.pickup_id || pickup.pickup_way_id || pickupId}</div>
                <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Merchant: {pickup.merchant_name || pickup.merchant_code || '-'}</div>
              </div>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('colWayId')}</th>
                    <th style={thStyle}>{t('colReceiver')}</th>
                    <th style={thStyle}>{t('colTownship')}</th>
                    <th style={{ ...thStyle, textAlign:'right' }}>{t('colDeliFee')}</th>
                    <th style={{ ...thStyle, textAlign:'right' }}>{t('colSurcharge')}</th>
                    <th style={{ ...thStyle, textAlign:'right' }}>{t('colFinalCod')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r: any, i: number) => (
                    <tr key={r.id || rowWayId(r) || i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ ...tdStyle, color:C.info }}>{rowWayId(r)}</td>
                      <td style={tdStyle}>{r.receiver_name || r.recipient_name || '-'}</td>
                      <td style={tdStyle}>{r.township || r.recipient_town || '-'}</td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>{money(r.delivery_fee_os || r.deli_fee_os || r.delivery_fee)}</td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>{money(r.surcharge)}</td>
                      <td style={{ ...tdStyle, textAlign:'right', color:C.gold }}>{money(r.final_cod || r.actual_collect || r.cod_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginLeft:'auto', marginTop:18, maxWidth:360, background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
              <Line label={t('summaryParcelCount')} value={totals.parcel_count ?? totals.count ?? rows.length} />
              <Line label={t('summaryDeliTotal')} value={money(totals.delivery_fee_total ?? totals.delivery_fee)} />
              <Line label={t('summarySurcharge')} value={money(totals.surcharge_total ?? totals.surcharge)} />
              <Line label={t('summaryCod')} value={money(totals.cod_total ?? totals.cod ?? totals.invoice_total)} bold />
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

function ActionButton({ label, icon: Icon, onClick, busy, primary, disabled }: any) {
  return (
    <button
      type="button"
      onClick={() => void onClick?.()}
      disabled={busy || disabled}
      style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        gap:8,
        padding:'10px 14px',
        borderRadius:10,
        border: primary ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
        background: primary ? C.gold : 'transparent',
        color: primary ? C.bg : C.text2,
        fontFamily:FF.body,
        fontSize:13,
        fontWeight:700,
        cursor:'pointer',
        opacity: busy || disabled ? 0.6 : 1,
      }}
    >
      {busy ? <Loader2 size={14} /> : <Icon size={14} />}
      {label}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
      <p style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, margin:'0 0 8px' }}>{label}</p>
      <p style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color:C.gold, margin:0, wordBreak:'break-word' }}>{value}</p>
    </div>
  )
}

function Line({ label, value, bold = false }: { label: string; value: any; bold?: boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding: bold ? '10px 0 0' : '6px 0', marginTop: bold ? 8 : 0, borderTop: bold ? `1px solid ${C.border}` : 'none' }}>
      <span style={{ fontFamily:FF.body, fontSize:14, color:bold ? C.text : C.text2, fontWeight:bold ? 700 : 500 }}>{label}</span>
      <span style={{ fontFamily:FF.body, fontSize:14, color:bold ? C.gold : C.text2, fontWeight:bold ? 700 : 600 }}>{value}</span>
    </div>
  )
}
