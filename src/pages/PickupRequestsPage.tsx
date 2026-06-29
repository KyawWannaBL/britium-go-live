import React, { useState, useEffect, useMemo } from 'react';
import { Package, Truck, User, MapPin, CreditCard, Calculator, FileText, Send, Loader2 } from 'lucide-react';

// --- MOCK SUPABASE TO FIX IMPORT ERRORS IN PREVIEW ---
// When moving to your actual project, replace this with: 
// import { supabase } from '@/integrations/supabase/client';
const supabase = {
  from: (table: string) => ({
    select: (cols: string) => ({
      eq: (col: string, val: any) => Promise.resolve({ data: [] }),
      order: () => Promise.resolve({ data: [] })
    }),
    insert: (data: any) => Promise.resolve({ error: null })
  })
};
// -----------------------------------------------------

// --- MOCK MASTER DATA (Matches your provided CSV) ---
const MOCK_MERCHANTS = [
  { id: 'ALN', merchant_code: 'ALN', merchant_name: 'Alnoor', phone_primary: '09448088835', address_line_1: 'No. (1526), Ward (45), Zawgyi Road, North Dagon', township: 'North Dagon', city: 'Yangon' },
  { id: 'BBG', merchant_code: 'BBG', merchant_name: 'Baby Genius', phone_primary: '09766482813', address_line_1: 'No. (284/979), Bo Moe Kyo Road, Ward (9), East Dagon', township: 'East Dagon', city: 'Yangon' },
  { id: 'BBK', merchant_code: 'BBK', merchant_name: 'Baby Kyaw', phone_primary: '09796491867', address_line_1: 'No. (115-Ka), Ward (9), Yuzana Road, Shwe Pyi Thar', township: 'Shwe Pyi Thar', city: 'Yangon' },
  { id: 'MDY', merchant_code: 'MDY', merchant_name: 'Mandalay Branch', phone_primary: '09765540091', address_line_1: 'House No. (B/4), 65th Street, between 30th and 31st Streets', township: 'Mandalay', city: 'Mandalay' }
];

const MOCK_TOWNSHIPS = [
  { township_name: 'North Dagon' }, { township_name: 'East Dagon' }, 
  { township_name: 'Shwe Pyi Thar' }, { township_name: 'Mandalay' },
  { township_name: 'Bahan' }, { township_name: 'Yankin' }, { township_name: 'Kamayut' }
];
// -----------------------------------------------------

const C = { bg: '#040d17', panel: '#091a2f', panelHover: '#0f2a42', border: '#1e3a5f', gold: '#fbbf24', text: '#e2e8f0', muted: '#64748b' };
const FF = { body: "'Poppins', sans-serif" };

export default function PickupFormPage() {
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false); // Set to false since using mocks here
  const [merchants, setMerchants] = useState<any[]>(MOCK_MERCHANTS);
  const [townships, setTownships] = useState<any[]>(MOCK_TOWNSHIPS);
  
  const today = new Date().toISOString().slice(0, 10);
  
  // Format MM/DD
  const dateObj = new Date(today);
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${mm}${dd}`;

  const [form, setForm] = useState({
    merchantId: '', merchantName: '', merchantCode: '', senderPhone: '', pickupAddress: '', 
    pickupTownship: '', pickupCity: 'Yangon', parcelCount: 1, pickupDate: today, pickupTime: '09:00',
    recipientName: '', recipientPhone: '', deliveryTownship: '', deliveryAddress: '',
    paymentMethod: 'COD', codAmount: 0, serviceType: 'Standard', priority: 'Normal',
    tier: 'Standard (3 kg allowance)', weightKg: 1, baseFee: 4000, isHighway: false, remarks: ''
  });

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleMerchantSelect = (code: string) => {
    const m = merchants.find(x => x.merchant_code === code || x.id === code);
    if (m) {
      setForm(prev => ({
        ...prev,
        merchantId: m.id || m.merchant_code,
        merchantCode: m.merchant_code,
        merchantName: m.merchant_name,
        senderPhone: m.phone_primary || '',
        pickupAddress: m.address_line_1 || m.default_pickup_address || '',
        pickupTownship: m.township || '',
        pickupCity: m.city || 'Yangon',
      }));
    } else {
      set('merchantCode', code);
    }
  };

  const mCode = form.merchantCode || 'XXX';
  const countStr = String(form.parcelCount).padStart(3, '0');
  
  const pickupId = `P${dateStr}-${mCode}-${countStr}`;
  
  const formatRange = (prefix: string) => {
    if (form.parcelCount <= 1) return `${prefix}${dateStr}-${mCode}-001`;
    return `${prefix}${dateStr}-${mCode}-001 to ${countStr}`;
  };

  const deliverId = formatRange('D');
  const invoiceNo = formatRange('INV');
  const waybillNo = formatRange('WB');

  const tariff = useMemo(() => {
    const ceilWt = Math.ceil(form.weightKg);
    const allow = form.tier.includes('Royal') ? 5 : 3;
    const extra = Math.max(0, ceilWt - allow);
    const surcharge = extra * 500;
    const hwFee = form.isHighway ? 3000 : 0;
    return { ceilWt, allow, extra, surcharge, hwFee, total: form.baseFee + surcharge + hwFee };
  }, [form.weightKg, form.tier, form.baseFee, form.isHighway]);

  const handleSubmit = async () => {
    if (!form.merchantCode || !form.pickupAddress) {
      alert("Merchant and Pickup Address are required."); return;
    }
    setLoading(true);
    try {
      const payload = {
        pickup_id: pickupId,
        merchant_code: form.merchantCode,
        merchant_name: form.merchantName,
        pickup_address: form.pickupAddress,
        township: form.pickupTownship,
        city: form.pickupCity,
        expected_parcels: form.parcelCount,
        pickup_date: form.pickupDate,
        payment_terms: form.paymentMethod,
        vehicle_type: 'Bike', 
        pickup_status: 'PICKUP_REQUESTED',
        supervisor_status: 'PENDING_ASSIGNMENT',
        workflow_stage: 'PICKUP_REQUESTED',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('be_portal_pickup_requests').insert([payload]);
      if (error) throw error;

      await supabase.from('be_app_notifications').insert([{
        recipient_role: 'supervisor',
        notification_type: 'PICKUP_REQUESTED',
        title: 'New Pickup Request',
        message: `New pickup request received: ${pickupId} for ${form.merchantName}`,
        pickup_id: pickupId,
        is_read: false
      }]);

      alert(`Pickup ${pickupId} Submitted to Supervisor Queue! \nWayplan generated for Rider App.`);
      setForm(prev => ({ ...prev, parcelCount: 1, recipientName: '', recipientPhone: '', deliveryAddress: '', codAmount: 0 }));
    } catch (e: any) {
      alert(e?.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full bg-[#040d17] border border-[#1e3a5f] rounded-lg px-4 py-3 text-[#e2e8f0] text-sm focus:outline-none focus:border-[#fbbf24] transition-colors`;
  const labelClass = `block text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-2`;

  const SectionHeader = ({ num, title, subtitle }: { num: string, title: string, subtitle?: string }) => (
    <div className="mb-5 border-b border-[#1e3a5f] pb-3">
      <h2 className="text-[16px] font-bold text-[#e2e8f0] flex items-center gap-2"><span className="text-[#fbbf24]">{num}.</span> {title}</h2>
      {subtitle && <p className="text-[11px] text-[#64748b] mt-1 ml-6">{subtitle}</p>}
    </div>
  );

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: C.bg, fontFamily: FF.body }}>
      <div className="max-w-[1500px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#1e3a5f] pb-4">
          <div>
            <h1 className="text-2xl font-black text-[#fbbf24] uppercase tracking-widest">PICKUP REQUEST FORM</h1>
            <p className="text-xs text-[#64748b] mt-1">Register a new pickup with auto-generated IDs and real-time tariff preview.</p>
          </div>
          <div className="flex bg-[#091a2f] border border-[#1e3a5f] rounded-lg overflow-hidden h-10">
            <button className="px-5 text-xs font-bold bg-[#1e3a5f] text-white">EN</button>
            <button className="px-5 text-xs font-bold text-[#64748b]">မြန်မာ</button>
          </div>
        </div>

        {/* 0. System Generated IDs */}
        <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
          <SectionHeader num="⚙" title="System Generated IDs" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <div><label className={labelClass}>PICKUP ID</label><div className="text-[#ff4f86] font-mono font-bold text-xl">{pickupId}</div></div>
             <div><label className={labelClass}>DELIVER ID</label><div className="text-[#fbbf24] font-mono font-bold text-xl">{deliverId}</div></div>
             <div><label className={labelClass}>INVOICE NO</label><div className="text-[#e2e8f0] font-mono font-bold text-xl">{invoiceNo}</div></div>
             <div><label className={labelClass}>WAYBILL NO</label><div className="text-[#e2e8f0] font-mono font-bold text-xl">{waybillNo}</div></div>
          </div>
        </div>

        {/* 1. Merchant / Sender */}
        <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
          <SectionHeader num="1" title="Merchant / Sender" subtitle="Select merchant to auto-fill name and code" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <div>
               <label className={labelClass}>MERCHANT ID</label>
               <select className={inputClass} value={form.merchantCode} onChange={(e) => handleMerchantSelect(e.target.value)} disabled={masterLoading}>
                 <option value="">{masterLoading ? 'Loading...' : '— Select Merchant —'}</option>
                 {merchants.map((m, i) => <option key={i} value={m.merchant_code}>{m.merchant_code} - {m.merchant_name}</option>)}
               </select>
             </div>
             <div>
               <label className={labelClass}>MERCHANT NAME</label>
               <input readOnly className={inputClass} style={{opacity: 0.7}} value={form.merchantName} placeholder="Auto-filled from ID" />
             </div>
             <div>
               <label className={labelClass}>MERCHANT CODE (3-LETTER)</label>
               <input readOnly className={inputClass} style={{opacity: 0.7}} value={form.merchantCode} placeholder="e.g. BBK" />
             </div>
             <div>
               <label className={labelClass}>SENDER PHONE</label>
               <input className={inputClass} value={form.senderPhone} onChange={e => set('senderPhone', e.target.value)} placeholder="+95 9 XXX XXXX" />
             </div>
          </div>
        </div>

        {/* 2. Pickup Details */}
        <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
          <SectionHeader num="2" title="Pickup Details" subtitle="Where and when the rider should collect the parcel(s)" />
          <div className="space-y-6">
            <div>
              <label className={labelClass}>PICKUP ADDRESS</label>
              <input className={inputClass} value={form.pickupAddress} onChange={e => set('pickupAddress', e.target.value)} placeholder="Full pickup address" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
               <div>
                 <label className={labelClass}>PICKUP TOWNSHIP</label>
                 <select className={inputClass} value={form.pickupTownship} onChange={e => set('pickupTownship', e.target.value)}>
                   <option value="">— Select Township —</option>
                   {townships.map((t, i) => <option key={i} value={t.township_name}>{t.township_name}</option>)}
                 </select>
               </div>
               <div><label className={labelClass}>PICKUP CITY</label><input className={inputClass} value={form.pickupCity} onChange={e => set('pickupCity', e.target.value)} /></div>
               <div><label className={labelClass}>PARCEL COUNT</label><input type="number" min="1" className={inputClass} value={form.parcelCount} onChange={e => set('parcelCount', parseInt(e.target.value)||1)} /></div>
               <div><label className={labelClass}>PICKUP DATE</label><input type="date" className={inputClass} value={form.pickupDate} onChange={e => set('pickupDate', e.target.value)} /></div>
               <div><label className={labelClass}>PICKUP TIME</label><input type="time" className={inputClass} value={form.pickupTime} onChange={e => set('pickupTime', e.target.value)} /></div>
            </div>
          </div>
        </div>

        {/* 3. Recipient Details */}
        <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
          <SectionHeader num="3" title="Recipient Details" subtitle="Delivery destination and contact" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <div><label className={labelClass}>RECIPIENT NAME</label><input className={inputClass} value={form.recipientName} onChange={e => set('recipientName', e.target.value)} placeholder="Recipient full name" /></div>
             <div><label className={labelClass}>RECIPIENT PHONE</label><input className={inputClass} value={form.recipientPhone} onChange={e => set('recipientPhone', e.target.value)} placeholder="+95 9 XXX XXXX" /></div>
             <div>
               <label className={labelClass}>DELIVERY TOWNSHIP</label>
               <select className={inputClass} value={form.deliveryTownship} onChange={e => set('deliveryTownship', e.target.value)}>
                 <option value="">— Select Township —</option>
                 {townships.map((t, i) => <option key={i} value={t.township_name}>{t.township_name}</option>)}
               </select>
             </div>
             <div><label className={labelClass}>DELIVERY ADDRESS</label><input className={inputClass} value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} placeholder="Full delivery address" /></div>
          </div>
        </div>

        {/* 4. Combined Terms & Tariff */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg flex flex-col">
            <SectionHeader num="4" title="Commercial Terms" subtitle="Payment method, COD amount, service and priority tier" />
            <div className="grid grid-cols-2 gap-6 flex-1">
              <div className="col-span-2">
                <label className={labelClass}>PAYMENT METHOD</label>
                <select className={inputClass} value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                  <option>COD</option><option>Prepaid</option><option>Monthly</option>
                </select>
              </div>
              <div><label className={labelClass}>COD AMOUNT (MMK)</label><input type="number" className={inputClass} value={form.codAmount} onChange={e => set('codAmount', parseInt(e.target.value)||0)} /></div>
              <div>
                <label className={labelClass}>SERVICE TYPE</label>
                <select className={inputClass} value={form.serviceType} onChange={e => set('serviceType', e.target.value)}>
                  <option>Standard</option><option>Express</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
            <SectionHeader num="5" title="Tariff Preview" subtitle="Real-time tariff calculation based on weight and tier" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><label className={labelClass}>WEIGHT (KG)</label><input type="number" step="0.1" className={inputClass} value={form.weightKg} onChange={e => set('weightKg', parseFloat(e.target.value)||1)} /></div>
              <div><label className={labelClass}>BASE FEE (MMK)</label><input type="number" className={inputClass} value={form.baseFee} onChange={e => set('baseFee', parseInt(e.target.value)||0)} /></div>
            </div>
            
            <div className="flex justify-between text-[11px] text-[#64748b] border-t border-[#1e3a5f] pt-4 mb-2 font-bold">
              <div>BASE FEE<br/><span className="text-[#e2e8f0] text-sm">{form.baseFee.toLocaleString()}</span></div>
              <div>ALLOWANCE<br/><span className="text-[#e2e8f0] text-sm">{tariff.allow} kg</span></div>
              <div>EXTRA WT<br/><span className="text-[#e2e8f0] text-sm">{tariff.extra} kg</span></div>
              <div>SURCHARGE<br/><span className="text-[#e2e8f0] text-sm">{tariff.surcharge.toLocaleString()}</span></div>
            </div>
            <div className="flex justify-between items-center pt-2 mt-2 border-t border-[#1e3a5f]">
              <span className="text-[12px] text-[#64748b] font-bold">TOTAL TARIFF</span>
              <span className="text-3xl font-black text-[#fbbf24]">{tariff.total.toLocaleString()} <span className="text-sm text-[#e2e8f0]">MMK</span></span>
            </div>
          </div>
        </div>

        {/* 6. Remarks */}
        <div className="bg-[#091a2f] p-6 rounded-xl border border-[#1e3a5f] shadow-lg">
          <SectionHeader num="6" title="Special Instructions / Remarks" />
          <textarea 
            className={`${inputClass} resize-none h-24`} 
            placeholder="Any special instructions for pickup or delivery..."
            value={form.remarks}
            onChange={e => set('remarks', e.target.value)}
          />
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-[#fbbf24] hover:bg-[#f59e0b] disabled:opacity-50 text-[#040d17] font-black text-[15px] py-5 rounded-xl transition-colors uppercase tracking-widest mt-4 shadow-[0_0_20px_rgba(251,191,36,0.3)] flex justify-center items-center gap-3"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />} 
          Submit Pickup Request
        </button>

      </div>
    </div>
  );
}