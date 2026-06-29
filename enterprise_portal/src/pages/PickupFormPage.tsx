import React, { useState, useEffect, useMemo } from 'react';
import { Package, Send, Download, Filter, UploadCloud, Globe, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

// Safe translation fallback
const getT = (lang: string) => (en: string, mm: string) => lang === 'en' ? en : mm;

type MerchantOption = {
  merchant_id?: string | null;
  merchant_code: string;
  merchant_name: string;
  business_type?: string | null;
  default_pickup_address?: string | null;
  township?: string | null;
  city?: string | null;
  region_state?: string | null;
};

type TownshipOption = {
  township: string;
  city?: string | null;
  region_state?: string | null;
};

type PickupFormState = {
  merchant_code: string;
  business_type: string;
  payment_type: string;
  pickup_address: string;
  township: string;
  city: string;
  region_state: string;
  expected_parcels: number;
  pickup_date: string;
  vehicle_required: string;
  pickup_remark: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm: PickupFormState = {
  merchant_code: '',
  business_type: '',
  payment_type: 'COD',
  pickup_address: '',
  township: '',
  city: 'Yangon',
  region_state: 'Yangon Region',
  expected_parcels: 1,
  pickup_date: todayISO(),
  vehicle_required: 'Bike',
  pickup_remark: '',
};

function norm(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export default function PickupFormPage() {
  const { lang, setLang } = useLanguage();
  const t = getT(lang || 'en');

  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [form, setForm] = useState<PickupFormState>(initialForm);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [townships, setTownships] = useState<TownshipOption[]>([]);

  const selectedMerchant = useMemo(
    () => merchants.find((m) => norm(m.merchant_code) === norm(form.merchant_code)),
    [merchants, form.merchant_code]
  );

  // Wires up the frontend to the new secure RPC backend
  useEffect(() => {
    let mounted = true;

    async function loadMasters() {
      setMasterLoading(true);
      try {
        const { data, error } = await supabase.rpc('be_master_dropdown_snapshot');

        if (error) throw error;

        if (mounted && data) {
          // Map the secure RPC payload to the form's state requirements
          const rawMerchants = (data as any).merchants || [];
          
          const formattedMerchants: MerchantOption[] = rawMerchants.map((m: any) => ({
            merchant_id: m.merchant_id,
            merchant_code: m.merchant_code,
            merchant_name: m.merchant_name,
            business_type: m.service_profile || 'Standard',
            default_pickup_address: m.pickup_address,
            township: m.pickup_township,
            city: m.pickup_city || 'Yangon',
            region_state: 'Yangon Region'
          }));

          // Dynamically build the township list from active merchants
          const uniqueTownships = new Map<string, TownshipOption>();
          formattedMerchants.forEach(m => {
            if (m.township && !uniqueTownships.has(norm(m.township))) {
              uniqueTownships.set(norm(m.township), {
                township: m.township,
                city: m.city,
                region_state: m.region_state
              });
            }
          });

          setMerchants(formattedMerchants);
          setTownships(Array.from(uniqueTownships.values()).sort((a, b) => a.township.localeCompare(b.township)));
        }
      } catch (error: any) {
        console.error('Pickup master sync failed:', error);
        alert(error?.message || t('Failed to load pickup master data.', 'Master data ဖတ်ယူမှု မအောင်မြင်ပါ။'));
      } finally {
        if (mounted) setMasterLoading(false);
      }
    }

    loadMasters();

    return () => {
      mounted = false;
    };
  }, [t]);

  function updateForm(patch: Partial<PickupFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleMerchantChange(merchantCode: string) {
    const merchant = merchants.find((m) => norm(m.merchant_code) === norm(merchantCode));

    if (!merchant) {
      updateForm({ merchant_code: merchantCode });
      return;
    }

    const township = merchant.township || '';
    const townshipMaster = townships.find((x) => norm(x.township) === norm(township));

    updateForm({
      merchant_code: merchant.merchant_code,
      business_type: merchant.business_type || '',
      pickup_address: merchant.default_pickup_address || '',
      township,
      city: townshipMaster?.city || merchant.city || 'Yangon',
      region_state: townshipMaster?.region_state || merchant.region_state || 'Yangon Region',
      payment_type: form.payment_type || 'COD',
    });
  }

  function handleTownshipChange(value: string) {
    const townshipMaster = townships.find((x) => norm(x.township) === norm(value));

    updateForm({
      township: value,
      city: townshipMaster?.city || form.city || selectedMerchant?.city || 'Yangon',
      region_state:
        townshipMaster?.region_state ||
        form.region_state ||
        selectedMerchant?.region_state ||
        'Yangon Region',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (!form.merchant_code) throw new Error('Merchant is required.');
      if (!form.township.trim()) throw new Error('Township is required.');
      if (!form.pickup_address.trim()) throw new Error('Pickup address is required.');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await (supabase as any).rpc('be_create_pickup_request_from_master', {
        p_merchant_code: form.merchant_code,
        p_expected_parcels: Number(form.expected_parcels || 1),
        p_pickup_date: form.pickup_date,
        p_vehicle_required: form.vehicle_required,
        p_payment_type: form.payment_type || 'COD',
        p_actor_email: user?.email ?? null,

        // Optional overrides
        p_pickup_address_override: form.pickup_address.trim(),
        p_township_override: form.township.trim(),
        p_city_override: form.city || null,
        p_region_state_override: form.region_state || null,
        p_pickup_remark: form.pickup_remark.trim() || null,
      });

      if (error) throw error;

      setSuccessMsg(t(
        `Pickup request created: ${data?.pickup_id || data?.pickup_way_id || ''}`,
        `တောင်းဆိုမှု အောင်မြင်ပါသည်။: ${data?.pickup_id || data?.pickup_way_id || ''}`
      ));
      
      setTimeout(() => setSuccessMsg(''), 5000);

      setForm({
        ...initialForm,
        pickup_date: form.pickup_date,
        vehicle_required: form.vehicle_required,
        payment_type: form.payment_type || 'COD',
      });
    } catch (error: any) {
      console.error('Pickup submit failed:', error);
      alert(error?.message || t('Pickup request failed.', 'တောင်းဆိုမှု မအောင်မြင်ပါ။'));
    } finally {
      setLoading(false);
    }
  }

  const downloadFile = (fileName: string) => {
    const link = document.createElement('a');
    link.href = `/templates/${fileName}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        
        {/* Header & Language Toggle */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#1a3a5c] pb-4 gap-4">
          <div>
            <h1 className="text-[#f6b84b] text-[18px] md:text-[22px] font-black uppercase tracking-widest">{t('ORDER PICKING REQUEST', 'ပစ္စည်းကောက်ယူရန် တောင်းဆိုမှု')}</h1>
            <p className="text-[#4d7a9b] text-[13px] font-medium">{t('Customer Service registers the pickup request to initiate the operational workflow.', 'CS မှ ပစ္စည်းကောက်ယူရန် ကနဦးတောင်းဆိုမှုကို စာရင်းသွင်းပါ။')}</p>
          </div>
          <div className="flex items-center gap-1 bg-[#081b2e] border border-[#1a3a5c] p-1.5 rounded-xl shadow-lg">
            <Globe size={14} className="text-[#4d7a9b] ml-2 mr-1" />
            <button onClick={() => setLang('en')} className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${lang === 'en' ? 'bg-[#1a3a5c] text-[#eef8ff]' : 'text-[#4d7a9b] hover:text-[#eef8ff]'}`}>EN</button>
            <button onClick={() => setLang('mm')} className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${lang === 'mm' ? 'bg-[#1a3a5c] text-[#eef8ff]' : 'text-[#4d7a9b] hover:text-[#eef8ff]'}`}>မြန်မာ</button>
          </div>
        </div>

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-center gap-3 font-bold text-[13px]">
            <CheckCircle2 size={18} /> {successMsg}
          </div>
        )}

        {/* Action Bar / Filters */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row gap-4 items-end">
          <div className="w-full lg:w-auto">
            <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={12} />
              {t('From Date', 'မှ')}
            </label>
            <input
              type="date"
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
            />
          </div>
          <div className="w-full lg:w-auto">
            <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={12} />
              {t('To Date', 'ထိ')}
            </label>
            <input
              type="date"
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
            />
          </div>
          <div className="flex gap-2 w-full lg:flex-1 justify-end">
            <button
              type="button"
              className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl text-[12px] font-bold uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download size={14} /> {t('Download Report', 'အစီရင်ခံစာ ရယူမည်')}
            </button>
            <button
              type="button"
              onClick={() => downloadFile('Britium_Data_Entry_UAT_GoLive_Template.xlsx')}
              className="bg-[#061524] text-[#4ea8de] border border-[#1a3a5c] px-6 py-3 rounded-xl text-[12px] font-bold uppercase tracking-wider hover:border-[#4ea8de] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download size={14} /> {t('Template', 'ပုံစံခွက်')}
            </button>
            <button
              type="button"
              className="bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UploadCloud size={14} /> {t('Bulk Upload', 'ဖိုင်တင်မည်')}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 shadow-xl">
            <h2 className="text-[13px] font-bold text-[#eef8ff] uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-[#1a3a5c] pb-3">
              <Package size={16} className="text-[#4ea8de]"/> 
              {t('Merchant & Parcel Details', 'ကုန်သည်နှင့် ပစ္စည်းအချက်အလက်')}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Merchant / Customer', 'ကုန်သည်')}
                </label>
                <select
                  value={form.merchant_code}
                  onChange={(e) => handleMerchantChange(e.target.value)}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                  required
                  disabled={masterLoading}
                >
                  <option value="">{masterLoading ? t('Loading...', 'ဖတ်နေသည်...') : t('-- Select Merchant --', '-- ရွေးပါ --')}</option>
                  {merchants.map((m) => (
                    <option key={m.merchant_code} value={m.merchant_code}>
                      {m.merchant_code} - {m.merchant_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Business Type', 'လုပ်ငန်းအမျိုးအစား')}
                </label>
                <input
                  value={form.business_type}
                  onChange={(e) => updateForm({ business_type: e.target.value })}
                  list="business-type-options"
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                  placeholder={t('Business type', 'လုပ်ငန်းအမျိုးအစား')}
                  required
                />
                <datalist id="business-type-options">
                  <option value="Online Shop" />
                  <option value="Book Store" />
                  <option value="Branch Office" />
                  <option value="Retail" />
                  <option value="Wholesale" />
                  <option value="E-commerce" />
                </datalist>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Payment Terms', 'ငွေချေစနစ်')}
                </label>
                <select
                  value={form.payment_type}
                  onChange={(e) => updateForm({ payment_type: e.target.value })}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                  required
                >
                  <option value="COD">COD</option>
                  <option value="Prepaid">Prepaid</option>
                  <option value="Monthly Billing">Monthly Billing</option>
                  <option value="Merchant Credit">Merchant Credit</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="KBZ Pay">KBZ Pay</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Pickup Address', 'လိပ်စာ')}
                </label>
                <textarea
                  rows={1}
                  value={form.pickup_address}
                  onChange={(e) => updateForm({ pickup_address: e.target.value })}
                  placeholder={t('Enter full address...', 'လိပ်စာရိုက်ပါ...')}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Township', 'မြို့နယ်')}
                </label>
                <input
                  value={form.township}
                  onChange={(e) => handleTownshipChange(e.target.value)}
                  onBlur={(e) => handleTownshipChange(e.target.value)}
                  list="township-master-options"
                  placeholder={t('Type or select township', 'မြို့နယ် ရွေးပါ သို့မဟုတ် ရိုက်ပါ')}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                  required
                />
                <datalist id="township-master-options">
                  {townships.map((tw) => (
                    <option key={`${tw.township}-${tw.city || ''}`} value={tw.township}>
                      {[tw.city, tw.region_state].filter(Boolean).join(' / ')}
                    </option>
                  ))}
                </datalist>
                <p className="text-[#4d7a9b] text-[11px] font-medium mt-1">
                  {form.city || '-'}{form.region_state ? ` / ${form.region_state}` : ''}
                </p>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Expected Parcels', 'အရေအတွက်')}
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.expected_parcels}
                  onChange={(e) => updateForm({ expected_parcels: Number(e.target.value || 1) })}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Pickup Date', 'ရက်စွဲ')}
                </label>
                <input
                  required
                  type="date"
                  value={form.pickup_date}
                  onChange={(e) => updateForm({ pickup_date: e.target.value })}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                />
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Vehicle Required', 'လိုအပ်သော ယာဉ်')}
                </label>
                <select
                  value={form.vehicle_required}
                  onChange={(e) => updateForm({ vehicle_required: e.target.value })}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium"
                >
                  <option value="Bike">Bike</option>
                  <option value="Van">Van</option>
                  <option value="Mini Truck">Mini Truck</option>
                  <option value="Truck">Truck</option>
                  <option value="Car">Car</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[#4d7a9b] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {t('Remark / Special Instruction', 'မှတ်ချက် / အထူးညွှန်ကြားချက်')}
                </label>
                <textarea
                  rows={3}
                  value={form.pickup_remark}
                  onChange={(e) => updateForm({ pickup_remark: e.target.value })}
                  maxLength={1000}
                  placeholder={t('Optional pickup remark for supervisor/rider...', 'Supervisor / Rider အတွက် မှတ်ချက် ရိုက်ပါ...')}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] font-medium resize-none"
                />
                <p className="text-[#4d7a9b] text-[11px] font-medium mt-1">
                  {form.pickup_remark.length}/1000
                </p>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-[#1a3a5c]">
              <button 
                type="submit" 
                disabled={loading || masterLoading} 
                className="w-full bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-black text-[14px] uppercase tracking-widest py-4 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} 
                {t('Submit Order Picking Request', 'အတည်ပြုမည်')}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}