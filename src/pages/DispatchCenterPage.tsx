import React, { useEffect, useState } from 'react';
import { 
  Users2, CarFront, Activity, RefreshCw, Loader2, PlusCircle, 
  Home, Package, User, LogOut, UserCircle, MapPin, PackageOpen, CheckCircle2, Truck, Wand2
} from 'lucide-react';

// --- CUSTOM MOCKS TO FIX IMPORT ERRORS WHILE KEEPING FULL UI ---
const useLanguage = () => ({ lang: 'en' });
const supabase = {
  from: (table: string) => ({
    select: (cols: string) => ({
      order: (col: string, opts: any) => Promise.resolve({ data: [] })
    })
  })
};
// ----------------------------------

const apiKey = ""; // Gemini API key provided by environment

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Fleet & Workforce Center", subtitle: "Monitor real-time status of delivery personnel and enterprise vehicles.",
    tabStaff: "Workforce Status", tabFleet: "Fleet Status", refresh: "Sync Data", newBooking: "New Booking",
    thName: "Name / Code", thRole: "Role", thPhone: "Contact", thStatus: "Status",
    thVeh: "Vehicle", thPlate: "Plate No.", thType: "Type", thCap: "Capacity"
  },
  mm: {
    title: "ဝန်ထမ်းနှင့် ယာဉ်များ ဗဟို", subtitle: "ပို့ဆောင်ရေးဝန်ထမ်းများနှင့် ကုမ္ပဏီသုံးယာဉ်များ၏ လက်ရှိအခြေအနေကို စောင့်ကြည့်ပါ။",
    tabStaff: "ဝန်ထမ်း အခြေအနေ", tabFleet: "ယာဉ် အခြေအနေ", refresh: "ဒေတာ ဆန်းသစ်ရန်", newBooking: "ဘွတ်ကင်အသစ်တင်ရန်",
    thName: "အမည် / ကုဒ်", thRole: "ရာထူး", thPhone: "ဖုန်း", thStatus: "အခြေအနေ",
    thVeh: "ယာဉ်", thPlate: "နံပါတ်ပြား", thType: "အမျိုးအစား", thCap: "စွမ်းရည်"
  }
};

export default function DispatchCenterPage() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [activeView, setActiveView] = useState<'DASHBOARD' | 'BOOKING'>('DASHBOARD');
  
  const [staff, setStaff] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  // Booking Form State
  const [booking, setBooking] = useState({
    receiverName: '',
    receiverPhone: '',
    address: '',
    itemDescription: '',
    region: 'yangon',
    township: '',
    weight: 1,
    service: 'standard',
    cod: ''
  });

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, f] = await Promise.all([
        supabase.from('be_mobile_workforce_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('be_fleet_master').select('*').order('created_at', { ascending: false })
      ]);
      setStaff(s.data || []); setFleet(f.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const activeStaff = staff.filter(s => s.is_active !== false).length;
  const activeFleet = fleet.filter(f => String(f.status).toUpperCase() === 'AVAILABLE').length;

  const calculateCosts = () => {
    let basePrice = 0;
    if (booking.region === 'yangon') {
      basePrice = parseInt(booking.township) || 0;
    } else if (booking.region === 'mandalay') {
      basePrice = 3000;
    } else {
      basePrice = 3500;
    }

    let weightPrice = 0;
    if (booking.weight > 1) {
      weightPrice = (booking.weight - 1) * 500;
    }

    let subtotal = basePrice + weightPrice;
    if (booking.service === 'express') {
      subtotal += 1000;
    }

    return { basePrice, weightPrice, subtotal };
  };

  const costs = calculateCosts();

  // --- GEMINI API INTEGRATION ---
  const handleAiExtract = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError('');

    const systemInstruction = `You are an AI assistant for a logistics company. Parse the given unstructured customer message into a structured JSON object.
    Required JSON keys:
    - "receiverName": (string) The name of the recipient. Extract the best matching name.
    - "receiverPhone": (string) The phone number of the recipient. Extract numbers.
    - "address": (string) The full delivery address.
    - "itemDescription": (string) The description of the items being sent.
    If any field is missing, leave it as an empty string "".
    Return ONLY valid JSON format.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: aiInput }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: "application/json" }
    };

    let retries = 5;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('API Request Failed');
        
        const data = await res.json();
        const extracted = JSON.parse(data.candidates[0].content.parts[0].text);
        
        setBooking(prev => ({
          ...prev,
          receiverName: extracted.receiverName || prev.receiverName,
          receiverPhone: extracted.receiverPhone || prev.receiverPhone,
          address: extracted.address || prev.address,
          itemDescription: extracted.itemDescription || prev.itemDescription,
        }));
        
        setAiInput('');
        break; // Success, exit retry loop
      } catch (err) {
        if (i === retries - 1) {
          setAiError("အချက်အလက် ရယူရာတွင် အခက်အခဲရှိနေပါသည်။ ကျေးဇူးပြု၍ ပြန်လည်ကြိုးစားပါ။");
        } else {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
    setAiLoading(false);
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('Order Placed Successfully! (ဘွတ်ကင် အောင်မြင်ပါသည်)');
    setTimeout(() => {
      setSuccessMessage('');
      setActiveView('DASHBOARD');
      setBooking({
        receiverName: '', receiverPhone: '', address: '', itemDescription: '',
        region: 'yangon', township: '', weight: 1, service: 'standard', cod: ''
      });
    }, 2000);
  };

  if (activeView === 'DASHBOARD') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
          
          <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyItems: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{flex: 1}}>
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Users2 size={16} /> <span>Resource Management</span></div>
              <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
              <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setActiveView('BOOKING')} style={{ background: C.gold, color: C.bg, height: 42, padding: '0 20px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body, border: 'none' }}>
                <PlusCircle size={18} /> {t.newBooking}
              </button>
              <button onClick={load} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, height: 42, padding: '0 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
              </button>
            </div>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            
            {/* WORKFORCE PANEL */}
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
              <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.tabStaff}</h2><p style={{ margin: '4px 0 0', color: C.success, fontSize: 13, fontWeight: 700 }}>{activeStaff} Active Personnel</p></div>
                <Activity size={24} color={C.muted} />
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                    <tr>{[t.thName, t.thRole, t.thPhone, t.thStatus].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {staff.map(s => {
                      const active = s.is_active !== false;
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}40`, opacity: active ? 1 : 0.5 }} className="hover:bg-[#0f2a42]">
                          <td style={{ padding: '14px 16px' }}><div style={{ fontWeight: 800, fontSize: 14 }}>{s.display_name}</div><div style={{ fontSize: 11, color: C.muted }}>{s.workforce_code}</div></td>
                          <td style={{ padding: '14px 16px', fontWeight: 800, color: C.info }}>{s.role}</td>
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>{s.phone || '-'}</td>
                          <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 900, background: active ? 'rgba(34,197,94,0.1)' : 'rgba(255,79,134,0.1)', color: active ? C.success : C.error }}>{active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* FLEET PANEL */}
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
              <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.tabFleet}</h2><p style={{ margin: '4px 0 0', color: C.gold, fontSize: 13, fontWeight: 700 }}>{activeFleet} Vehicles Available</p></div>
                <CarFront size={24} color={C.muted} />
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                    <tr>{[t.thVeh, t.thPlate, t.thType, t.thStatus].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fleet.map(f => {
                      const status = String(f.status || 'AVAILABLE').toUpperCase();
                      const ready = status === 'AVAILABLE';
                      return (
                        <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}40`, opacity: ready ? 1 : 0.6 }} className="hover:bg-[#0f2a42]">
                          <td style={{ padding: '14px 16px', fontWeight: 800 }}>{f.vehicle_code}</td>
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: C.text2 }}>{f.registration_no}</td>
                          <td style={{ padding: '14px 16px', color: C.muted }}>{f.vehicle_type}</td>
                          <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 900, background: ready ? 'rgba(246,184,75,0.1)' : 'rgba(255,79,134,0.1)', color: ready ? C.gold : C.error }}>{status}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f4f6f9', fontFamily: "'Segoe UI', sans-serif", minHeight: '100vh', display: 'flex', color: '#333' }}>
      
      {/* Sidebar (Adapted from HTML) */}
      <div className="hidden md:block" style={{ width: '16.666667%', backgroundColor: '#0d2c54', color: 'white', minHeight: '100vh' }}>
        <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Truck size={32} color="#ff6b00" style={{ margin: '0 auto 8px' }} />
          <h5 style={{ fontWeight: 'bold', margin: 0, fontSize: '1.25rem' }}>My Britium</h5>
        </div>
        <nav style={{ marginTop: '16px' }}>
          <button onClick={() => setActiveView('DASHBOARD')} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: '0.2s' }}>
            <Home size={18} /> Dashboard
          </button>
          <a href="#" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={18} /> My Shipments
          </a>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', borderLeft: '4px solid #ff6b00', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={18} /> New Booking
          </div>
          <a href="#" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} /> Profile
          </a>
          <button onClick={() => setActiveView('DASHBOARD')} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '40px', cursor: 'pointer' }}>
            <LogOut size={18} /> Back to Portal
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', position: 'relative' }}>
        
        {/* Success Modal/Alert */}
        {successMessage && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: '#198754', color: 'white', padding: '15px 25px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 1000 }}>
            <CheckCircle2 size={24} />
            <span style={{ fontWeight: 600 }}>{successMessage}</span>
          </div>
        )}

        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
             <button onClick={() => setActiveView('DASHBOARD')} className="md:hidden" style={{ background: '#0d2c54', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px' }}>Back</button>
             <h3 style={{ fontWeight: 'bold', margin: 0, fontSize: '1.75rem' }}>Create New Shipment</h3>
          </div>
          
          <form onSubmit={handleBookingSubmit}>
            <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-12px' }}>
              
              {/* Left Column - Forms */}
              <div style={{ width: '100%', padding: '12px' }} className="lg:w-2/3">

                {/* AI MAGIC PASTE COMPONENT */}
                <div style={{ background: '#fff9f0', border: '2px dashed #ffb067', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                  <h5 style={{ fontWeight: 700, color: '#e65c00', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Wand2 size={20} /> ✨ AI Magic Paste (စမတ်ဖြည့်သွင်းခြင်း)
                  </h5>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
                    ဖောက်သည်ပေးပို့လိုက်သော စာသားကို ဤနေရာတွင် ထည့်ပါ။ အမည်၊ ဖုန်း၊ လိပ်စာတို့ကို အလိုအလျောက် ဖြည့်သွင်းပေးပါမည်။
                  </p>
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    rows={3}
                    placeholder="e.g. ကိုကျော်၊ ဝ၉၁၂၃၄၅၆၇၈၊ အမှတ် ၁၊ ဗိုလ်ချုပ်လမ်း၊ ရန်ကုန်။ အင်္ကျီ ၂ ထည်"
                    style={{ width: '100%', padding: '12px', border: '1px solid #ffcca3', borderRadius: '6px', marginBottom: '12px', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                      type="button"
                      onClick={handleAiExtract}
                      disabled={aiLoading || !aiInput.trim()}
                      style={{ 
                        background: '#ff6b00', color: 'white', border: 'none', padding: '10px 20px', 
                        borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                        cursor: aiLoading || !aiInput.trim() ? 'not-allowed' : 'pointer', opacity: aiLoading || !aiInput.trim() ? 0.7 : 1
                      }}
                    >
                      {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                      {aiLoading ? '✨ အချက်အလက် ခွဲခြားနေပါသည်...' : '✨ အလိုအလျောက် ဖြည့်မည်'}
                    </button>
                    {aiError && <span style={{ color: '#dc3545', fontSize: '13px', fontWeight: 500 }}>{aiError}</span>}
                  </div>
                </div>
                
                {/* Sender Information */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '25px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <h5 style={{ fontWeight: 700, color: '#0d2c54', borderBottom: '2px solid #f0f0f0', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserCircle size={20} /> Sender Information
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Name / Shop Name</label>
                      <input type="text" value="Kyaw Wannanna" readOnly style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#e9ecef', color: '#495057' }} />
                    </div>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Phone Number</label>
                      <input type="text" value="09897447744" readOnly style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#e9ecef', color: '#495057' }} />
                    </div>
                    <div style={{ width: '100%', padding: '8px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Pickup Address</label>
                      <textarea rows={2} readOnly value="No. 277, Corner of Anawrahta Road, East Dagon Township" style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#e9ecef', color: '#495057', resize: 'vertical' }} />
                    </div>
                  </div>
                </div>

                {/* Receiver Information */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '25px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <h5 style={{ fontWeight: 700, color: '#0d2c54', borderBottom: '2px solid #f0f0f0', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={20} /> Receiver Information
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Receiver Name</label>
                      <input 
                        type="text" 
                        value={booking.receiverName}
                        onChange={(e) => setBooking({...booking, receiverName: e.target.value})}
                        placeholder="Enter Name" 
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', transition: '0.3s' }} 
                        className={booking.receiverName ? 'bg-orange-50/30' : ''}
                      />
                    </div>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Receiver Phone</label>
                      <input 
                        type="text" 
                        value={booking.receiverPhone}
                        onChange={(e) => setBooking({...booking, receiverPhone: e.target.value})}
                        placeholder="09xxxxxxxxx" 
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', transition: '0.3s' }} 
                        className={booking.receiverPhone ? 'bg-orange-50/30' : ''}
                      />
                    </div>
                    
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Destination City</label>
                      <select 
                        value={booking.region}
                        onChange={(e) => setBooking({ ...booking, region: e.target.value, township: '' })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: 'white' }}
                      >
                        <option value="yangon">Yangon</option>
                        <option value="mandalay">Mandalay</option>
                        <option value="npt">Nay Pyi Taw</option>
                      </select>
                    </div>
                    
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Township (Zone)</label>
                      <select 
                        disabled={booking.region !== 'yangon'}
                        value={booking.township}
                        onChange={(e) => setBooking({ ...booking, township: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: booking.region !== 'yangon' ? '#e9ecef' : 'white' }}
                      >
                        <option value="" disabled>Select Township</option>
                        <optgroup label="Zone 1 (3000 MMK)">
                          <option value="3000">Ahlone, Bahan, Latha, etc.</option>
                        </optgroup>
                        <optgroup label="Zone 2 (3500 MMK)">
                          <option value="3500">North Dagon, South Dagon, etc.</option>
                        </optgroup>
                        <optgroup label="Zone 3 (4500 MMK)">
                          <option value="4500">Hmawbi, Thanlyin, etc.</option>
                        </optgroup>
                      </select>
                    </div>

                    <div style={{ width: '100%', padding: '8px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Full Address</label>
                      <input 
                        type="text" 
                        value={booking.address}
                        onChange={(e) => setBooking({...booking, address: e.target.value})}
                        placeholder="Street name, Building No, Floor" 
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', transition: '0.3s' }} 
                        className={booking.address ? 'bg-orange-50/30' : ''}
                      />
                    </div>
                  </div>
                </div>

                {/* Package & Service */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '25px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <h5 style={{ fontWeight: 700, color: '#0d2c54', borderBottom: '2px solid #f0f0f0', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PackageOpen size={20} /> Package & Service
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-8px' }}>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/3">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Weight (Kg)</label>
                      <input 
                        type="number" 
                        value={booking.weight} 
                        min="0.5" 
                        step="0.5" 
                        onChange={(e) => setBooking({ ...booking, weight: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px' }} 
                      />
                    </div>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/3">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Items Description</label>
                      <input 
                        type="text" 
                        value={booking.itemDescription}
                        onChange={(e) => setBooking({...booking, itemDescription: e.target.value})}
                        placeholder="e.g. Clothes, Document" 
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', transition: '0.3s' }} 
                        className={booking.itemDescription ? 'bg-orange-50/30' : ''}
                      />
                    </div>
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/3">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Service Type</label>
                      <select 
                        value={booking.service}
                        onChange={(e) => setBooking({ ...booking, service: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: 'white' }}
                      >
                        <option value="standard">Standard (1-2 Days)</option>
                        <option value="express">Priority (Same Day)</option>
                      </select>
                    </div>
                    
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#dc3545' }}>COD Amount (To Collect)</label>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ padding: '8px 12px', backgroundColor: '#e9ecef', border: '1px solid #dee2e6', borderRight: 'none', borderRadius: '6px 0 0 6px', color: '#495057' }}>MMK</span>
                        <input 
                          type="number" 
                          placeholder="0" 
                          value={booking.cod}
                          onChange={(e) => setBooking({ ...booking, cod: e.target.value })}
                          style={{ flex: 1, padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '0 6px 6px 0' }} 
                        />
                      </div>
                      <div style={{ fontSize: '0.875em', color: '#6c757d', marginTop: '4px' }}>Leave 0 if item is already paid.</div>
                    </div>
                    
                    <div style={{ width: '100%', padding: '8px' }} className="md:w-1/2">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Who Pays Shipping?</label>
                      <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: 'white' }}>
                        <option>Sender (Pre-paid)</option>
                        <option>Receiver (Collect on Delivery)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column - Summary */}
              <div style={{ width: '100%', padding: '12px' }} className="lg:w-1/3">
                <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '25px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', position: 'sticky', top: '20px' }}>
                  <h5 style={{ fontWeight: 'bold', marginBottom: '20px', fontSize: '1.25rem' }}>Order Summary</h5>
                  
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0' }}>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#495057' }}>Base Rate</span>
                      <span style={{ fontWeight: 600 }}>{costs.basePrice > 0 ? costs.basePrice : '--'}</span>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#495057' }}>Weight Charge</span>
                      <span style={{ fontWeight: 600 }}>{costs.weightPrice}</span>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0', color: '#198754' }}>
                      <span style={{ fontWeight: 500 }}>Pickup Fee</span>
                      <span style={{ fontWeight: 'bold' }}>FREE</span>
                    </li>
                  </ul>
                  
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <small style={{ textTransform: 'uppercase', color: '#6c757d', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Total Estimated Cost</small>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ff6b00', lineHeight: 1 }}>
                      {costs.subtotal > 0 ? costs.subtotal.toLocaleString() : '0'} <span style={{ fontSize: '1rem', fontWeight: 600 }}>MMK</span>
                    </div>
                  </div>

                  <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#ff6b00', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(255,107,0,0.2)' }}>
                    <CheckCircle2 size={20} /> CONFIRM BOOKING
                  </button>
                  <p style={{ textAlign: 'center', fontSize: '0.875em', color: '#6c757d', margin: '16px 0 0 0' }}>Rider will be assigned within 30 mins.</p>
                </div>
              </div>

            </div>
          </form>

        </div>
      </div>

    </div>
  );
}