import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Bell, FileSpreadsheet, Loader2, Plus, RefreshCw, Save, Trash2, AlertCircle, CheckCircle2, Package } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', error: '#ff4f86', success: '#22c55e', info: '#38bdf8', text: '#eef8ff', muted: '#4d7a9b' };

interface RegisterRow {
  row_id: string; waybill_no: string; recipient_name: string; recipient_phone: string;
  delivery_township: string; delivery_address: string; weight_kg: string; item_price: string;
  delivery_fee: string; cod_amount: string; remarks: string;
}

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11);

export default function DataEntryPage() {
  const { t } = useLanguage();
  const [pickups, setPickups] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState("");
  const [rows, setRows] = useState<RegisterRow[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showMessage = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, tRes, nRes] = await Promise.all([
        supabase.from('be_portal_pickup_requests').select('*').in('status', ['SUBMITTED', 'PICKUP_REQUESTED', 'PENDING_PICKUP']).neq('data_entry_status', 'COMPLETED').order('created_at', { ascending: false }).limit(100),
        supabase.from('be_tariff_master').select('*'),
        supabase.from('be_app_notifications').select('*').in('target_role', ['DATA_ENTRY', 'data_entry', 'all', 'ALL']).order('created_at', { ascending: false }).limit(15)
      ]);
      if (pRes.data) setPickups(pRes.data);
      if (tRes.data) setTariffs(tRes.data);
      if (nRes.data) setNotifications(nRes.data);
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    loadData();
    const sub1 = supabase.channel('de-sync-p').on('postgres_changes', { event: '*', schema: 'public', table: 'be_portal_pickup_requests' }, () => loadData()).subscribe();
    const sub2 = supabase.channel('de-sync-n').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'be_app_notifications' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub1); supabase.removeChannel(sub2); };
  }, [loadData]);

  const selectedPickup = useMemo(() => pickups.find(p => p.pickup_id === selectedPickupId || p.id === selectedPickupId) || null, [pickups, selectedPickupId]);
  const townships = useMemo(() => Array.from(new Set(tariffs.map(t => t.township).filter(Boolean))).sort(), [tariffs]);

  const calculateFee = useCallback((township: string, weight: number) => {
    const activeTariff = tariffs.find(t => String(t.township).toLowerCase() === String(township).toLowerCase());
    if (!activeTariff) return 4000;
    const base = Number(activeTariff.base_fee_mmk || activeTariff.base_fee || 4000);
    const allow = Number(activeTariff.free_allowance_kg || activeTariff.weight_allowance || 3);
    const rate = Number(activeTariff.extra_per_kg_mmk || activeTariff.extra_weight_rate || 500);
    const extra = Math.max(0, Math.ceil(weight) - allow);
    return base + (extra * rate);
  }, [tariffs]);

  const generateRows = () => {
    if (!selectedPickup) return;
    const count = Math.max(1, Number(selectedPickup.parcel_count) || 1);
    const dateCode = new Date().toISOString().slice(5, 10).replace('-', '');
    const mCode = String(selectedPickup.merchant_code || selectedPickup.merchant_name || "MAN").substring(0, 3).toUpperCase();
    const baseId = selectedPickup.pickup_id ? selectedPickup.pickup_id.replace(/^P-?/, '') : `${dateCode}-${mCode}`;
    const initialTownship = selectedPickup.delivery_township || selectedPickup.pickup_township || '';
    const initialFee = initialTownship ? calculateFee(initialTownship, 1) : 4000;

    const newRows = Array.from({ length: count }, (_, i) => ({
      row_id: generateId(),
      waybill_no: `W${baseId}-${String(i + 1).padStart(3, '0')}`,
      recipient_name: '', recipient_phone: '', delivery_township: initialTownship, delivery_address: '',
      weight_kg: '1', item_price: '0', delivery_fee: String(initialFee), cod_amount: String(initialFee), remarks: ''
    }));
    setRows(newRows);
    showMessage(t(`Generated ${count} waybills.`, `ကုန်ပစ္စည်းပို့ဆောင်ရေး လမ်းညွှန်မှတ်တမ်း ${count} ခု ဖန်တီးပြီးပါပြီ။`), 'info');
  };

  const updateRow = (id: string, field: string, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.row_id !== id) return r;
      const next = { ...r, [field]: value };
      if (field === 'delivery_township' || field === 'weight_kg') {
        next.delivery_fee = String(calculateFee(next.delivery_township, Number(next.weight_kg)));
      }
      if (field === 'item_price' || field === 'delivery_fee' || field === 'delivery_township') {
        next.cod_amount = String(Number(next.item_price || 0) + Number(next.delivery_fee || 0));
      }
      return next;
    }));
  };

  const addRow = () => {
    const seq = String(rows.length + 1).padStart(3, '0');
    const baseId = selectedPickup?.pickup_id ? selectedPickup.pickup_id.replace(/^P-?/, '') : Date.now().toString().slice(-6);
    setRows(prev => [...prev, {
      row_id: generateId(), waybill_no: `W${baseId}-${seq}`, recipient_name: '', recipient_phone: '', delivery_township: '', delivery_address: '', weight_kg: '1', item_price: '0', delivery_fee: '4000', cod_amount: '4000', remarks: ''
    }]);
  };

  const saveToBackend = async () => {
    if (!selectedPickupId || rows.length === 0) return;
    if (rows.some(r => !r.recipient_name.trim() || !r.delivery_township.trim() || !r.delivery_address.trim())) {
      showMessage(t('Recipient Name, Township, and Address are required.', 'လက်ခံမည့်သူ အမည်၊ မြို့နယ်နှင့် လိပ်စာအပြည့်အစုံများကို မဖြစ်မနေ ထည့်သွင်းပါ။'), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = rows.map((r, i) => ({
        pickup_id: selectedPickupId, item_no: i + 1, waybill_no: r.waybill_no, recipient_name: r.recipient_name,
        recipient_phone: r.recipient_phone, delivery_township: r.delivery_township, delivery_address: r.delivery_address,
        weight_kg: Number(r.weight_kg) || 1, item_price: Number(r.item_price) || 0, delivery_fee: Number(r.delivery_fee) || 0,
        cod_amount: Number(r.cod_amount) || 0, item_status: 'SUBMITTED'
      }));

      const { error: insertErr } = await supabase.from('be_portal_pickup_request_items').upsert(payload, { onConflict: 'waybill_no' });
      if (insertErr && !insertErr.message.includes('does not exist')) throw insertErr;

      await supabase.from('be_portal_pickup_requests').update({ data_entry_status: 'COMPLETED', status: 'READY_FOR_WAYPLAN', updated_at: new Date().toISOString() }).eq('pickup_id', selectedPickupId);
      
      showMessage(t(`Successfully registered ${rows.length} waybills.`, `လမ်းညွှန်စာရွက် ${rows.length} စောင်ကို ဗဟိုစနစ်သို့ အောင်မြင်စွာ စာရင်းသွင်းပြီးပါပြီ။`), 'success');
      setRows([]); setSelectedPickupId(''); loadData();
    } catch (e: any) {
      showMessage(e.message || t("Failed to save to database.", "စနစ်တွင်း သိမ်းဆည်းရန် မအောင်မြင်ပါ။"), 'error');
    } finally {
      setSaving(false);
    }
  };

  const inpCls = "w-full bg-[#081b2e] border border-[#1a3a5c] text-[#eef8ff] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#f6b84b] transition-colors min-w-[120px]";
  const thCls = "px-3 py-4 text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] border-b border-[#1a3a5c] text-left whitespace-nowrap bg-[#061524] sticky top-0 z-10";

  return (
    <div className="notranslate be-page pb-10 bg-[#061524] min-h-[100%] p-6 text-[#eef8ff]" translate="no">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-5">
        <div className="flex justify-between items-start flex-wrap gap-4 bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl">
          <div>
            <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.15em] mb-2"><span>{t('Data Entry & Registration', 'အချက်အလက် စာရင်းသွင်းရေးနှင့် မှတ်ပုံတင်ဌာန')}</span></div>
            <h1 className="text-2xl font-bold text-white mt-1 mb-2"><span>{t('Waybill Register Workspace', 'လမ်းညွှန်စာရွက် မှတ်တမ်းတင် လုပ်ငန်းခွင်')}</span></h1>
            <div className="text-[14px] text-[#4d7a9b] m-0"><span>{t('Convert CS Pickup Requests into parcel-level Delivery Waybills.', 'တောင်းဆိုမှုများအား ပါဆယ်အဆင့် လမ်းညွှန်စာရွက်များအဖြစ်သို့ ပြောင်းလဲပါ။')}</span></div>
          </div>
          <button onClick={loadData} disabled={loading} className="flex items-center gap-2 bg-[#081b2e] border border-[#1a3a5c] px-4 py-2.5 rounded-xl font-bold hover:border-[#f6b84b] transition-colors cursor-pointer">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> <span>{t('Refresh Data', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl flex items-center gap-3 font-bold text-[14px] ${message.type === 'error' ? 'bg-[#ff4f86]/10 text-[#ff4f86] border border-[#ff4f86]/20' : message.type === 'success' ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20' : 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20'}`}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
          <div className="flex flex-col gap-5">
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5">
              <h2 className="text-[15px] font-bold text-white flex items-center gap-2 mb-4 border-b border-[#1a3a5c] pb-3"><Bell size={18} className="text-[#f6b84b]" /> <span>{t('Live Alerts', 'အချိန်ပြည့် သတိပေးချက်များ')}</span></h2>
              <div className="flex flex-col gap-3 max-h-[250px] overflow-y-auto pr-2">
                {notifications.length === 0 ? (
                  <div className="text-center p-4 border border-dashed border-[#1a3a5c] rounded-xl text-[#4d7a9b] text-[12px]"><span>{t('No recent notifications.', 'အသိပေး အကြောင်းကြားစာများ မရှိသေးပါ။')}</span></div>
                ) : notifications.map(n => (
                  <div key={n.id} className="bg-[#081b2e] border border-[#1a3a5c] rounded-xl p-3">
                    <div className="text-[#f6b84b] text-[10px] font-bold uppercase tracking-wider mb-1"><span>{n.target_role || 'System'}</span></div>
                    <div className="text-[13px] text-white"><span>{n.message || n.title}</span></div>
                    <div className="text-[#4d7a9b] text-[10px] mt-2"><span>{new Date(n.created_at).toLocaleString()}</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col h-[400px]">
              <div className="p-5 border-b border-[#1a3a5c]">
                <h2 className="text-[15px] font-bold text-white m-0"><span>{t('Intake Queue', 'အချက်အလက် စာရင်းသွင်းရန် ကျန်ရှိမှုများ')}</span></h2>
                <div className="text-[#4d7a9b] text-[12px] mt-1"><span>{pickups.length} {t('pickups awaiting data entry', 'ခု ဆောင်ရွက်ရန် ကျန်ရှိသည်')}</span></div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {pickups.length === 0 && !loading ? (
                  <div className="text-center text-[#4d7a9b] p-8 text-[13px]"><span>{t('All caught up! No pending pickups.', 'ဆောင်ရွက်ရန် ကျန်ရှိသောစာရင်း မရှိပါ။')}</span></div>
                ) : pickups.map(p => {
                  const isActive = selectedPickupId === p.pickup_id;
                  return (
                    <div key={p.pickup_id} onClick={() => { setSelectedPickupId(p.pickup_id); setRows([]); }} className={`p-4 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-[#0f2a42] border-[#f6b84b]' : 'bg-[#081b2e] border-[#1a3a5c] hover:border-[#4d7a9b]'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[#f6b84b] font-mono font-bold text-[13px]"><span>{p.pickup_id}</span></span>
                      </div>
                      <div className="font-bold text-white text-[13px] mb-2"><span>{p.merchant_name}</span></div>
                      <div className="flex items-center gap-4 text-[#4d7a9b] text-[11px] font-medium">
                        <span className="flex items-center gap-1"><Package size={12}/> <span>{p.parcel_count} {t('items', 'ခု')}</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[260px]">
                <label className="block mb-2 text-[#4d7a9b] text-[11px] font-bold tracking-wider uppercase"><span>{t('Pending CS Pickups', 'စောင့်ဆိုင်းဆဲ တောင်းဆိုမှုများ')}</span></label>
                <select value={selectedPickupId} onChange={(e) => { setSelectedPickupId(e.target.value); setRows([]); }} className="w-full h-[46px] bg-[#081b2e] border border-[#1a3a5c] text-white rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                  <option value="">-- <span>{t('Choose a pickup to process', 'စာရင်းသွင်းမည့် မှတ်တမ်းကို ရွေးချယ်ပါ')}</span> --</option>
                  {pickups.map(p => <option key={`opt-${p.pickup_id}`} value={p.pickup_id}>{p.pickup_id} • {p.merchant_name} ({p.parcel_count} {t('parcels', 'ခု')})</option>)}
                </select>
              </div>
              <button onClick={generateRows} disabled={!selectedPickupId} className="h-[46px] px-6 rounded-xl bg-[#081b2e] border border-[#38bdf8] text-[#38bdf8] text-[13px] font-bold flex items-center gap-2 cursor-pointer hover:bg-[#38bdf8]/10 transition-colors disabled:opacity-50">
                <FileSpreadsheet size={16} /> <span>{t('Generate Grid', 'အချက်အလက်ဇယား ဖန်တီးမည်')}</span>
              </button>
            </div>

            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[500px] overflow-hidden">
              <div className="p-5 border-b border-[#1a3a5c] bg-[#081b2e] flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-[#f6b84b]" />
                  <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Waybill Grid', 'လမ်းညွှန်စာရွက် အချက်အလက်ဇယား')}</span></h2>
                  <span className="text-[11px] font-bold text-[#4d7a9b] bg-[#061524] px-3 py-1 rounded-md border border-[#1a3a5c]"><span>{rows.length} {t('Rows', 'တန်း')}</span></span>
                </div>
                <div className="flex gap-3">
                  <button onClick={addRow} disabled={!selectedPickupId} className="flex items-center gap-2 bg-[#061524] border border-[#1a3a5c] text-white px-4 py-2 rounded-lg text-[12px] font-bold cursor-pointer hover:border-[#4d7a9b] transition-colors disabled:opacity-50">
                    <Plus size={14} /> <span>{t('Add Row', 'အတန်းသစ် ထည့်မည်')}</span>
                  </button>
                  <button onClick={saveToBackend} disabled={saving || rows.length === 0} className="flex items-center gap-2 bg-[#f6b84b] text-[#061524] px-5 py-2 rounded-lg text-[12px] font-bold cursor-pointer hover:bg-[#e5a93a] transition-colors disabled:opacity-50 shadow-lg shadow-[#f6b84b]/20 uppercase tracking-wider">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span>{t('Save to Backend', 'ဗဟိုစနစ်သို့ သိမ်းဆည်းမည်')}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-x-auto bg-[#061524]">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr>
                      <th className={thCls}><span>{t('Waybill No', 'လမ်းညွှန်စာရွက်အမှတ်')}</span></th>
                      <th className={thCls}><span>{t('Recipient Name*', 'လက်ခံမည့်သူ အမည်*')}</span></th>
                      <th className={thCls}><span>{t('Phone', 'ဖုန်းနံပါတ်')}</span></th>
                      <th className={thCls}><span>{t('Township*', 'မြို့နယ်*')}</span></th>
                      <th className={thCls}><span>{t('Full Address*', 'လိပ်စာအပြည့်အစုံ*')}</span></th>
                      <th className={thCls}><span>{t('Weight (KG)', 'အလေးချိန် (KG)')}</span></th>
                      <th className={thCls}><span>{t('Deli Fee (MMK)', 'ပို့ဆောင်ခ (ကျပ်)')}</span></th>
                      <th className={thCls}><span>{t('COD (MMK)', 'ကောက်ခံရန်ငွေ (ကျပ်)')}</span></th>
                      <th className={`${thCls} text-center`}><span>{t('Action', 'လုပ်ဆောင်ချက်')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-16 text-center text-[#4d7a9b]">
                          <Package size={40} className="mx-auto mb-4 opacity-30" />
                          <div className="text-[13px]"><span>{t('No rows generated. Select a Pickup ID and click Generate Grid.', 'အချက်အလက်ဇယား မရှိသေးပါ။ ကုန်ပစ္စည်းသင်္ကေတကို ရွေးချယ်ပြီး အချက်အလက်ဇယား ဖန်တီးမည် ကို နှိပ်ပါ။')}</span></div>
                        </td>
                      </tr>
                    ) : rows.map((row) => (
                      <tr key={row.row_id} className="hover:bg-[#0f2a42] border-b border-[#1a3a5c]">
                        <td className="p-2 align-top"><div className="px-3 py-1.5 bg-[#38bdf8]/10 text-[#38bdf8] rounded-md font-mono font-bold text-[11px] whitespace-nowrap"><span>{row.waybill_no}</span></div></td>
                        <td className="p-2 align-top"><input className={inpCls} value={row.recipient_name} onChange={e => updateRow(row.row_id, 'recipient_name', e.target.value)} placeholder={t("Name", "အမည်")} /></td>
                        <td className="p-2 align-top"><input className={`${inpCls} min-w-[130px]`} value={row.recipient_phone} onChange={e => updateRow(row.row_id, 'recipient_phone', e.target.value)} placeholder="09xxxx..." /></td>
                        <td className="p-2 align-top">
                          <select className={`${inpCls} min-w-[150px] cursor-pointer`} value={row.delivery_township} onChange={e => updateRow(row.row_id, 'delivery_township', e.target.value)}>
                            <option value="">{t('Select...', 'ရွေးချယ်ပါ')}</option>
                            {townships.map(twn => <option key={twn} value={twn}>{twn}</option>)}
                          </select>
                        </td>
                        <td className="p-2 align-top"><input className={`${inpCls} min-w-[200px]`} value={row.delivery_address} onChange={e => updateRow(row.row_id, 'delivery_address', e.target.value)} placeholder={t("House, Street, Ward...", "အိမ်အမှတ်၊ လမ်း၊ ရပ်ကွက်...")} /></td>
                        <td className="p-2 align-top"><input type="number" min="0.1" step="0.1" className={`${inpCls} w-[80px] text-center`} value={row.weight_kg} onChange={e => updateRow(row.row_id, 'weight_kg', e.target.value)} /></td>
                        <td className="p-2 align-top"><div className="px-3 py-2 bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 rounded-lg font-bold text-right text-[13px]"><span>{Number(row.delivery_fee).toLocaleString()}</span></div></td>
                        <td className="p-2 align-top"><input type="number" min="0" className={`${inpCls} min-w-[110px] text-right font-bold text-[#f6b84b]`} value={row.cod_amount} onChange={e => updateRow(row.row_id, 'cod_amount', e.target.value)} placeholder="0" /></td>
                        <td className="p-2 align-top text-center"><button onClick={() => deleteRow(row.row_id)} className="p-2 bg-[#ff4f86]/10 text-[#ff4f86] rounded-lg hover:bg-[#ff4f86]/20 transition-colors cursor-pointer"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {rows.length > 0 && (
                <div className="p-5 bg-[#081b2e] border-t border-[#1a3a5c] flex justify-end items-center gap-8">
                  <div className="text-[12px] text-[#4d7a9b] font-bold uppercase tracking-wider"><span>{t('Total Deli Fee:', 'စုစုပေါင်း ပို့ဆောင်ခ -')}</span> <strong className="text-[#22c55e] text-[18px] ml-2 font-mono"><span>{rows.reduce((s, r) => s + Number(r.delivery_fee), 0).toLocaleString()}</span></strong></div>
                  <div className="text-[12px] text-[#4d7a9b] font-bold uppercase tracking-wider"><span>{t('Total COD:', 'စုစုပေါင်း ကောက်ခံရမည့်ငွေ -')}</span> <strong className="text-[#f6b84b] text-[18px] ml-2 font-mono"><span>{rows.reduce((s, r) => s + Number(r.cod_amount), 0).toLocaleString()}</span></strong></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}