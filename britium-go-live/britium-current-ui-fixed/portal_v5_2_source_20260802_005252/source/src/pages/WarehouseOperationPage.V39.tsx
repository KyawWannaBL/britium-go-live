import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Warehouse, QrCode, Search, CheckCircle2, AlertTriangle, RefreshCw, XCircle, ListFilter, ScanLine, Package, MapPin, BellRing, ShieldCheck } from 'lucide-react';

const BUILD_MARKER = 'WAREHOUSE_OPS_V39_FAILED_RETURN_SCAN_DWELL_ALERTS_2026-07-30';

export default function WarehousePage() {
  const { t } = useLanguage();
  
  // View State
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'INVENTORY'>('SCANNER');
  const [inventoryFilter, setInventoryFilter] = useState<'ALL' | 'INBOUND' | 'RECEIVED' | 'HANDOVER' | 'EXCEPTIONS'>('ALL');
  const [searchQuery, setSearchQuery] = useState("");

  // Data State
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [operationalAlerts, setOperationalAlerts] = useState<any[]>([]);
  const [scanPolicy, setScanPolicy] = useState<any>({});
  
  // Scanner State
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<{ waybill: string; status: string; message: string; type: 'success' | 'error' | 'warning' }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus scanner input automatically
  useEffect(() => {
    if (activeTab === 'SCANNER') {
      inputRef.current?.focus();
    }
  }, [activeTab, scanHistory]);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('be_v_warehouse_lifecycle_v39')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setInventory(data);

      const { data: alertData, error: alertError } = await supabase.rpc('be_warehouse_lifecycle_alerts_v39');
      if (!alertError) {
        setOperationalAlerts(Array.isArray(alertData?.alerts) ? alertData.alerts : []);
        setScanPolicy(alertData?.policy || {});
      }
    } catch (e) {
      console.error("Error loading inventory:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // ─── SCANNER LOGIC (NORMAL INTAKE + FAILED-RETURN / RTO SCAN) ───
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;

    setIsScanning(true);
    setScanInput('');

    try {
      const { data: userData } = await supabase.auth.getUser();
      const actorEmail = userData?.user?.email || 'warehouse@britiumexpress.com';
      const { data, error } = await supabase.rpc('be_warehouse_return_scan_v39', {
        p_way_id: barcode,
        p_actor_email: actorEmail,
        p_warehouse_code: 'YGN-MAIN',
        p_staging_zone: 'FAILED_RETURN',
      });
      if (error) throw error;

      const rto = Boolean(data?.rto);
      const failedReturn = Boolean(data?.return_scan_recorded);
      const status = rto ? 'RETURN_TO_SENDER' : failedReturn ? 'WAREHOUSE_RECEIVED' : String(data?.status || 'WAREHOUSE_RECEIVED');
      const message = rto
        ? `RTO return scan recorded after ${Number(data?.attempt_count || 3)} consecutive failed attempts.`
        : failedReturn
          ? `Failed-return scan recorded. Attempt ${Number(data?.attempt_count || 1)}/3.`
          : 'Normal warehouse intake scan recorded.';
      const type: 'success' | 'error' | 'warning' = rto ? 'error' : failedReturn ? 'warning' : 'success';

      setScanHistory(prev => [{ waybill: barcode, status, message, type }, ...prev].slice(0, 20));
      await loadInventory();
    } catch (err: any) {
      setScanHistory(prev => [{ waybill: barcode, status: 'ERROR', message: err?.message || 'Warehouse scan failed.', type: 'error' as const }, ...prev].slice(0, 20));
    } finally {
      setIsScanning(false);
    }
  };

  // ─── INVENTORY FILTERING ───
  const filteredInventory = useMemo(() => {
    let filtered = inventory;
    
    // Status Filter
    if (inventoryFilter === 'INBOUND') {
      filtered = filtered.filter(i => ['SUBMITTED', 'READY_FOR_WAYPLAN'].includes(i.item_status));
    } else if (inventoryFilter === 'RECEIVED') {
      filtered = filtered.filter(i => i.item_status === 'WAREHOUSE_RECEIVED');
    } else if (inventoryFilter === 'HANDOVER') {
      filtered = filtered.filter(i => ['READY_FOR_DELIVERY', 'ASSIGNED'].includes(i.item_status));
    } else if (inventoryFilter === 'EXCEPTIONS') {
      filtered = filtered.filter(i => ['DELIVERY_FAILED', 'RETURN_TO_SENDER', 'WAREHOUSE_EXCEPTION'].includes(i.item_status) || i.dwell_alert);
    }

    // Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(i => 
        i.waybill_no?.toLowerCase().includes(q) || 
        i.merchant_name?.toLowerCase().includes(q) ||
        i.recipient_name?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [inventory, inventoryFilter, searchQuery]);

  // KPIs
  const kpis = {
    received: inventory.filter(i => i.item_status === 'WAREHOUSE_RECEIVED').length,
    handover: inventory.filter(i => i.item_status === 'READY_FOR_DELIVERY').length,
    exceptions: inventory.filter(i => ['DELIVERY_FAILED', 'RETURN_TO_SENDER'].includes(i.item_status)).length,
    totalCod: filteredInventory.reduce((sum, item) => sum + (Number(item.cod_amount) || 0), 0),
    dwellAlerts: inventory.filter(i => i.dwell_alert).length,
    dispatchScanned: inventory.filter(i => i.dispatch_scanned).length
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      
      {/* ── HEADER ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Warehouse size={14}/> <span>{t('Warehouse Hub', 'ကုန်လှောင်ရုံ ဗဟိုဌာန')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Central Warehouse Operations', 'ကုန်လှောင်ရုံ လုပ်ငန်းစဉ်များ စီမံခန့်ခွဲရေး')}</span></h1>
          <p className="mt-2 text-xs text-[#4d7a9b]">Receiving scan: {scanPolicy.receiving_scan_required ? 'REQUIRED' : 'OPTIONAL'} · Dispatch scan: REQUIRED · Three consecutive failures: AUTO RTO · {BUILD_MARKER}</p>
        </div>
        <div className="flex bg-[#061524] rounded-xl p-1 border border-[#1a3a5c]">
          <button onClick={() => setActiveTab('SCANNER')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'SCANNER' ? 'bg-[#1a3a5c] text-[#f6b84b]' : 'text-[#4d7a9b] hover:text-white'}`}>
            <ScanLine size={16} /> <span>{t('Scanner Mode', 'စကင်န်ဖတ်စနစ်')}</span>
          </button>
          <button onClick={() => setActiveTab('INVENTORY')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'INVENTORY' ? 'bg-[#1a3a5c] text-[#f6b84b]' : 'text-[#4d7a9b] hover:text-white'}`}>
            <ListFilter size={16} /> <span>{t('Inventory Mode', 'ကုန်လက်ကျန်စနစ်')}</span>
          </button>
        </div>
      </div>

      {operationalAlerts.length > 0 && (
        <div className="rounded-2xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-[#f59e0b]"><BellRing size={18} /> Operational Warning Alerts</div>
            <span className="rounded-full bg-[#f59e0b] px-3 py-1 text-xs font-black text-[#061524]">{operationalAlerts.length}</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {operationalAlerts.slice(0, 9).map((alert: any) => (
              <div key={alert.alert_key} className="rounded-xl border border-[#f59e0b]/30 bg-[#061524] p-3 text-xs">
                <b className="font-mono text-[#f6b84b]">{alert.delivery_way_id || alert.pickup_id || alert.alert_key}</b>
                <div className="mt-1 font-bold text-white">{alert.title}</div>
                <div className="mt-1 leading-5 text-[#c8dff0]">{alert.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'SCANNER' ? (
        /* ═══════════════════════════════════════════════════════════════
           SCANNER MODE
        ═══════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-8 shadow-xl flex flex-col justify-center items-center min-h-[500px]">
            <div className="bg-[#061524] p-8 rounded-full border-4 border-[#1a3a5c] mb-8 relative shadow-[0_0_30px_rgba(246,184,75,0.1)]">
              <QrCode className="text-[#f6b84b]" size={64} />
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#061524]/80 rounded-full">
                  <RefreshCw className="animate-spin text-[#f6b84b]" size={32} />
                </div>
              )}
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2"><span>{t('Ready to Scan', 'စကင်န်ဖတ်ရန် အသင့်ဖြစ်ပါပြီ')}</span></h2>
            <p className="text-[#4d7a9b] text-[13px] text-center mb-8 px-4">
              <span>{t('Scan normal intake parcels and every failed-return parcel. The third consecutive delivery failure is automatically shown as RTO.', 'ဘားကုဒ်စကင်နာ ချိတ်ဆက်ထားခြင်းရှိမရှိ စစ်ဆေးပါ။')}</span>
            </p>

            <form onSubmit={handleScan} className="w-full max-w-md relative">
              <ScanLine size={20} className="absolute left-4 top-4 text-[#4d7a9b]" />
              <input 
                ref={inputRef}
                value={scanInput} 
                onChange={e => setScanInput(e.target.value)} 
                disabled={isScanning}
                placeholder={t('Scan or type Waybill No...', 'ဘားကုဒ် စကင်န်ဖတ်ပါ (သို့) စာရွက်အမှတ် ရိုက်ထည့်ပါ...')} 
                className="w-full bg-[#081b2e] border-2 border-[#1a3a5c] text-white text-[16px] font-mono font-bold rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#f6b84b] transition-colors disabled:opacity-50"
              />
              <button type="submit" className="hidden">Submit</button>
            </form>
          </div>

          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl overflow-hidden flex flex-col min-h-[500px] shadow-xl">
            <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex justify-between items-center">
              <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Session Scan History', 'ယခုစကင်န်ဖတ်မှု မှတ်တမ်း')}</span></h2>
              <span className="text-[12px] font-bold text-[#f6b84b] bg-[#f6b84b]/10 px-3 py-1 rounded-md border border-[#f6b84b]/20">{scanHistory.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {scanHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#4d7a9b]">
                   <ListFilter size={32} className="mb-4 opacity-30" />
                  <span className="text-[13px] font-medium">{t('Awaiting first scan...', 'ပထမဆုံး စကင်န်ဖတ်ရန် စောင့်ဆိုင်းနေပါသည်...')}</span>
                </div>
              ) : (
                scanHistory.map((log, index) => (
                  <div key={index} className={`p-4 rounded-xl border shadow-sm ${
                    log.type === 'success' ? 'bg-[#22c55e]/10 border-[#22c55e]/30' : 
                    log.type === 'error' ? 'bg-[#ff4f86]/10 border-[#ff4f86]/30' : 
                    'bg-[#f59e0b]/10 border-[#f59e0b]/30'
                  }`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono font-bold text-[15px] text-white">{log.waybill}</span>
                      <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${
                        log.type === 'success' ? 'bg-[#22c55e] text-[#061524]' : 
                        log.type === 'error' ? 'bg-[#ff4f86] text-[#061524]' : 
                        'bg-[#f59e0b] text-[#061524]'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <div className={`text-[13px] font-bold flex items-start gap-2 mt-2 ${
                      log.type === 'success' ? 'text-[#22c55e]' : 
                      log.type === 'error' ? 'text-[#ff4f86]' : 
                      'text-[#f59e0b]'
                    }`}>
                      {log.type === 'success' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : 
                       log.type === 'error' ? <XCircle size={16} className="shrink-0 mt-0.5" /> : 
                       <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      <span>{log.message}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           INVENTORY MODE
        ═══════════════════════════════════════════════════════════════ */
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
             {[
               { label: t('Received', 'လက်ခံရရှိပြီး'), val: kpis.received, color: '#38bdf8' },
               { label: t('Ready to Handover', 'ပို့ဆောင်ရန် အသင့်'), val: kpis.handover, color: '#22c55e' },
               { label: t('Exceptions', 'ချွင်းချက်ဖြစ်စဉ်များ'), val: kpis.exceptions, color: '#ff4f86' },
               { label: t('COD Exposure (MMK)', 'စုစုပေါင်း ကောက်ခံရန်ငွေ'), val: kpis.totalCod.toLocaleString(), color: '#f6b84b' },
               { label: t('Over 48h Alerts', '၄၈ နာရီကျော် သတိပေးချက်'), val: kpis.dwellAlerts, color: '#f59e0b' },
               { label: t('Dispatch Scanned', 'ပို့ဆောင်ရန် စကင်န်ဖတ်ပြီး'), val: kpis.dispatchScanned, color: '#a3e635' },
             ].map((kpi, i) => (
               <div key={i} className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl border-t-2" style={{ borderTopColor: kpi.color }}>
                 <div className="text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest mb-1"><span>{kpi.label}</span></div>
                 <div className="text-2xl font-black text-white"><span>{kpi.val}</span></div>
               </div>
             ))}
          </div>

          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl overflow-hidden flex flex-col min-h-[600px] shadow-xl">
            {/* Toolbar */}
            <div className="p-6 border-b border-[#1a3a5c] flex flex-col md:flex-row gap-4 justify-between items-center bg-[#081b2e]">
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                {[
                  { id: 'ALL', label: t('All Inventory', 'ကုန်လက်ကျန် အားလုံး') },
                  { id: 'INBOUND', label: t('Inbound', 'ဝင်ရောက်ရန်ရှိသည်များ') },
                  { id: 'RECEIVED', label: t('Received', 'လက်ခံရရှိပြီးများ') },
                  { id: 'HANDOVER', label: t('Handover', 'လွှဲပြောင်းရန် အသင့်') },
                  { id: 'EXCEPTIONS', label: t('Exceptions', 'ချွင်းချက်ဖြစ်စဉ်များ') },
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setInventoryFilter(tab.id as any)}
                    className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${inventoryFilter === tab.id ? 'bg-[#f6b84b] text-[#061524]' : 'bg-[#061524] text-[#4d7a9b] border border-[#1a3a5c] hover:text-white'}`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
              <div className="relative w-full md:w-[300px]">
                <Search size={16} className="absolute left-4 top-3 text-[#4d7a9b]" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('Search Waybill or Merchant...', 'လမ်းညွှန်စာရွက် (သို့) ကုန်သည် ရှာဖွေရန်...')}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-2.5 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
                />
              </div>
            </div>

            {/* Data Grid */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-[#061524]">
                  <tr>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Waybill No', 'လမ်းညွှန်စာရွက်')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Recipient', 'လက်ခံမည့်သူ')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Township', 'မြို့နယ်')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('COD', 'ကောက်ခံငွေ')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Attempts', 'ကြိုးစားမှု')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
                    <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Dwell / Dispatch Scan', 'သိုလှောင်ချိန် / Dispatch Scan')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="mx-auto animate-spin" size={24} /></td></tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr><td colSpan={8} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No inventory records found.', 'ကုန်လက်ကျန် မှတ်တမ်းများ မတွေ့ရှိပါ။')}</span></td></tr>
                  ) : (
                    filteredInventory.map(row => (
                      <tr key={row.waybill_no} className="hover:bg-[#1a3a5c]/20 transition-colors border-b border-[#1a3a5c]/50">
                        <td className="p-4 font-mono font-bold text-[#f6b84b] text-[13px]"><span>{row.waybill_no}</span></td>
                        <td className="p-4 font-bold text-white text-[13px]"><span>{row.merchant_name || '—'}</span></td>
                        <td className="p-4 text-[#c8dff0] text-[13px]"><span>{row.recipient_name || '—'}</span></td>
                        <td className="p-4 text-[#c8dff0] text-[13px]"><span>{row.delivery_township || '—'}</span></td>
                        <td className="p-4 text-[#22c55e] font-bold text-[13px]"><span>{Number(row.cod_amount || 0).toLocaleString()} Ks</span></td>
                        <td className="p-4">
                          <span className={`text-[11px] font-bold px-2 py-1 rounded ${row.delivery_attempts >= 3 ? 'bg-[#ff4f86] text-[#061524]' : row.delivery_attempts > 0 ? 'bg-[#f59e0b]/20 text-[#f59e0b]' : 'bg-[#1a3a5c] text-[#4d7a9b]'}`}>
                            {row.delivery_attempts || 0}/3
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${
                            ['WAREHOUSE_RECEIVED', 'READY_FOR_DELIVERY'].includes(row.item_status) ? 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30' :
                            ['DELIVERY_FAILED', 'RETURN_TO_SENDER'].includes(row.item_status) ? 'bg-[#ff4f86]/10 text-[#ff4f86] border-[#ff4f86]/30' :
                            'bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30'
                          }`}>
                            <span>{String(row.item_status).replace(/_/g, ' ')}</span>
                          </span>
                        </td>
                        <td className="p-4 text-[12px]">
                          <div className={row.dwell_alert ? 'font-black text-[#f59e0b]' : 'text-[#c8dff0]'}>{row.dwell_hours == null ? '—' : `${row.dwell_hours} hours`}{row.dwell_alert ? ' · WARNING' : ''}</div>
                          <div className={`mt-1 flex items-center gap-1 font-bold ${row.dispatch_scanned ? 'text-[#a3e635]' : 'text-[#f59e0b]'}`}><ShieldCheck size={13} /> {row.dispatch_scanned ? 'Dispatch scanned' : 'Dispatch scan required'}</div>
                          <div className="mt-1 text-[#4d7a9b]">{row.receiving_scan_skipped ? 'Receiving scan skipped by policy' : row.receipt_method || 'Pending receipt'}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}