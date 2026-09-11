import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Filter,
  Loader2,
  PackageCheck,
  PackageSearch,
  PrinterCheck,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  Warehouse,
} from 'lucide-react';

const BUILD_MARKER = 'WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30';

type WarehouseStatus = 'PENDING' | 'RECEIVED' | 'WAREHOUSE_READY' | 'WAREHOUSE_EXCEPTION';
type RowFilter = 'ALL' | WarehouseStatus | 'LABEL_QA_PENDING';

type PickupSummary = {
  pickup_id: string;
  waybill_no?: string | null;
  expected_parcels?: number | null;
  scanned_parcels?: number | null;
  ready_parcels?: number | null;
  exception_parcels?: number | null;
  created_at?: string | null;
};

type ExceptionCode = {
  code: string;
  label: string;
  condition?: string | null;
};

type WarehouseRow = {
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id: string;
  batch_waybill_no?: string | null;
  merchant_name?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  township?: string | null;
  recipient_address?: string | null;
  destination?: string | null;
  item_price?: number | null;
  delivery_fee?: number | null;
  surcharge?: number | null;
  actual_collect?: number | null;
  declared_weight_kg?: number | null;
  actual_weight_kg?: number | null;
  remark?: string | null;
  warehouse_status?: WarehouseStatus | string | null;
  parcel_condition?: string | null;
  discrepancy_code?: string | null;
  discrepancy_name?: string | null;
  discrepancy_remark?: string | null;
  warehouse_code?: string | null;
  staging_zone?: string | null;
  scanned_at?: string | null;
  scanned_by?: string | null;
  ready_at?: string | null;
  ready_by?: string | null;
  label_scan_attempts?: number | null;
  label_scan_passed?: boolean | null;
  qa_approved_at?: string | null;
  qa_approved_by?: string | null;
};

type WarehouseStats = {
  expected?: number;
  scanned?: number;
  ready?: number;
  exceptions?: number;
  remaining?: number;
  label_qa_passed?: number;
  label_qa_pending?: number;
  total_collect?: number;
};

type WarehouseSnapshot = {
  selected_pickup_id?: string | null;
  pickups?: PickupSummary[];
  rows?: WarehouseRow[];
  stats?: WarehouseStats;
  exceptions?: ExceptionCode[];
};

const money = (value: unknown) => Number(value || 0).toLocaleString('en-US');
const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' }) : '—';

function readPickupContext() {
  const params = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes('?')
    ? new URLSearchParams(window.location.hash.split('?')[1])
    : new URLSearchParams();

  const direct =
    params.get('pickup_id') ||
    params.get('pickup') ||
    hashQuery.get('pickup_id') ||
    hashQuery.get('pickup');
  if (direct) return direct;

  for (const key of [
    'britium:last-created-waybill',
    'britium:last-waybill',
    'be:last-created-waybill',
  ]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const value = parsed?.pickup_id || parsed?.pickupId || parsed?.pickup;
      if (value) return String(value);
    } catch {
      if (/^P\d/i.test(raw.trim())) return raw.trim();
    }
  }
  return '';
}

function statusTone(status?: string | null) {
  switch (String(status || 'PENDING').toUpperCase()) {
    case 'WAREHOUSE_READY':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'RECEIVED':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-300';
    case 'WAREHOUSE_EXCEPTION':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
    default:
      return 'border-slate-600 bg-slate-800/50 text-slate-300';
  }
}

export default function WarehousePage() {
  const [snapshot, setSnapshot] = useState<WarehouseSnapshot>({});
  const [selectedPickupId, setSelectedPickupId] = useState(readPickupContext());
  const [loading, setLoading] = useState(false);
  const [busyWayId, setBusyWayId] = useState('');
  const [message, setMessage] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RowFilter>('ALL');
  const [warehouseCode, setWarehouseCode] = useState('YGN-MAIN');
  const [stagingZone, setStagingZone] = useState('INTAKE');
  const [actualWeight, setActualWeight] = useState('');
  const [exceptionCode, setExceptionCode] = useState('WAYBILL_MISMATCH');
  const [exceptionRemark, setExceptionRemark] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const scanRef = useRef<HTMLInputElement | null>(null);

  const rows = snapshot.rows || [];
  const pickups = snapshot.pickups || [];
  const stats = snapshot.stats || {};
  const exceptions = snapshot.exceptions || [];

  const loadSnapshot = useCallback(async (pickupId?: string) => {
    setLoading(true);
    setMessage('');
    try {
      const { data, error } = await supabase.rpc('be_warehouse_receipt_snapshot_v36', {
        p_pickup_id: pickupId || null,
      });
      if (error) throw error;
      const next = (data || {}) as WarehouseSnapshot;
      setSnapshot(next);
      const resolved = String(next.selected_pickup_id || pickupId || '');
      if (resolved && resolved !== selectedPickupId) setSelectedPickupId(resolved);
      setMessage(
        resolved
          ? `${Number(next.stats?.expected || 0)} parcel row(s) loaded for ${resolved}.`
          : 'No Data Entry Waybill pickup is available for warehouse receipt.',
      );
    } catch (error: any) {
      setMessage(error?.message || 'Warehouse receipt data could not be loaded. Run the V36 SQL first.');
    } finally {
      setLoading(false);
      window.setTimeout(() => scanRef.current?.focus(), 80);
    }
  }, [selectedPickupId]);

  useEffect(() => {
    void loadSnapshot(selectedPickupId || undefined);
    // Deliberately run once; pickup changes are handled by the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actorEmail = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || null;
  };

  const runAction = async (
    action: 'RECEIVE' | 'READY' | 'EXCEPTION' | 'LABEL_PASS' | 'LABEL_FAIL' | 'RESET',
    wayId?: string,
  ) => {
    const target = String(wayId || scanCode || '').trim();
    if (!selectedPickupId) return setMessage('Select a Pickup ID first.');
    if (!target) return setMessage('Scan or enter a parcel Way ID first.');
    if (action === 'EXCEPTION' && !exceptionCode) return setMessage('Select an exception reason first.');

    setBusyWayId(target);
    setMessage('');
    try {
      const email = await actorEmail();
      const { data, error } = await supabase.rpc('be_warehouse_receive_scan_v36', {
        p_pickup_id: selectedPickupId,
        p_way_id: target,
        p_action: action,
        p_condition: action === 'EXCEPTION' ? 'HOLD' : 'GOOD',
        p_exception_code: action === 'EXCEPTION' ? exceptionCode : null,
        p_remark: action === 'EXCEPTION' ? exceptionRemark || null : null,
        p_actual_weight_kg: actualWeight.trim() ? Number(actualWeight) : null,
        p_warehouse_code: warehouseCode || 'YGN-MAIN',
        p_staging_zone: stagingZone || null,
        p_actor_email: email,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.message || 'Warehouse action was rejected.');
      setMessage(`${target}: ${data?.status || action} saved.`);
      setScanCode('');
      setActualWeight('');
      if (action !== 'EXCEPTION') setExceptionRemark('');
      await loadSnapshot(selectedPickupId);
    } catch (error: any) {
      setMessage(`${target}: ${error?.message || 'Warehouse action failed.'}`);
    } finally {
      setBusyWayId('');
      scanRef.current?.focus();
    }
  };

  const submitReceive = (event: FormEvent) => {
    event.preventDefault();
    void runAction('RECEIVE');
  };

  const receiveBatch = async () => {
    if (!selectedPickupId) return setMessage('Select a Pickup ID first.');
    const codes = [...new Set(batchInput.split(/[\n,;\t ]+/).map((v) => v.trim()).filter(Boolean))];
    if (!codes.length) return setMessage('Paste or scan one or more Way IDs into the batch box.');
    setLoading(true);
    setMessage('');
    try {
      const email = await actorEmail();
      const { data, error } = await supabase.rpc('be_warehouse_receive_batch_v36', {
        p_pickup_id: selectedPickupId,
        p_way_ids: codes,
        p_warehouse_code: warehouseCode || 'YGN-MAIN',
        p_staging_zone: stagingZone || null,
        p_actor_email: email,
      });
      if (error) throw error;
      setBatchInput('');
      setMessage(`Batch processed: ${Number(data?.accepted || 0)} received, ${Number(data?.failed || 0)} failed.`);
      await loadSnapshot(selectedPickupId);
    } catch (error: any) {
      setMessage(error?.message || 'Batch receipt failed.');
    } finally {
      setLoading(false);
    }
  };

  const markScannedReady = async () => {
    if (!selectedPickupId) return setMessage('Select a Pickup ID first.');
    setLoading(true);
    setMessage('');
    try {
      const email = await actorEmail();
      const { data, error } = await supabase.rpc('be_warehouse_mark_scanned_ready_v36', {
        p_pickup_id: selectedPickupId,
        p_staging_zone: stagingZone || null,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage(`${Number(data?.ready_count || 0)} scanned parcel(s) marked Warehouse Ready. Exceptions remain on hold.`);
      await loadSnapshot(selectedPickupId);
    } catch (error: any) {
      setMessage(error?.message || 'Could not release scanned parcels.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = String(row.warehouse_status || 'PENDING').toUpperCase();
      const filterMatch =
        filter === 'ALL' ||
        status === filter ||
        (filter === 'LABEL_QA_PENDING' && status !== 'PENDING' && !row.label_scan_passed);
      if (!filterMatch) return false;
      if (!q) return true;
      return [
        row.delivery_way_id,
        row.pickup_id,
        row.batch_waybill_no,
        row.merchant_name,
        row.recipient_name,
        row.recipient_phone,
        row.township,
        row.recipient_address,
        row.destination,
        row.discrepancy_code,
        row.discrepancy_name,
        row.discrepancy_remark,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [rows, search, filter]);

  const attentionRows = useMemo(
    () => rows.filter((row) => String(row.warehouse_status).toUpperCase() === 'WAREHOUSE_EXCEPTION'),
    [rows],
  );

  const openWaybillStudio = () => {
    const path = `${window.location.origin}${window.location.pathname}#/waybill-studio?pickup_id=${encodeURIComponent(selectedPickupId)}`;
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  const kpis = [
    ['Expected', stats.expected || 0, PackageSearch, 'text-amber-300'],
    ['Scanned', stats.scanned || 0, ScanLine, 'text-sky-300'],
    ['Warehouse Ready', stats.ready || 0, PackageCheck, 'text-emerald-300'],
    ['Exceptions', stats.exceptions || 0, ShieldAlert, 'text-rose-300'],
    ['Remaining', stats.remaining || 0, ClipboardCheck, 'text-slate-200'],
    ['Label QA Passed', stats.label_qa_passed || 0, PrinterCheck, 'text-violet-300'],
  ] as const;

  return (
    <main className="min-h-screen bg-[#061524] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-2xl">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#f6b84b]">
                <Warehouse size={16} /> Warehouse Receipt & Reconciliation
              </div>
              <h1 className="m-0 text-2xl font-black">Data Entry Waybill → Physical Warehouse Handoff</h1>
              <p className="mt-2 text-sm text-[#8fb4cf]">
                Scan the same Pickup ID and parcel Way IDs, reconcile physical count, isolate exceptions, and release valid parcels without blocking the rest.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void loadSnapshot(selectedPickupId)} disabled={loading} className="rounded-xl border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
                <RefreshCw size={15} className={`mr-2 inline ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={openWaybillStudio} disabled={!selectedPickupId} className="rounded-xl bg-[#f6b84b] px-4 py-2 text-sm font-black text-[#061524] disabled:opacity-50">
                <ExternalLink size={15} className="mr-2 inline" /> Waybill Studio
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px]">
            <label className="text-xs font-black uppercase tracking-wider text-[#8fb4cf]">
              Pickup / Waybill Batch
              <select
                value={selectedPickupId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedPickupId(value);
                  void loadSnapshot(value);
                }}
                className="mt-1 h-12 w-full rounded-xl border border-[#315577] bg-[#061524] px-3 text-sm font-bold text-white outline-none focus:border-[#f6b84b]"
              >
                {!pickups.length && <option value="">No pickup available</option>}
                {pickups.map((pickup) => (
                  <option key={pickup.pickup_id} value={pickup.pickup_id}>
                    {pickup.pickup_id} · {pickup.waybill_no || 'No batch no'} · {pickup.expected_parcels || 0} parcels
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-[#8fb4cf]">
              Warehouse
              <input value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-[#315577] bg-[#061524] px-3 text-sm font-bold text-white outline-none focus:border-[#f6b84b]" />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-[#8fb4cf]">
              Staging Zone
              <input value={stagingZone} onChange={(e) => setStagingZone(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-[#315577] bg-[#061524] px-3 text-sm font-bold text-white outline-none focus:border-[#f6b84b]" />
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {kpis.map(([label, value, Icon, tone]) => (
              <div key={label} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
                <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider ${tone}`}><Icon size={15} /> {label}</div>
                <div className="mt-2 text-3xl font-black">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-[#f6b84b]/30 bg-[#f6b84b]/10 px-4 py-3 text-sm font-bold text-[#f6d98f]">
            {message || `${BUILD_MARKER} · Total collect amount: ${money(stats.total_collect || 0)}`}
          </div>
        </section>

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,.75fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="m-0 flex items-center gap-2 text-lg font-black"><ScanLine className="text-[#f6b84b]" size={19} /> Single Parcel Scan</h2>
                <span className="rounded-full border border-[#315577] bg-[#061524] px-3 py-1 text-xs text-[#8fb4cf]">Scanner may submit Enter</span>
              </div>
              <form onSubmit={submitReceive} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_150px_auto]">
                <input
                  ref={scanRef}
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="Scan or type parcel Way ID"
                  className="h-12 rounded-xl border-2 border-[#315577] bg-[#061524] px-4 font-mono text-base font-black text-white outline-none focus:border-[#f6b84b]"
                />
                <input
                  value={actualWeight}
                  onChange={(e) => setActualWeight(e.target.value)}
                  inputMode="decimal"
                  placeholder="Actual kg (optional)"
                  className="h-12 rounded-xl border border-[#315577] bg-[#061524] px-3 text-sm font-bold text-white outline-none focus:border-[#f6b84b]"
                />
                <button type="submit" disabled={Boolean(busyWayId)} className="h-12 rounded-xl bg-sky-500 px-5 text-sm font-black text-[#04111d] disabled:opacity-50">
                  {busyWayId ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <ScanLine size={16} className="mr-2 inline" />} Receive
                </button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void runAction('READY')} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-[#04111d]">Mark Ready</button>
                <button onClick={() => void runAction('LABEL_PASS')} className="rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-2 text-sm font-bold text-violet-200">Label Scan Pass</button>
                <button onClick={() => void runAction('LABEL_FAIL')} className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-200">Label Scan Failed</button>
                <button onClick={() => void runAction('RESET')} className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200"><RotateCcw size={14} className="mr-1 inline" /> Reset Row</button>
              </div>
            </div>

            <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
              <h2 className="m-0 flex items-center gap-2 text-lg font-black"><AlertTriangle className="text-rose-300" size={19} /> Record Warehouse Exception</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-[230px_minmax(260px,1fr)_auto]">
                <select value={exceptionCode} onChange={(e) => setExceptionCode(e.target.value)} className="h-12 rounded-xl border border-rose-500/40 bg-[#061524] px-3 text-sm font-bold text-white outline-none">
                  {exceptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
                <input value={exceptionRemark} onChange={(e) => setExceptionRemark(e.target.value)} placeholder="Required discrepancy notes" className="h-12 rounded-xl border border-rose-500/40 bg-[#061524] px-3 text-sm font-bold text-white outline-none" />
                <button onClick={() => void runAction('EXCEPTION')} className="h-12 rounded-xl bg-rose-500 px-5 text-sm font-black text-white">Place on Hold</button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <h2 className="m-0 flex items-center gap-2 text-lg font-black"><ClipboardCheck className="text-[#f6b84b]" size={19} /> Batch Receipt</h2>
            <p className="mt-2 text-sm text-[#8fb4cf]">Paste scanner output, one Way ID per line. Only matching rows from the selected Pickup ID are accepted.</p>
            <textarea value={batchInput} onChange={(e) => setBatchInput(e.target.value)} rows={7} placeholder={'D0728-KNY-001\nD0728-TSW-002\nD0728-TSW-003'} className="mt-3 w-full rounded-2xl border border-[#315577] bg-[#061524] p-4 font-mono text-sm text-white outline-none focus:border-[#f6b84b]" />
            <button onClick={() => void receiveBatch()} disabled={loading} className="mt-3 w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-[#04111d] disabled:opacity-50">Receive Batch</button>
            <button onClick={() => void markScannedReady()} disabled={loading || !Number(stats.scanned || 0)} className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-[#04111d] disabled:opacity-50">Mark All Scanned as Warehouse Ready</button>
            <div className="mt-4 rounded-xl border border-[#315577] bg-[#061524] p-3 text-xs leading-5 text-[#8fb4cf]">
              Exception rows remain in the consolidated hold queue. Ready rows can proceed to Dispatch without waiting for unresolved exceptions.
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <h2 className="m-0 text-lg font-black">Parcel Receipt Register · {filteredRows.length}/{rows.length}</h2>
            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <div className="relative min-w-[280px] flex-1 xl:max-w-lg">
                <Search size={16} className="absolute left-3 top-3.5 text-[#8fb4cf]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Way ID, recipient, phone, address, merchant, exception…" className="h-11 w-full rounded-xl border border-[#315577] bg-[#061524] pl-10 pr-3 text-sm text-white outline-none focus:border-[#f6b84b]" />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-[#315577] bg-[#061524] px-3 text-sm font-bold text-[#8fb4cf]">
                <Filter size={15} />
                <select value={filter} onChange={(e) => setFilter(e.target.value as RowFilter)} className="h-10 bg-transparent text-white outline-none">
                  <option value="ALL">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="RECEIVED">Received</option>
                  <option value="WAREHOUSE_READY">Warehouse Ready</option>
                  <option value="WAREHOUSE_EXCEPTION">Exceptions</option>
                  <option value="LABEL_QA_PENDING">Label QA Pending</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#1a3a5c]">
            <table className="min-w-[1550px] w-full border-collapse text-left text-sm">
              <thead className="bg-[#f6b84b] text-[#061524]">
                <tr>
                  {['#', 'Way ID', 'Recipient', 'Township / Address', 'Declared / Actual kg', 'Collect', 'Status', 'Location', 'Label QA', 'Last Action', 'Actions'].map((header) => (
                    <th key={header} className="px-3 py-3 text-xs font-black uppercase tracking-wider">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status = String(row.warehouse_status || 'PENDING').toUpperCase();
                  const busy = busyWayId === row.delivery_way_id;
                  return (
                    <tr key={`${row.pickup_id}-${row.parcel_sequence}`} className="border-t border-[#1a3a5c] bg-[#081b2e] align-top hover:bg-[#0d2941]">
                      <td className="px-3 py-3 font-black text-[#f6b84b]">{row.parcel_sequence}</td>
                      <td className="px-3 py-3"><b className="font-mono text-white">{row.delivery_way_id}</b><small className="mt-1 block text-[#6f97b5]">{row.merchant_name || row.batch_waybill_no || '—'}</small></td>
                      <td className="px-3 py-3"><b>{row.recipient_name || '—'}</b><small className="mt-1 block text-[#8fb4cf]">{row.recipient_phone || '—'}</small></td>
                      <td className="max-w-[360px] px-3 py-3"><b>{row.township || row.destination || '—'}</b><small className="mt-1 block whitespace-normal leading-5 text-[#8fb4cf]">{row.recipient_address || '—'}</small></td>
                      <td className="px-3 py-3">{Number(row.declared_weight_kg || 0)} / <b>{row.actual_weight_kg ?? '—'}</b></td>
                      <td className="px-3 py-3 font-black text-[#f6b84b]">{money(row.actual_collect)}</td>
                      <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusTone(status)}`}>{status}</span>{row.discrepancy_name && <small className="mt-2 block max-w-[210px] text-rose-300">{row.discrepancy_name}: {row.discrepancy_remark || 'No remark'}</small>}</td>
                      <td className="px-3 py-3"><b>{row.warehouse_code || '—'}</b><small className="mt-1 block text-[#8fb4cf]">{row.staging_zone || '—'}</small></td>
                      <td className="px-3 py-3"><b className={row.label_scan_passed ? 'text-emerald-300' : 'text-amber-300'}>{row.label_scan_passed ? 'PASS' : 'PENDING'}</b><small className="mt-1 block text-[#8fb4cf]">Attempts: {row.label_scan_attempts || 0}</small></td>
                      <td className="px-3 py-3 text-xs text-[#8fb4cf]">{dateTime(row.ready_at || row.scanned_at)}<br />{row.ready_by || row.scanned_by || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-[270px] flex-wrap gap-1.5">
                          <button disabled={busy} onClick={() => void runAction('RECEIVE', row.delivery_way_id)} className="rounded-lg bg-sky-500 px-2.5 py-1.5 text-xs font-black text-[#04111d] disabled:opacity-50">Receive</button>
                          <button disabled={busy} onClick={() => void runAction('READY', row.delivery_way_id)} className="rounded-lg bg-emerald-400 px-2.5 py-1.5 text-xs font-black text-[#04111d] disabled:opacity-50">Ready</button>
                          <button disabled={busy} onClick={() => { setScanCode(row.delivery_way_id); scanRef.current?.focus(); }} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-200">Review</button>
                          <button disabled={busy} onClick={() => void runAction('LABEL_PASS', row.delivery_way_id)} className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-200">QA Pass</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRows.length && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-[#8fb4cf]">No warehouse rows match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-rose-500/30 bg-rose-500/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 text-lg font-black text-rose-200"><ShieldAlert size={19} /> Consolidated Warehouse Holds</h2>
            <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white">{attentionRows.length}</span>
          </div>
          <p className="mt-2 text-sm text-rose-100/70">These parcels remain isolated for correction. They do not interrupt Warehouse Ready parcels.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {attentionRows.map((row) => (
              <div key={`hold-${row.pickup_id}-${row.parcel_sequence}`} className="rounded-2xl border border-rose-500/30 bg-[#081b2e] p-4">
                <div className="flex items-start justify-between gap-3"><b className="font-mono text-[#f6b84b]">{row.delivery_way_id}</b><span className="text-xs font-black text-rose-300">{row.discrepancy_code || 'HOLD'}</span></div>
                <div className="mt-2 text-sm font-bold">{row.recipient_name || '—'} · {row.township || '—'}</div>
                <div className="mt-2 text-xs leading-5 text-[#8fb4cf]">{row.discrepancy_name || 'Warehouse exception'}<br />{row.discrepancy_remark || 'No detail recorded.'}</div>
                <button onClick={() => { setScanCode(row.delivery_way_id); setFilter('WAREHOUSE_EXCEPTION'); scanRef.current?.focus(); }} className="mt-3 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-200">Open for correction</button>
              </div>
            ))}
            {!attentionRows.length && <div className="text-sm text-emerald-300"><CheckCircle2 size={16} className="mr-2 inline" /> No warehouse exception is currently open for this pickup.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
