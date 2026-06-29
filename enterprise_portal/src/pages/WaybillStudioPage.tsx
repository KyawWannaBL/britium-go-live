// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  Printer, Download, RefreshCw, Search, Package, CheckCircle2,
  Tag, QrCode, Truck, DollarSign, FileText, BarChart2, Layers,
  Archive, ArrowRight, Lock, CheckCheck, Box, Scan, Copy
} from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

interface ParcelRow {
  id: string
  tracking_no: string | null
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

const WAYBILL_STATUSES = [
  { key: 'Printed',          label: 'Printed',          color: '#9ca3af',  bg: 'rgba(156,163,175,0.15)' },
  { key: 'Picked Up',        label: 'Picked Up',        color: '#60a5fa',  bg: 'rgba(96,165,250,0.15)'  },
  { key: 'Received',         label: 'Received',         color: '#2dd4bf',  bg: 'rgba(45,212,191,0.15)'  },
  { key: 'In Warehouse',     label: 'In Warehouse',     color: '#818cf8',  bg: 'rgba(129,140,248,0.15)' },
  { key: 'Sorting',          label: 'Sorting',          color: '#c084fc',  bg: 'rgba(192,132,252,0.15)' },
  { key: 'Bagged',           label: 'Bagged',           color: '#e879f9',  bg: 'rgba(232,121,249,0.15)' },
  { key: 'Dispatched',       label: 'Dispatched',       color: '#22d3ee',  bg: 'rgba(34,211,238,0.15)'  },
  { key: 'Out for Delivery', label: 'Out for Delivery', color: '#fbbf24',  bg: 'rgba(251,191,36,0.15)'  },
  { key: 'Delivered',        label: 'Delivered',        color: '#34d399',  bg: 'rgba(52,211,153,0.15)'  },
  { key: 'Failed Attempt',   label: 'Failed Attempt',   color: '#f87171',  bg: 'rgba(248,113,113,0.15)' },
  { key: 'Returned',         label: 'Returned',         color: '#fbbf24',  bg: 'rgba(251,191,36,0.12)'  },
  { key: 'Finance Pending',  label: 'Finance Pending',  color: '#fb923c',  bg: 'rgba(251,146,60,0.15)'  },
  { key: 'Closed',           label: 'Closed',           color: '#10b981',  bg: 'rgba(16,185,129,0.15)'  },
]

const CLOSE_CONDITIONS = [
  'Shipment delivered, returned, or cancelled',
  'POD or failure proof captured and validated',
  'COD status = Settled or Not Applicable',
  'Rider handover verified',
  'Merchant settlement generated or Not Required',
  'Invoice status = Issued, Paid, or On Hold',
  'No unresolved warehouse exceptions',
  'Finance locked the waybill record',
]

const WAYBILL_FIELDS = [
  { field: 'Waybill No',         desc: 'Unique waybill identifier — W{MMDD}-{MERCHANT_3}-{SEQ}'      },
  { field: 'Pickup ID',          desc: 'Links to the originating pickup request'                     },
  { field: 'Deliver ID',         desc: 'Links to the delivery workflow record'                       },
  { field: 'Invoice No',         desc: 'Paired invoice — I{MMDD}-{MERCHANT_3}-{SEQ}'                 },
  { field: 'Merchant ID/Code',   desc: 'Merchant account identifier and 3-char code'                 },
  { field: 'Sender',             desc: 'Sender name from merchant profile'                           },
  { field: 'Receiver',           desc: 'Recipient name for delivery'                                 },
  { field: 'Pickup Address',     desc: 'Origin address for parcel collection'                        },
  { field: 'Delivery Address',   desc: 'Destination address for parcel delivery'                     },
  { field: 'Parcel Count',       desc: 'Number of parcels in the shipment'                           },
  { field: 'Weight (Actual)',    desc: 'Physical weight measured at warehouse (kg)'                  },
  { field: 'Weight (Chargeable)',desc: 'Greater of actual weight vs volumetric weight'               },
  { field: 'COD Amount',         desc: 'Cash on delivery amount to collect from recipient'           },
  { field: 'Delivery Fee',       desc: 'Fee calculated from tariff master'                           },
  { field: 'Payment Method',     desc: 'PREPAID / COD / CREDIT'                                      },
  { field: 'Barcode/QR',         desc: 'Scannable identifier for warehouse and rider ops'            },
  { field: 'Proof Type',         desc: 'POD / PHOTO / SIGNATURE / E-SIGNATURE'                       },
  { field: 'Status',             desc: 'Current pipeline status (see status stepper above)'          },
]

const NETWORK_USES = [
  { icon: Tag,          label: 'Label Printing',       color: '#60a5fa' },
  { icon: Scan,         label: 'Warehouse Scanning',   color: '#34d399' },
  { icon: Archive,      label: 'Bag Scan / Dispatch',  color: '#c084fc' },
  { icon: Truck,        label: 'Rider Delivery',        color: '#fbbf24' },
  { icon: DollarSign,   label: 'COD Collection',        color: '#F5C842' },
  { icon: CheckCheck,   label: 'POD Validation',        color: '#2dd4bf' },
  { icon: FileText,     label: 'Invoice Matching',      color: '#fb923c' },
  { icon: BarChart2,    label: 'Merchant Settlement',   color: '#e879f9' },
  { icon: Layers,       label: 'Audit Trail',           color: '#94a3b8' },
]

function statusStyle(raw: string | null) {
  const key = (raw ?? '').toLowerCase().replace(/_/g, ' ')
  const match = WAYBILL_STATUSES.find(s => s.key.toLowerCase() === key)
  return match
    ? { bg: match.bg, color: match.color }
    : { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }
}

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function fmtCOD(n: number | null) {
  if (n == null || n === 0) return '—'
  return Number(n).toLocaleString()
}

function WaybillLabel({ row }: { row: ParcelRow }) {
  const tracking = row.tracking_no ?? 'BE-000000'
  const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(tracking)}&size=90x90&bgcolor=ffffff&color=000000&margin=2`

  const fmtMoney = (n: number | null | undefined) =>
    n != null && n > 0 ? Number(n).toLocaleString() : '0'

  const S: Record<string, React.CSSProperties> = {
    label: {
      width: '105mm', minHeight: '148mm', background: '#fff',
      border: '1px solid #ddd', fontFamily: "'Helvetica Neue', Helvetica, Arial, 'Noto Sans Myanmar', sans-serif",
      fontSize: 11, color: '#111', boxSizing: 'border-box', padding: '3mm 4mm',
      display: 'flex', flexDirection: 'column',
    },
    header: { display: 'flex', alignItems: 'flex-start', gap: 6, paddingBottom: '3mm' },
    logoCircle: {
      width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #222',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      overflow: 'hidden',
    },
    companyBlock: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 4 },
    companyName:  { fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', margin: 0, lineHeight: 1.2 },
    serviceName:  { fontSize: 9,  fontWeight: 400, letterSpacing: '0.04em', margin: '2px 0 0', textTransform: 'uppercase' },
    hotline:      { fontSize: 9,  fontWeight: 400, margin: '2px 0 0', color: '#444' },
    qrBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
    trackingSmall: { fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.05em', color: '#333', textAlign: 'right' },
    qrImg: { width: 56, height: 56, display: 'block' },
    divider: { height: 1, background: '#ccc', margin: '2mm 0' },
    body: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2mm' },
    fieldRow: { display: 'flex', gap: 4 },
    fieldLabel: { fontSize: 9, color: '#666', flexShrink: 0, width: 52, fontWeight: 500 },
    fieldValue: { fontSize: 11, color: '#111', flex: 1, fontWeight: 400, lineHeight: 1.35 },
    recipientName: { fontSize: 13, fontWeight: 600, color: '#111', marginTop: 1 },
    recipientDetail: { fontSize: 11, color: '#333', lineHeight: 1.4, marginTop: 1 },
    footer: { marginTop: 'auto' },
    footerRow: { display: 'flex', alignItems: 'stretch', gap: '3mm', marginTop: '2mm' },
    pricingBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5mm' },
    priceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    priceLabel: { fontSize: 9, color: '#555' },
    priceValue: { fontSize: 9, fontFamily: 'monospace', color: '#111', fontWeight: 500, textAlign: 'right' },
    codBox: {
      width: 52, borderRadius: 6, background: '#d8d8d8', border: '1px solid #aaa',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '3mm 2mm', flexShrink: 0, position: 'relative',
    },
    codTopLeft:  { position: 'absolute', top: 3, left: 5, fontSize: 7, fontWeight: 600, textTransform: 'uppercase' },
    codTopRight: { position: 'absolute', top: 3, right: 5, fontSize: 7, fontWeight: 600 },
    codAmount:   { fontSize: 16, fontWeight: 700, color: '#111', marginTop: 8, letterSpacing: '-0.01em' },
    hotlineMsg: {
      marginTop: '2mm', fontSize: 8, color: '#555', lineHeight: 1.4,
      borderTop: '1px solid #e8e8e8', paddingTop: '2mm',
    },
  }

  return (
    <div style={S.label}>
      <div style={S.header}>
        <div style={{ ...S.logoCircle, overflow: 'hidden' }}>
          <img
            src="/logo.png"
            alt="BE"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={S.companyBlock}>
          <p style={S.companyName}>BRITIUM EXPRESS</p>
          <p style={S.serviceName}>Delivery Service</p>
          <p style={S.hotline}>HotLine : +95-9-897447711</p>
        </div>
        <div style={S.qrBlock}>
          <span style={S.trackingSmall}>{tracking}</span>
          <img src={qrUrl} alt={tracking} style={S.qrImg} crossOrigin="anonymous" />
          <span style={S.trackingSmall}>{tracking}</span>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.body}>
        <div style={S.fieldRow}>
          <span style={S.fieldLabel}>Merchant :</span>
          <span style={S.fieldValue}>—</span>
        </div>

        <div>
          <div style={S.fieldRow}>
            <span style={{ ...S.fieldLabel, paddingTop: 2 }}>Recipient :</span>
            <div style={{ flex: 1 }}>
              <p style={S.recipientName}>{row.recipient_name ?? '—'}</p>
              <p style={S.recipientDetail}>{row.recipient_phone ?? '—'}</p>
              {row.delivery_township && (
                <p style={S.recipientDetail}>{row.delivery_township}</p>
              )}
              {row.delivery_address && (
                <p style={{ ...S.recipientDetail, fontSize: 10 }}>{row.delivery_address}</p>
              )}
            </div>
          </div>
        </div>

        <div style={S.divider} />

        <div style={S.fieldRow}>
          <span style={S.fieldLabel}>Remarks :</span>
          <span style={{ ...S.fieldValue, color: '#777', fontStyle: 'italic', fontSize: 9 }}>—</span>
        </div>
      </div>

      <div style={S.footer}>
        <div style={S.divider} />
        <div style={S.footerRow}>
          <div style={S.pricingBlock}>
            <div style={S.priceRow}>
              <span style={S.priceLabel}>Item Price :</span>
              <span style={S.priceValue}>{fmtMoney(row.item_value)}</span>
            </div>
            <div style={S.priceRow}>
              <span style={S.priceLabel}>Delivery Fees :</span>
              <span style={S.priceValue}>—</span>
            </div>
            <div style={S.priceRow}>
              <span style={S.priceLabel}>Prepaid Amount :</span>
              <span style={S.priceValue}>
                {row.payment_method === 'PREPAID' ? fmtMoney(row.item_value) : '0'}
              </span>
            </div>
          </div>

          <div style={S.codBox}>
            <span style={S.codTopLeft}>COD</span>
            <span style={S.codTopRight}>MMK</span>
            <span style={S.codAmount}>{fmtMoney(row.cod_amount)}</span>
          </div>
        </div>

        <p style={S.hotlineMsg}>
          ဘောက်ချာပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။
        </p>
      </div>
    </div>
  )
}

export default function WaybillStudioPage() {
  const [rows, setRows]           = useState<ParcelRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [lastSync, setLastSync]   = useState(new Date())
  const [printTarget, setPrintTarget] = useState<string | null>(null) // Used for isolating single print

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('parcel_rows')
        .select('id, tracking_no, recipient_name, recipient_phone, delivery_address, delivery_township, cod_amount, status, created_at, weight_kg, item_value, payment_method')
        .order('created_at', { ascending: false })
        .limit(200)
      setRows((data ?? []) as ParcelRow[])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
      setLastSync(new Date())
    }
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])

  const filtered = (rows ?? []).filter(r => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      String(r.tracking_no     ?? '').toLowerCase().includes(q) ||
      String(r.recipient_name  ?? '').toLowerCase().includes(q) ||
      String(r.recipient_phone ?? '').toLowerCase().includes(q) ||
      String(r.delivery_address ?? '').toLowerCase().includes(q)
    )
  })

  // Bulk CSV Actions
  const handleDownloadCSV = () => {
    if (filtered.length === 0) return
    const headers = ['Tracking No', 'Recipient Name', 'Phone', 'Status', 'Created', 'Delivery Address', 'COD Amount'].join(',')
    const csvData = filtered.map(r => [
      r.tracking_no ?? '',
      `"${(r.recipient_name ?? '').replace(/"/g, '""')}"`,
      r.recipient_phone ?? '',
      r.status ?? '',
      r.created_at?.split('T')[0] ?? '',
      `"${(r.delivery_address ?? '').replace(/"/g, '""')}"`,
      r.cod_amount ?? '',
    ].join(','))
    const blob = new Blob([headers + '\n' + csvData.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'waybill_print_queue.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Row-Level Actions 
  const handleDownloadSingleCSV = (row: ParcelRow) => {
    const headers = ['Tracking No', 'Recipient Name', 'Phone', 'Status', 'Created', 'Delivery Address', 'COD Amount'].join(',')
    const csvData = [
      row.tracking_no ?? '',
      `"${(row.recipient_name ?? '').replace(/"/g, '""')}"`,
      row.recipient_phone ?? '',
      row.status ?? '',
      row.created_at?.split('T')[0] ?? '',
      `"${(row.delivery_address ?? '').replace(/"/g, '""')}"`,
      row.cod_amount ?? '',
    ].join(',')
    const blob = new Blob([headers + '\n' + csvData], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `waybill_${row.tracking_no}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Print Orchestration
  const handlePrintAll = () => {
    setPrintTarget(null);
    setTimeout(() => window.print(), 50);
  }

  const handlePrintSingle = (id: string) => {
    setPrintTarget(id);
    setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 50);
  }

  const totalCod = filtered.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0)
  const printedRows = filtered.filter((row) => String(row.status || '').toLowerCase() === 'printed').length
  const openCodRows = filtered.filter(r => (r.cod_amount ?? 0) > 0 && r.status !== 'Closed').length

  // Determine which waybills to loop through in the print canvas
  const printItems = printTarget ? rows.filter(r => r.id === printTarget) : (filtered.length > 0 ? filtered : rows)

  return (
    <div style={root()} className="print-root">
      
      {/* Dynamic Print CSS Overrides */}
      <style>{`
        .waybill-print-area { display: none; }
        @media print {
          .no-print { display: none !important; }
          .waybill-print-area { display: block !important; width: 105mm; }
          body, .print-root { background: #fff !important; padding: 0 !important; margin: 0 !important; }
          .waybill-label-page { page-break-after: always; break-after: page; }
          @page { size: 105mm 148mm; margin: 0mm; }
        }
      `}</style>

      {/* Main Studio Shell */}
      <div style={shell()} className="no-print">
        <section style={heroCard()}>
          <div style={heroGlow()} />
          <div style={heroTop()}>
            <div>
              <p style={eyebrow()}>DATA ENTRY OPERATIONS</p>
              <h1 style={h1()}>Waybill Studio</h1>
              <p style={bodyCopy()}>Label generation · Print queue · Pipeline tracking · Network usage</p>
            </div>
            <button
              onClick={() => void loadRows()}
              disabled={loading}
              style={secondaryBtn()}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div style={heroMetaGrid()}>
            <div style={heroBadge(C.gold)}>
              <p style={metaKicker(C.gold)}>WAYBILL FORMAT</p>
              <p style={metaMono()}>W{'{MMDD}'}-{'{MERCHANT_CODE_3}'}-{'{SEQUENCE}'}</p>
              <p style={metaHint()}><span style={{ color: C.gold }}>Example:</span> W0525-BBK-015</p>
            </div>
            <div style={heroBadge(C.info)}>
              <p style={metaKicker(C.info)}>INVOICE FORMAT</p>
              <p style={metaMono()}>I{'{MMDD}'}-{'{MERCHANT_CODE_3}'}-{'{SEQUENCE}'}</p>
              <p style={metaHint()}><span style={{ color: C.info }}>Example:</span> I0525-BBK-015</p>
            </div>
          </div>
        </section>

        <section style={statsGrid()} className="grid-cols-5 max-[980px]:grid-cols-2 max-[620px]:grid-cols-1">
          <KpiCard label="Loaded Rows" value={rows.length} tone={C.info} icon={Package} />
          <KpiCard label="Filtered Queue" value={filtered.length} tone={C.gold} icon={Printer} />
          <KpiCard label="Printed Status" value={printedRows} tone={C.success} icon={CheckCircle2} />
          <KpiCard label="Open COD Rows" value={openCodRows} tone={C.warning} icon={DollarSign} />
          <KpiCard label="Queue COD Total" value={fmtCOD(totalCod)} tone={C.orange} icon={BarChart2} />
        </section>

        <section style={panel()}>
          <div style={sectionHeader()}>
            <div style={titleRow()}>
              <ArrowRight size={16} color={C.gold} />
              <h2 style={h2()}>Waybill Status Pipeline</h2>
            </div>
          </div>
          <div style={statusFlow()}>
            {WAYBILL_STATUSES.map(({ key, label, color, bg }, idx) => {
              const isBranch = key === 'Failed Attempt' || key === 'Returned'
              return (
                <div key={key} style={sx({ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' })}>
                  {isBranch && <span style={dividerPipe()}>|</span>}
                  <div style={statusChip(bg, color)}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
                    <span style={statusText(color)}>{label}</span>
                  </div>
                  {idx < WAYBILL_STATUSES.length - 1 && !isBranch && <ArrowRight size={10} color={C.muted} />}
                </div>
              )
            })}
          </div>
        </section>

        <div style={twoCol()} className="grid-cols-2 max-[1120px]:grid-cols-1">
          <section style={panel()}>
            <div style={sectionHeader()}>
              <div style={titleRow()}>
                <Lock size={16} color={C.gold} />
                <h2 style={h2()}>Waybill Close Conditions</h2>
              </div>
            </div>
            <p style={smallMuted()}>All 8 conditions must be satisfied before Finance can lock and close a waybill.</p>
            <div style={sx({ display: 'grid', gap: 10, marginTop: 14 })}>
              {CLOSE_CONDITIONS.map((cond, i) => (
                <div key={i} style={conditionRow()}>
                  <div style={conditionIndex()}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={conditionIcon()}><CheckCircle2 size={12} color={C.success} /></div>
                  <div style={conditionText()}>{cond}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={panel()}>
            <div style={sectionHeader()}>
              <div style={titleRow()}>
                <QrCode size={16} color={C.gold} />
                <h2 style={h2()}>Waybill Fields</h2>
              </div>
            </div>
            <div style={tableWrap(340)}>
              <table style={table()}>
                <thead>
                  <tr>
                    <th style={th()}>Field</th>
                    <th style={th()}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {WAYBILL_FIELDS.map(({ field, desc }) => (
                    <tr key={field}>
                      <td style={td({ color: C.gold, whiteSpace: 'nowrap' })}>{field}</td>
                      <td style={td()}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section style={panel({ padding: 0, overflow: 'hidden' })}>
          <div style={toolbar()}>
            <div style={titleRow()}>
              <Printer size={16} color={C.gold} />
              <h2 style={h2()}>Print Queue</h2>
              <span style={pill(C.gold)}>{loading ? '…' : `${filtered.length} rows`}</span>
            </div>
            <div style={toolbarActions()}>
              <div style={searchWrap()}>
                <Search size={14} style={sx({ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted })} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search waybills…"
                  style={input({ width: 200, paddingLeft: 36 })}
                />
              </div>
              <button
                onClick={handleDownloadCSV}
                disabled={filtered.length === 0}
                style={secondaryBtn({ opacity: filtered.length === 0 ? 0.45 : 1 })}
              >
                <Download size={14} />CSV
              </button>
              <button
                onClick={handlePrintAll}
                disabled={filtered.length === 0}
                style={primaryBtn({ opacity: filtered.length === 0 ? 0.45 : 1 })}
              >
                <Printer size={14} />Print All
              </button>
            </div>
          </div>

          <div style={tableWrap()}>
            <table style={table({ minWidth: 1220 })}>
              <thead>
                <tr>
                  {['#', 'Tracking No', 'Recipient Name', 'Status', 'Created', 'Delivery Address', 'Phone', 'COD Amount', 'Actions'].map(col => (
                    <th key={col} style={th()}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={emptyCell()}>
                      <div style={loadingWrap()}>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Loading waybills…</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={emptyCell()}>
                      <Package size={28} style={{ marginBottom: 10, color: C.muted, marginInline: 'auto' }} />
                      <div style={emptyTitle()}>No waybills in print queue</div>
                      <div style={emptySub()}>{search ? 'Try adjusting your search.' : 'Generate waybills from a pickup request.'}</div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => {
                    const sc = statusStyle(row.status)
                    return (
                      <tr key={row.id}>
                        <td style={td({ color: C.muted })}>{i + 1}</td>
                        <td style={td({ color: C.gold, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700 })}>{row.tracking_no ?? '—'}</td>
                        <td style={td({ color: C.text })}>{row.recipient_name ?? '—'}</td>
                        <td style={td()}>
                          <span style={statusPill(sc.bg, sc.color)}>{row.status ?? '—'}</span>
                        </td>
                        <td style={td()}>{fmtDate(row.created_at)}</td>
                        <td style={td({ maxWidth: 220 })}>{row.delivery_address ?? row.delivery_township ?? '—'}</td>
                        <td style={td({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' })}>{row.recipient_phone ?? '—'}</td>
                        <td style={td({ color: C.gold, fontWeight: 700 })}>{fmtCOD(row.cod_amount)}</td>
                        <td style={td()}>
                          <div style={rowActions()}>
                            <button
                              onClick={() => handlePrintSingle(row.id)}
                              style={tinyBtn(C.gold)}
                              title="Print specific waybill"
                            >
                              <Printer size={10} />Print
                            </button>
                            <button
                              onClick={() => handleDownloadSingleCSV(row)}
                              style={tinyBtn(C.info)}
                              title="Download single CSV row"
                            >
                              <Download size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div style={footerBar()}>
              <p style={footerMeta()}>Showing {filtered.length} of {rows.length} waybills · Synced {lastSync.toLocaleTimeString()}</p>
              <p style={footerMeta()}>COD pending: {openCodRows} rows</p>
            </div>
          )}
        </section>

        <section style={panel()}>
          <div style={sectionHeader()}>
            <div style={titleRow()}>
              <Box size={16} color={C.gold} />
              <h2 style={h2()}>Waybill Usage Across Network</h2>
            </div>
          </div>
          <div style={usageGrid()} className="grid-cols-9 max-[1120px]:grid-cols-5 max-[760px]:grid-cols-3 max-[520px]:grid-cols-2">
            {NETWORK_USES.map(({ icon: Icon, label, color }, idx) => (
              <div key={label} style={usageCard(color)}>
                <span style={usageIndex(color)}>{idx + 1}</span>
                <div style={usageIconWrap(color)}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p style={usageLabel()}>{label}</p>
              </div>
            ))}
          </div>
          <div style={networkNote()}>
            Every waybill follows the same 9-step network lifecycle — from label printing through merchant settlement and final audit trail. The waybill number
            (<span style={{ color: C.gold }}> W{'{MMDD}'}-{'{CODE}'}-{'{SEQ}'}</span>) and paired invoice number (<span style={{ color: C.info }}> I{'{MMDD}'}-{'{CODE}'}-{'{SEQ}'}</span>) are scanned and validated at each stage.
          </div>
        </section>

        <div style={footerWrap()}>
          <p style={footerMeta()}>BRITIUM EXPRESS · WAYBILL STUDIO · v2.0</p>
          <p style={footerMeta()}>Last sync: {lastSync.toLocaleString()}</p>
        </div>
      </div>

      {/* 🖨️ Isolate the A6 Print Media Overlay Block */}
      <div className="waybill-print-area" aria-hidden="true">
        {printItems.map(row => (
          <div key={row.id} className="waybill-label-page">
            <WaybillLabel row={row} />
          </div>
        ))}
      </div>
      
    </div>
  )
}

function KpiCard({ label, value, tone, icon: Icon }: any) {
  return (
    <div style={kpiCard()}>
      <div style={kpiTop()}>
        <div style={iconChip(tone)}><Icon size={16} color={tone} /></div>
        <span style={metaLabel()}>{label}</span>
      </div>
      <div style={kpiValue(tone)}>{value}</div>
    </div>
  )
}

// Fixed UI/Layout functions
function sx(style: React.CSSProperties) { return style }
function root() { return sx({ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body, color: C.text }) }
function shell() { return sx({ display: 'grid', gap: 18 }) }
function heroCard() { return sx({ position: 'relative', overflow: 'hidden', borderRadius: 26, padding: 24, background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, boxShadow: '0 22px 60px rgba(0,0,0,.28)' }) }
function heroGlow() { return sx({ position: 'absolute', top: -110, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(246,184,75,.16), transparent 70%)', pointerEvents: 'none' }) }
function heroTop() { return sx({ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }) }
function heroMetaGrid() { return sx({ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 22 }) }
function heroBadge(color: string) { return sx({ minWidth: 280, flex: '1 1 320px', padding: 16, borderRadius: 18, background: `${color}12`, border: `1px solid ${color}33` }) }

// Removed hardcoded grid overrides so tailwind breakpoints work 
function statsGrid() { return sx({ display: 'grid', gap: 12 }) }
function twoCol() { return sx({ display: 'grid', gap: 16 }) }
function usageGrid() { return sx({ display: 'grid', gap: 10 }) }

function panel(extra: React.CSSProperties = {}) { return sx({ border: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, borderRadius: 22, padding: 18, boxShadow: '0 16px 40px rgba(0,0,0,.20)', ...extra }) }
function sectionHeader() { return sx({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }) }
function titleRow() { return sx({ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }) }
function toolbar() { return sx({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '18px 18px 14px', borderBottom: `1px solid ${C.border}` }) }
function toolbarActions() { return sx({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }) }
function searchWrap() { return sx({ position: 'relative' }) }
function tableWrap(maxHeight?: number) { return sx({ overflow: 'auto', maxHeight, background: 'rgba(8,27,46,.35)' }) }
function table(extra: React.CSSProperties = {}) { return sx({ width: '100%', borderCollapse: 'separate', borderSpacing: 0, ...extra }) }
function th() { return sx({ padding: '12px 14px', background: C.panel2, color: C.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontFamily: FF.body, position: 'sticky', top: 0 }) }
function td(extra: React.CSSProperties = {}) { return sx({ padding: '12px 14px', fontSize: 14, color: C.text2, borderBottom: `1px solid ${C.border}55`, fontFamily: FF.body, verticalAlign: 'top', ...extra }) }
function emptyCell() { return sx({ padding: '48px 16px', textAlign: 'center', color: C.text2 }) }
function loadingWrap() { return sx({ display: 'inline-flex', alignItems: 'center', gap: 10, color: C.text2, fontSize: 14 }) }
function emptyTitle() { return sx({ fontSize: 14, fontWeight: 600, color: C.text }) }
function emptySub() { return sx({ fontSize: 13, color: C.muted, marginTop: 6 }) }
function footerBar() { return sx({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 18px 16px', borderTop: `1px solid ${C.border}` }) }
function footerWrap() { return sx({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }) }
function footerMeta() { return sx({ fontSize: 11, color: C.muted, fontFamily: FF.body }) }
function h1() { return sx({ margin: '6px 0 0', fontSize: 20, fontWeight: 700, textTransform: 'uppercase', color: C.gold, letterSpacing: '.12em', fontFamily: FF.body }) }
function h2() { return sx({ margin: 0, fontSize: 18, fontWeight: 600, color: C.text, fontFamily: FF.sub }) }
function bodyCopy() { return sx({ margin: '8px 0 0', fontSize: 14, color: C.text2, lineHeight: 1.7 }) }
function eyebrow() { return sx({ margin: 0, color: C.orange, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.28em' }) }
function metaKicker(color: string) { return sx({ margin: 0, color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em' }) }
function metaMono() { return sx({ margin: '8px 0 0', color: C.text, fontSize: 14, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }) }
function metaHint() { return sx({ margin: '8px 0 0', color: C.text2, fontSize: 13 }) }
function metaLabel() { return sx({ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.1em' }) }
function smallMuted() { return sx({ margin: 0, color: C.text2, fontSize: 14, lineHeight: 1.7 }) }
function iconChip(color: string) { return sx({ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${color}16`, border: `1px solid ${color}33` }) }
function kpiCard() { return sx({ border: `1px solid ${C.border}`, background: `linear-gradient(180deg, rgba(8,27,46,.92), rgba(11,34,54,.98))`, borderRadius: 18, padding: 16 }) }
function kpiTop() { return sx({ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }) }
function kpiValue(color: string) { return sx({ fontSize: 24, fontWeight: 700, color, lineHeight: 1.1, fontFamily: FF.body, wordBreak: 'break-word' }) }
function secondaryBtn(extra: React.CSSProperties = {}) { return sx({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, padding: '0 14px', borderRadius: 14, background: C.panel2, border: `1px solid ${C.border}`, color: C.text2, fontSize: 14, fontWeight: 600, fontFamily: FF.body, cursor: 'pointer', ...extra }) }
function primaryBtn(extra: React.CSSProperties = {}) { return sx({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, padding: '0 14px', borderRadius: 14, background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, border: `1px solid ${C.gold}`, color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: FF.body, cursor: 'pointer', ...extra }) }
function input(extra: React.CSSProperties = {}) { return sx({ height: 42, borderRadius: 14, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, padding: '0 14px', fontFamily: FF.body, fontSize: 14, ...extra }) }
function pill(color: string) { return sx({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 26, padding: '0 10px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}33`, color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }) }
function statusFlow() { return sx({ display: 'flex', flexWrap: 'wrap', gap: 8 }) }
function statusChip(bg: string, color: string) { return sx({ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: bg, border: `1px solid ${color}33` }) }
function statusText(color: string) { return sx({ fontSize: 11, fontWeight: 700, color, fontFamily: FF.body, textTransform: 'uppercase', letterSpacing: '.05em' }) }
function dividerPipe() { return sx({ color: C.muted, fontSize: 12 }) }
function conditionRow() { return sx({ display: 'grid', gridTemplateColumns: '34px 22px minmax(0,1fr)', alignItems: 'start', gap: 10, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, background: 'rgba(8,27,46,.56)' }) }
function conditionIndex() { return sx({ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', paddingTop: 2 }) }
function conditionIcon() { return sx({ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)' }) }
function conditionText() { return sx({ color: C.text, fontSize: 14, lineHeight: 1.6 }) }
function statusPill(bg: string, color: string) { return sx({ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 10px', background: bg, color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }) }
function rowActions() { return sx({ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }) }
function tinyBtn(color: string) { return sx({ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '0 10px', borderRadius: 10, background: `${color}12`, color, border: `1px solid ${color}33`, fontSize: 11, fontWeight: 700, fontFamily: FF.body, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.05em' }) }
function usageCard(color: string) { return sx({ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16, borderRadius: 16, background: `${color}10`, border: `1px solid ${color}25`, textAlign: 'center' }) }
function usageIndex(color: string) { return sx({ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', padding: '2px 8px', borderRadius: 999, background: C.bg, color, border: `1px solid ${color}33`, fontSize: 10, fontWeight: 700 }) }
function usageIconWrap(color: string) { return sx({ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${color}18`, border: `1px solid ${color}2d`, marginTop: 4 }) }
function usageLabel() { return sx({ margin: 0, fontSize: 12, lineHeight: 1.4, color: C.text2, fontWeight: 500 }) }
function networkNote() { return sx({ marginTop: 16, padding: 14, borderRadius: 16, background: 'rgba(246,184,75,.07)', border: `1px solid rgba(246,184,75,.18)`, color: C.text2, fontSize: 14, lineHeight: 1.7 }) }