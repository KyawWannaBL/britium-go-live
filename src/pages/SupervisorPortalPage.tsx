import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, Send, Sparkles, X, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

// --- CUSTOM SEARCHABLE AUTOCOMPLETE DROPDOWN ---
function SearchableSelect({ value, onChange, options, placeholder, disabled }: { value: string, onChange: (v: string) => void, options: {label: string, value: string}[], placeholder: string, disabled?: boolean }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedOpt = options.find(o => o.value === value);
    setSearch(selectedOpt ? selectedOpt.label : '');
  }, [value, options]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        const selectedOpt = options.find(o => o.value === value);
        setSearch(selectedOpt ? selectedOpt.label : '');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value, options]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        disabled={disabled}
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => { setOpen(true); setSearch(''); }}
        placeholder={placeholder}
        style={{ width: '100%', height: 42, background: C.bg, border: `1px solid ${open ? C.gold : C.border}`, borderRadius: 10, color: C.text, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: FF.body, transition: 'border-color 0.2s' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 220, overflowY: 'auto', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {filtered.length === 0 ? <div style={{ padding: '12px 14px', color: C.error, fontSize: 12, fontWeight: 600 }}>No matches found</div> : null}
          {filtered.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setSearch(opt.label); setOpen(false); }}
              style={{ padding: '12px 14px', cursor: 'pointer', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}40`, fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.panelHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- REGISTRY NORMALIZER ---
function normalizeRegistryWorker(row: any) {
  const data = row.json_data || {};
  const type = String(row.module_key || '').toLowerCase();
  return {
    worker_code: row.record_code,
    worker_type: type,
    display_name: row.display_name,
    branch_code: data.assigned_zone || row.branch_code || 'YGN',
    status: row.is_active ? 'Active' : 'Inactive',
    zone: data.assigned_zone || '',
    raw: data,
  };
}

const TRANSLATIONS = {
  en: {
    title: 'Pickup Rider Assignment', subtitle: 'Live order pickup requests from Pickup Form. Assignment writes Rider/Driver/Helper into backend so mobile apps receive jobs.',
    refresh: 'Refresh', searchPh: 'Pickup ID / merchant / township...',
    qTitle: 'LIVE SUPERVISOR QUEUE', qSub: 'Only PICKUP_REQUESTED and PICKUP_ASSIGNED requests are shown.',
    thId: 'Pickup ID', thMerch: 'Merchant', thTown: 'Township / Address', thStat: 'Status', thDate: 'Created',
    manTitle: 'ASSIGNMENT CONTROL', selReq: 'SELECTED PICKUP ID',
    sugRiders: 'Suggested Pickup Riders',
    lblRider: 'RIDER - REQUIRED', lblDriver: 'DRIVER', lblHelper: 'HELPER', lblVehicle: 'VEHICLE / FLEET', lblNote: 'SUPERVISOR NOTE',
    phRider: 'Type to search Rider...', phDriver: 'Type to search Driver...', phHelper: 'Type to search Helper...', phVehicle: 'Type to search Vehicle...',
    btnConfirm: 'CONFIRM ASSIGNMENT', btnAi: 'AI Matchmaker',
    aiTitle: '✨ AI Rider Suggestion', aiLoading: 'Analyzing best rider match for this pickup...',
  },
  mm: {
    title: 'ပစ္စည်းလာယူမည့်သူ တာဝန်ချထားခြင်း', subtitle: 'CS မှတင်သွင်းပြီးနောက် AI အကြံပြုချက်ဖြင့် ပို့ဆောင်ရေးသမားကို တာဝန်ချထားခြင်း။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်', searchPh: 'ရှာဖွေရန်...',
    qTitle: 'ကြီးကြပ်သူ တာဝန်ချထားရေး စာရင်း', qSub: 'တင်သွင်းပြီး နှင့် စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများကိုသာ ပြသထားပါသည်။',
    thId: 'လာယူမည့် ID', thMerch: 'ကုန်သည်', thTown: 'မြို့နယ် / လိပ်စာ', thStat: 'အခြေအနေ', thDate: 'ဖန်တီးခဲ့သည့်အချိန်',
    manTitle: 'တာဝန်ချထားမှု ထိန်းချုပ်ရန်', selReq: 'ရွေးချယ်ထားသော တောင်းဆိုမှု',
    sugRiders: 'အကြံပြုထားသော ပို့ဆောင်ရေးသမားများ',
    lblRider: 'ပို့ဆောင်ရေးသမား (မဖြစ်မနေရွေးရန်)', lblDriver: 'ယာဉ်မောင်း', lblHelper: 'အကူ', lblVehicle: 'ယာဉ်အမျိုးအစား', lblNote: 'ကြီးကြပ်သူ မှတ်ချက်',
    phRider: 'ဝန်ထမ်း ရှာရန် ရိုက်ထည့်ပါ...', phDriver: 'ယာဉ်မောင်း ရှာရန် ရိုက်ထည့်ပါ...', phHelper: 'အကူ ရှာရန် ရိုက်ထည့်ပါ...', phVehicle: 'ယာဉ် ရှာရန် ရိုက်ထည့်ပါ...',
    btnConfirm: 'တာဝန်ချထားမှုကို အတည်ပြုမည်', btnAi: 'AI အကြံပြုချက်',
    aiTitle: '✨ AI ဝန်ထမ်း အကြံပြုချက်', aiLoading: 'ဤတောင်းဆိုမှုအတွက် အသင့်တော်ဆုံး ဝန်ထမ်းကို ရှာဖွေနေပါသည်...',
  }
};

export default function SupervisorPickupAssignmentGoLivePage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [queue, setQueue] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  
  const [selected, setSelected] = useState<any>(null);
  const [selectedRider, setSelectedRider] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedHelper, setSelectedHelper] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [supervisorNote, setSupervisorNote] = useState('');
  
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: q } = await supabase.from('be_v_supervisor_pickup_queue').select('*').order('created_at', { ascending: false }).limit(250);
    setQueue(q || []);
    setSelected((cur: any) => cur && (q || []).some((r:any) => r.pickup_id === cur.pickup_id) ? cur : (q || [])[0] || null);

    const { data: registryData } = await supabase.from('be_master_data_registry').select('*').in('module_key', ['RIDER', 'DRIVER', 'HELPER']).eq('is_active', true);
    if (registryData) setWorkers(registryData.map(normalizeRegistryWorker));

    const { data: vData } = await supabase.from('be_master_data_options').select('value').eq('dropdown_name', 'vehicle_type');
    if (vData) setVehicles(vData);

    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.filter(r => !q || [r.pickup_id, r.merchant_name, r.township, r.address, r.status].some(v => String(v || '').toLowerCase().includes(q)));
  }, [queue, search]);

  const riders = useMemo(() => workers.filter(w => w.worker_type.toLowerCase() === 'rider'), [workers]);
  const drivers = useMemo(() => workers.filter(w => w.worker_type.toLowerCase() === 'driver'), [workers]);
  const helpers = useMemo(() => workers.filter(w => w.worker_type.toLowerCase() === 'helper'), [workers]);

  const suggestions = useMemo(() => {
    if (!selected) return [];
    return riders.map(w => ({ ...w, score: w.zone?.toLowerCase() === (selected.township || '').toLowerCase() ? 40 : 10 })).sort((a, b) => b.score - a.score).slice(0, 3);
  }, [riders, selected]);

  useEffect(() => {
    setSelectedDriver(''); setSelectedHelper(''); setSelectedVehicle(''); setSupervisorNote('');
    if (suggestions.length > 0) setSelectedRider(suggestions[0].worker_code);
    else setSelectedRider('');
  }, [selected?.pickup_id, suggestions]);

  const assign = async () => {
    if (!selected || !selectedRider) { setMessage({ type: 'error', text: 'Select a pickup request and rider.' }); return; }
    const worker = workers.find(w => w.worker_code === selectedRider);
    setSaving(true); setMessage(null);

    try {
      const res = await supabase.from('be_portal_pickup_requests').update({
        assigned_rider_id: selectedRider,
        assigned_rider_name: worker?.display_name || selectedRider,
        assigned_driver_id: selectedDriver || null,
        assigned_helper_id: selectedHelper || null,
        vehicle_type: selectedVehicle || null,
        supervisor_note: supervisorNote,
        status: 'PICKUP_ASSIGNED',
        pickup_status: 'Assigned',
        updated_at: new Date().toISOString(),
      }).eq('pickup_id', selected.pickup_id);

      if (res.error) throw res.error;

      await supabase.from('be_portal_cargo_events').insert({
        pickup_id: selected.pickup_id, event_type: 'PICKUP_ASSIGNED', status_code: 'PICKUP_ASSIGNED',
        description: `Supervisor assigned pickup rider ${worker?.display_name || selectedRider}. Vehicle: ${selectedVehicle || 'N/A'}.`,
        actor_role: 'supervisor',
      });

      setMessage({ type: 'success', text: `Pickup ${selected.pickup_id} assigned successfully.` });
      setAiBriefing(null);
      await load();
    } catch (e: any) { setMessage({ type: 'error', text: e?.message || 'Assignment failed.' }); } finally { setSaving(false); }
  };

  const generateAiSuggestion = async () => {
    if (!selected) return;
    setIsAiLoading(true); setAiBriefing(null);
    try {
      const prompt = `Assign pickup rider for ${selected.pickup_id}. Location: ${selected.township}. Top riders: ${JSON.stringify(suggestions.map(w => w.display_name))}.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      setAiBriefing(data.candidates?.[0]?.content?.parts?.[0]?.text || 'Analyzed successfully.');
    } catch (e: any) { setAiBriefing(`AI Suggestion unavailable.`); } finally { setIsAiLoading(false); }
  };

  const mapOptions = (arr: any[]) => arr.map(w => ({ label: `${w.display_name} (${w.worker_code})`, value: w.worker_code }));
  const mapVehicles = (arr: any[]) => arr.map(v => ({ label: v.value, value: v.value }));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 24, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1680, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        {/* Header */}
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Supervisor</div>
            <h1 style={{ margin: '8px 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={load} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, padding: '10px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer', fontFamily: FF.body }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16}/>} {t.refresh}
            </button>
          </div>
        </section>

        {message && (
          <div style={{ background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, color: message.type === 'error' ? C.error : C.success, padding: 16, borderRadius: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            {message.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(420px, 0.8fr)', gap: 20, alignItems: 'start' }}>
          
          {/* Queue Section */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.qTitle}</h2><p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>{t.qSub}</p></div>
              <div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 14, top: 12 }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPh} style={{ width: 280, height: 40, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px 0 40px', color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body }} /></div>
            </div>
            <div style={{ maxHeight: 700, overflowY: 'auto', padding: 16, display: 'grid', gap: 10 }}>
              {filtered.map(r => {
                const isSelected = selected?.pickup_id === r.pickup_id;
                return (
                  <button key={r.pickup_id} onClick={() => { setSelected(r); setAiBriefing(null); }} style={{ width: '100%', textAlign: 'left', background: isSelected ? C.panelHover : C.bg, border: `1px solid ${isSelected ? C.gold : C.border}`, borderRadius: 14, padding: 18, cursor: 'pointer', fontFamily: FF.body, transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900, color: C.gold, fontSize: 15 }}>{r.pickup_id}</div>
                        <div style={{ fontSize: 13, color: C.info, fontWeight: 700, marginTop: 2 }}>{r.merchant_name}</div>
                      </div>
                      <span style={{ background: r.status === 'PICKUP_ASSIGNED' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: r.status === 'PICKUP_ASSIGNED' ? C.success : C.warning, border: `1px solid ${r.status === 'PICKUP_ASSIGNED' ? C.success : C.warning}40`, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>{r.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.text2 }}>{r.address} · {r.township}</div>
                  </button>
                )
              })}
              {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>No matching requests found.</div>}
            </div>
          </section>

          {/* Assignment Control Section */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 16, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><UserCog size={18} color={C.info} /> {t.manTitle}</h2>
              {selected && <button onClick={generateAiSuggestion} disabled={isAiLoading} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#000', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: FF.body }}>{isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t.btnAi}</button>}
            </div>

            {!selected ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Select a pickup request.</div> : (
              <div style={{ display: 'grid', gap: 16 }}>
                {(aiBriefing || isAiLoading) && (
                  <div style={{ background: 'rgba(56,189,248,0.1)', border: `1px solid ${C.info}40`, borderRadius: 14, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: C.info, fontWeight: 800, fontSize: 13, marginBottom: 8 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14}/> {t.aiTitle}</span><button onClick={() => setAiBriefing(null)} style={{ background: 'none', border: 'none', color: C.info, cursor: 'pointer' }}><X size={16}/></button></div>
                    <div style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>{isAiLoading ? t.aiLoading : aiBriefing}</div>
                  </div>
                )}

                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.selReq}</div><div style={{ height: 42, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 14px', color: C.text, fontWeight: 700, fontFamily: 'monospace' }}>{selected.pickup_id}</div></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.lblRider}</div><SearchableSelect placeholder={t.phRider} value={selectedRider} onChange={setSelectedRider} options={mapOptions(riders)} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.lblDriver}</div><SearchableSelect placeholder={t.phDriver} value={selectedDriver} onChange={setSelectedDriver} options={mapOptions(drivers)} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.lblHelper}</div><SearchableSelect placeholder={t.phHelper} value={selectedHelper} onChange={setSelectedHelper} options={mapOptions(helpers)} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.lblVehicle}</div><SearchableSelect placeholder={t.phVehicle} value={selectedVehicle} onChange={setSelectedVehicle} options={mapVehicles(vehicles)} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6 }}>{t.lblNote}</div><textarea value={supervisorNote} onChange={e => setSupervisorNote(e.target.value)} placeholder="Urgency, instructions..." style={{ width: '100%', height: 80, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body, resize: 'none' }}/></div>

                <button onClick={assign} disabled={saving || !selectedRider} style={{ width: '100%', height: 48, background: C.gold, color: '#000', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FF.body, opacity: (!selectedRider || saving) ? 0.5 : 1 }}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {t.btnConfirm}
                </button>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}