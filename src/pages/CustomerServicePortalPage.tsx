import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, MapPin, Package, Clock, ShieldAlert, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', border: '#1a3a5c', gold: '#f6b84b', info: '#38bdf8', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86' };

const TRANSLATIONS = {
  en: {
    csSupport: 'Customer Support',
    title: 'Tracking & Resolution',
    searchPh: 'Enter Pickup ID or Phone Number...',
    btnSearch: 'Search',
    searching: 'Searching...',
    errNotFound: 'No matching tracking record found.',
    trackingNum: 'Tracking Number',
    sender: 'Sender',
    currStatus: 'Current Status',
    parcels: 'Parcels',
    eventHistory: 'Event History',
    noEvents: 'No events logged for this parcel.',
    statusUpdated: 'Status updated.'
  },
  mm: {
    csSupport: 'ဖောက်သည် ဝန်ဆောင်မှု',
    title: 'ခြေရာခံခြင်း နှင့် ဖြေရှင်းခြင်း',
    searchPh: 'Pickup ID သို့မဟုတ် ဖုန်းနံပါတ် ရိုက်ထည့်ပါ...',
    btnSearch: 'ရှာဖွေရန်',
    searching: 'ရှာဖွေနေသည်...',
    errNotFound: 'ကိုက်ညီသော မှတ်တမ်း မတွေ့ရှိပါ။',
    trackingNum: 'ခြေရာခံ အမှတ်',
    sender: 'ပေးပို့သူ',
    currStatus: 'လက်ရှိ အခြေအနေ',
    parcels: 'ပါဆယ်ထုပ် အရေအတွက်',
    eventHistory: 'ဖြစ်စဉ် မှတ်တမ်း',
    noEvents: 'ဤပါဆယ်ထုပ်အတွက် မှတ်တမ်း မရှိပါ။',
    statusUpdated: 'အခြေအနေ ပြောင်းလဲခဲ့သည်။'
  }
};

export default function CustomerServicePortalPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[(lang || 'en').toLowerCase() as 'en' | 'mm'] || TRANSLATIONS.en;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [parcel, setParcel] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState('');

  const searchTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setError('');
    setParcel(null);
    setEvents([]);

    try {
      const { data: pData, error: pError } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .or(`pickup_id.eq."${query}",sender_phone.eq."${query}"`)
        .limit(1)
        .maybeSingle();

      if (pError || !pData) throw new Error(t.errNotFound);
      setParcel(pData);

      const { data: eData } = await supabase
        .from('be_portal_cargo_events')
        .select('*')
        .eq('pickup_id', pData.pickup_id)
        .order('created_at', { ascending: false });

      setEvents(eData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 24, fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.info, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{t.csSupport}</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{t.title}</h1>
          </div>
          <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
            <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? '#0f2a42' : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>EN</button>
            <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? '#0f2a42' : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>မြန်မာ</button>
          </div>
        </header>

        <form onSubmit={searchTracking} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
            <Search size={20} color={C.muted} style={{ position: 'absolute', left: 16, top: 18 }} />
            <input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              placeholder={t.searchPh} 
              style={{ width: '100%', height: 56, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, color: C.text, padding: '0 20px 0 48px', fontSize: 15, outline: 'none', fontFamily: "'Poppins', sans-serif" }}
            />
          </div>
          <button type="submit" disabled={loading || !query} style={{ height: 56, padding: '0 24px', background: C.gold, color: '#000', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: loading || !query ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }}>
            {loading ? <Loader2 className="animate-spin" /> : t.btnSearch}
          </button>
        </form>

        {error && (
          <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,79,134,0.1)', color: C.error, border: `1px solid ${C.error}40`, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
            <ShieldAlert size={18} /> {error}
          </div>
        )}

        {parcel && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(350px, 400px)', gap: 20, alignItems: 'start' }}>
            
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                <Package size={24} color={C.gold}/>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{t.trackingNum}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.gold }}>{parcel.pickup_id}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{t.sender}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{parcel.merchant_name || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>{parcel.pickup_address}</div>
                  <div style={{ fontSize: 13, color: C.info, marginTop: 4 }}>{parcel.pickup_township}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{t.currStatus}</div>
                  <div style={{ display: 'inline-block', padding: '6px 12px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.info }}>
                    {String(parcel.status).replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>{t.parcels}: {parcel.expected_parcels || 1}</div>
                </div>
              </div>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color={C.info}/> {t.eventHistory}
              </h3>
              
              <div style={{ display: 'grid', gap: 16 }}>
                {events.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: 14 }}>{t.noEvents}</div>
                ) : events.map((ev, index) => (
                  <div key={ev.id || index} style={{ position: 'relative', paddingLeft: 24 }}>
                    <div style={{ position: 'absolute', left: 0, top: 6, width: 8, height: 8, borderRadius: '50%', background: index === 0 ? C.gold : C.muted }} />
                    {index !== events.length - 1 && <div style={{ position: 'absolute', left: 3, top: 20, bottom: -16, width: 2, background: C.border }} />}
                    
                    <div style={{ fontSize: 14, fontWeight: 700, color: index === 0 ? C.text : C.text2 }}>
                      {String(ev.event_type || ev.status_code).replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 13, color: C.muted, margin: '4px 0' }}>{ev.description || t.statusUpdated}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{new Date(ev.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}