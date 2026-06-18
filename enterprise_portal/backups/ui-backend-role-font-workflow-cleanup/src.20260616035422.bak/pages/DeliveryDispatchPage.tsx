import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Truck, CheckSquare, Download } from 'lucide-react'

// --- GO-LIVE IMPORTS ---
// In production, delete the preview stub below and uncomment this import.
// import { supabase } from '@/integrations/supabase/client'
// ------------------------

type Language = 'EN' | 'MM'
type DeliveryStatus = 'out_for_delivery' | 'delivered' | 'failed' | string

interface DeliveryRow {
  id?: string | number | null
  workflow_id?: string | null
  merchant_name?: string | null
  receiver?: string | null
  township?: string | null
  status?: DeliveryStatus | null
  cod_amount?: string | number | null
  delivery_fee?: string | number | null
  created_at?: string | null
}

interface SupabaseResult<T> {
  data: T[] | null
  error: { message?: string } | null
}

// --- PREVIEW ENVIRONMENT STUBS ---
// These stubs allow the UI to render in this isolated environment without
// requiring the app's Supabase integration file.
const supabase = {
  from: (_table: string) => ({
    select: (_columns: string) => ({
      order: async (_column: string, _options: { ascending: boolean }): Promise<SupabaseResult<DeliveryRow>> => {
        await new Promise(resolve => setTimeout(resolve, 600))
        return { data: [], error: null }
      },
    }),
  }),
}
// ---------------------------------

const C = {
  bg: '#061524',
  panel: '#0b2236',
  panel2: '#081b2e',
  panelHover: '#0f2a42',
  border: '#1a3a5c',
  gold: '#f6b84b',
  orange: '#ff8a4c',
  text: '#eef8ff',
  text2: '#c8dff0',
  muted: '#4d7a9b',
  success: '#22c55e',
  error: '#ff4f86',
  warning: '#f59e0b',
  info: '#38bdf8',
}

const FF = {
  body: "'Poppins',Inter,system-ui,sans-serif",
  sub: "'Helvetica Neue',Helvetica,Arial,sans-serif",
}

const ALL = 'All'
const DELIVERY_STATUSES = [ALL, 'out_for_delivery', 'delivered', 'failed'] as const

const statusStyle = (status: string): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    out_for_delivery: { background: '#082f49', color: C.info, border: '1px solid #0c4a6e' },
    delivered: { background: '#052e16', color: C.success, border: '1px solid #166534' },
    failed: { background: '#4a0521', color: C.error, border: '1px solid #831843' },
  }

  return {
    ...(map[(status || '').toLowerCase()] ?? {
      background: C.panel2,
      color: C.muted,
      border: '1px solid ' + C.border,
    }),
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: FF.body,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
  }
}

const formatStatus = (status: string) => status.replace(/_/g, ' ')

const csvEscape = (value: unknown) => {
  const text = value == null ? '' : String(value)
  return '"' + text.replace(/"/g, '""') + '"'
}

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const TRANSLATIONS = {
  EN: {
    title: 'High Density Delivery Hub',
    subtitle: 'Filter inventory, build dispatch routes, sync Supervisor/Rider queues, and prepare merchant payment settlement.',
    refresh: 'Refresh',
    kpiFilteredRows: 'Filtered Rows',
    kpiTownships: 'Townships',
    kpiFleet: 'Fleet',
    kpiCodTotal: 'COD Total',
    kpiDelFee: 'Delivery Fee',
    filterTownship: 'Township',
    filterStatus: 'Status',
    btnDispatch: 'Generate Dispatch Plan',
    btnConfirm: 'Confirm Merchant Payment Queue',
    btnDownload: 'Download Filtered Inventory',
    invTitle: 'Filtered Operational Inventory',
    rowsCount: (n: number) => `${n} row(s)`,
    colId: 'Workflow ID',
    colMerch: 'Merchant',
    colRecv: 'Receiver',
    colTown: 'Town',
    colStat: 'Status',
    colCod: 'COD',
    colFee: 'Del Fee',
    msgLoading: 'Loading…',
    msgEmpty: 'No operational rows found. Save Data Entry or Warehouse rows first.',
    msgLoadFail: 'Unable to load delivery workflows. Please refresh and try again.',
    all: 'All',
  },
  MM: {
    title: 'ကုန်ပစ္စည်း ပို့ဆောင်မှု ထိန်းချုပ်ရေး ဗဟိုဌာန',
    subtitle: 'ကုန်ပစ္စည်းစာရင်းများကို စစ်ထုတ်ခြင်း၊ ပို့ဆောင်ရေးလမ်းကြောင်းများ ရေးဆွဲခြင်း၊ ကြီးကြပ်သူ/ပို့ဆောင်သူ လုပ်ငန်းစဉ်များကို ချိတ်ဆက်ခြင်းနှင့် ကုန်သည်များအတွက် ငွေချေမှုစာရင်းများကို ပြင်ဆင်ခြင်း။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    kpiFilteredRows: 'စစ်ထုတ်ထားသော စာကြောင်းများ',
    kpiTownships: 'မြို့နယ်များ',
    kpiFleet: 'ယာဉ်ယန္တရားများ',
    kpiCodTotal: 'စုစုပေါင်း ကောက်ခံငွေ',
    kpiDelFee: 'ပို့ဆောင်ခ',
    filterTownship: 'မြို့နယ်',
    filterStatus: 'အခြေအနေ',
    btnDispatch: 'ပို့ဆောင်ရေး အစီအစဉ် ရေးဆွဲရန်',
    btnConfirm: 'ကုန်သည် ငွေချေမှုစာရင်း အတည်ပြုရန်',
    btnDownload: 'စစ်ထုတ်ထားသော စာရင်းကို ဒေါင်းလုဒ်ရယူရန်',
    invTitle: 'စစ်ထုတ်ထားသော လုပ်ငန်းလည်ပတ်မှု စာရင်း',
    rowsCount: (n: number) => `စာကြောင်းရေ ${n} ကြောင်း`,
    colId: 'လုပ်ငန်းအမှတ်',
    colMerch: 'ကုန်သည်',
    colRecv: 'လက်ခံသူ',
    colTown: 'မြို့နယ်',
    colStat: 'အခြေအနေ',
    colCod: 'ကောက်ခံငွေ',
    colFee: 'ပို့ဆောင်ခ',
    msgLoading: 'ဆွဲယူနေပါသည်...',
    msgEmpty: 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်းများ မတွေ့ရှိပါ။ ကုန်လှောင်ရုံ မှတ်တမ်းများကို ဦးစွာ သိမ်းဆည်းပါ။',
    msgLoadFail: 'ပို့ဆောင်မှုလုပ်ငန်းစဉ်များကို ဆွဲယူ၍မရပါ။ ပြန်လည်ဆန်းသစ်ပြီး ထပ်မံကြိုးစားပါ။',
    all: 'အားလုံး',
  },
}

interface SelectBoxProps {
  label: string
  value: string
  options: readonly string[]
  allLabel: string
  onChange: (value: string) => void
}

function SelectBox({ value, onChange, options, label, allLabel }: SelectBoxProps) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>{label}</div>
      <select
        value={value}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        style={{ width: '100%', padding: '10px 12px', background: C.panel2, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: FF.body, fontWeight: 400, outline: 'none', minWidth: 180 }}
      >
        {options.map(option => (
          <option key={option} value={option}>{option === ALL ? allLabel : formatStatus(option)}</option>
        ))}
      </select>
    </div>
  )
}

export default function DeliveryDispatchPage() {
  const [lang, setLang] = useState<Language>('EN')
  const [data, setData] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [townFilter, setTownFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)

  const t = TRANSLATIONS[lang]

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const { data: rows, error } = await supabase
        .from('delivery_workflows')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message || t.msgLoadFail)
      setData(rows ?? [])
    } catch (error) {
      setData([])
      setLoadError(error instanceof Error ? error.message : t.msgLoadFail)
    } finally {
      setLoading(false)
    }
  }, [t.msgLoadFail])

  useEffect(() => {
    void load()
  }, [load])

  const uniqueTownships = useMemo(
    () => Array.from(new Set(data.map(row => row.township).filter((township): township is string => Boolean(township)))).sort(),
    [data],
  )

  const filtered = useMemo(
    () => data.filter(row => {
      const byTown = townFilter === ALL || row.township === townFilter
      const byStatus = statusFilter === ALL || row.status === statusFilter
      return byTown && byStatus
    }),
    [data, statusFilter, townFilter],
  )

  const sumField = useCallback(
    (rows: DeliveryRow[], field: 'cod_amount' | 'delivery_fee') => rows.reduce((acc, row) => acc + toNumber(row[field]), 0),
    [],
  )

  const handleDownload = useCallback(() => {
    const headers = ['Workflow ID', 'Merchant', 'Receiver', 'Township', 'Status', 'COD Amount', 'Delivery Fee']
    const rows = filtered.map(row => [
      row.workflow_id,
      row.merchant_name,
      row.receiver,
      row.township,
      row.status,
      row.cod_amount,
      row.delivery_fee,
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(csvEscape).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'filtered-delivery-inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  const kpis = [
    { label: t.kpiFilteredRows, value: filtered.length },
    { label: t.kpiTownships, value: uniqueTownships.length },
    { label: t.kpiFleet, value: 0 },
    { label: t.kpiCodTotal, value: sumField(filtered, 'cod_amount').toLocaleString() },
    { label: t.kpiDelFee, value: sumField(filtered, 'delivery_fee').toLocaleString() },
  ]

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
        input::placeholder,textarea::placeholder{color:#4d7a9b}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}
        tr:hover td{background:#0f2a42!important}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: FF.body, fontSize: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold, margin: 0, lineHeight: 1.2 }}>{t.title}</h1>
          <p style={{ fontFamily: FF.body, fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 0 }}>{t.subtitle}</p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border }}>
            <button
              type="button"
              onClick={() => setLang('EN')}
              style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'EN' ? C.panelHover : 'transparent', color: lang === 'EN' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('MM')}
              style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'MM' ? C.panelHover : 'transparent', color: lang === 'MM' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            >
              မြန်မာ
            </button>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, color: C.text2, fontSize: 13, fontFamily: FF.body, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            <RefreshCw size={14} /> {t.refresh}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 32, height: 32, border: '3px solid ' + C.border, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}

      {loadError ? (
        <div style={{ background: '#4a0521', border: '1px solid #831843', borderRadius: 10, padding: '12px 18px', marginBottom: 16, color: C.error, fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        {kpis.map(({ label, value }) => (
          <div key={label} style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.gold }}>{loading ? '—' : value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, alignItems: 'end' }}>
          <SelectBox label={t.filterTownship} value={townFilter} onChange={setTownFilter} options={[ALL, ...uniqueTownships]} allLabel={t.all} />
          <SelectBox label={t.filterStatus} value={statusFilter} onChange={setStatusFilter} options={DELIVERY_STATUSES} allLabel={t.all} />
          <div />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: C.gold, color: '#1a0a00', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: FF.body, fontWeight: 700, cursor: 'pointer' }}>
              <Truck size={14} /> {t.btnDispatch}
            </button>
            <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: C.orange, color: '#1a0a00', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: FF.body, fontWeight: 700, cursor: 'pointer' }}>
              <CheckSquare size={14} /> {t.btnConfirm}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading || filtered.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, color: C.text2, fontSize: 13, fontFamily: FF.body, fontWeight: 600, cursor: loading || filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || filtered.length === 0 ? 0.55 : 1 }}
            >
              <Download size={14} /> {t.btnDownload}
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: 0 }}>{t.invTitle}</h2>
          <span style={{ fontSize: 13, color: C.muted }}>{t.rowsCount(filtered.length)}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FF.body }}>
            <thead>
              <tr>
                {[t.colId, t.colMerch, t.colRecv, t.colTown, t.colStat, t.colCod, t.colFee].map(col => (
                  <th key={col} style={{ padding: '10px 14px', background: C.panel2, color: C.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22', textAlign: 'center' }}>{t.msgLoading}</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px 14px', fontSize: 13.5, color: C.error, borderBottom: '1px solid ' + C.border + '22', textAlign: 'center' }}>{loadError}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22', textAlign: 'center' }}>{t.msgEmpty}</td>
                </tr>
              ) : filtered.map((row, i) => (
                <tr key={row.id ?? row.workflow_id ?? i} style={{ background: i % 2 === 0 ? C.panel : C.panel2 }}>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.info, borderBottom: '1px solid ' + C.border + '22', fontFamily: 'monospace' }}>{row.workflow_id ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22' }}>{row.merchant_name ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22' }}>{row.receiver ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22' }}>{row.township ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22' }}><span style={statusStyle(row.status ?? '')}>{formatStatus(row.status ?? '—')}</span></td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.gold, borderBottom: '1px solid ' + C.border + '22', fontWeight: 600 }}>{row.cod_amount != null ? toNumber(row.cod_amount).toLocaleString() : '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13.5, color: C.text2, borderBottom: '1px solid ' + C.border + '22' }}>{row.delivery_fee != null ? toNumber(row.delivery_fee).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
