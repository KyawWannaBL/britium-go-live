import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Package, Send, Download, Filter, UploadCloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type MerchantOption = {
  merchant_id?: string | null;
  merchant_code: string;
  merchant_name: string;
  business_name?: string | null;
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
  zone?: string | null;
  branch_code?: string | null;
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
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(true);
  const [form, setForm] = useState<PickupFormState>(initialForm);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [townships, setTownships] = useState<TownshipOption[]>([]);

  const selectedMerchant = useMemo(
    () => merchants.find((m) => norm(m.merchant_code) === norm(form.merchant_code)),
    [merchants, form.merchant_code]
  );

  useEffect(() => {
    let mounted = true;

    async function loadMasters() {
      setMasterLoading(true);
      try {
        const [merchantResult, townshipResult] = await Promise.all([
          (supabase as any)
            .from('be_v_pickup_merchant_options')
            .select('*')
            .order('merchant_name', { ascending: true }),
          (supabase as any)
            .from('be_v_township_options')
            .select('*')
            .order('township', { ascending: true }),
        ]);

        if (merchantResult.error) throw merchantResult.error;
        if (townshipResult.error) throw townshipResult.error;

        if (mounted) {
          setMerchants((merchantResult.data || []) as MerchantOption[]);
          setTownships((townshipResult.data || []) as TownshipOption[]);
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

        // Optional overrides. Defaults still come from merchant_masters.
        // Township is validated/enriched from be_v_township_options when it matches.
        p_pickup_address_override: form.pickup_address.trim(),
        p_township_override: form.township.trim(),
        p_city_override: form.city || null,
        p_region_state_override: form.region_state || null,
        p_pickup_remark: form.pickup_remark.trim() || null,
      });

      if (error) throw error;

      alert(
        t(
          `Pickup request created: ${data?.pickup_id || data?.pickup_way_id || ''}`,
          `Pickup request created: ${data?.pickup_id || data?.pickup_way_id || ''}`
        )
      );

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
    <div className="space-y-6">
      <div className="border-b border-[#1a3a5c] pb-4">
        <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">
          {t('ORDER PICKING REQUEST', 'ပစ္စည်းကောက်ယူရန် တောင်းဆိုမှု')}
        </h1>
        <p className="text-[#4d7a9b] text-[13px]">
          {t(
            'Customer Service registers the pickup request to initiate the operational workflow.',
            'CS မှ ပစ္စည်းကောက်ယူရန် ကနဦးတောင်းဆိုမှုကို စာရင်းသွင်းပါ။'
          )}
        </p>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-4 items-end">
        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Filter size={12} />
            {t('From Date', 'မှ')}
          </label>
          <input
            type="date"
            className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
          />
        </div>
        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Filter size={12} />
            {t('To Date', 'ထိ')}
          </label>
          <input
            type="date"
            className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
          />
        </div>
        <div className="flex gap-2 w-full lg:flex-1 justify-end">
          <button
            type="button"
            className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download size={14} /> {t('Download Report', 'အစီရင်ခံစာ ရယူမည်')}
          </button>
          <button
            type="button"
            onClick={() => downloadFile('Britium_Data_Entry_UAT_GoLive_Template.xlsx')}
            className="bg-[#061524] text-[#4ea8de] border border-[#1a3a5c] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#4ea8de] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download size={14} /> {t('Template', 'ပုံစံခွက်')}
          </button>
          <button
            type="button"
            className="bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <UploadCloud size={14} /> {t('Bulk Upload', 'ဖိုင်တင်မည်')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl space-y-6">
        <div className="flex items-center gap-2 border-b border-[#1a3a5c] pb-3 text-[#eef8ff] text-[14px] uppercase tracking-widest">
          <Package size={16} className="text-[#4ea8de]" />
          {t('Merchant & Parcel Details', 'ကုန်သည်နှင့် ပစ္စည်းအချက်အလက်')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Merchant / Customer', 'ကုန်သည်')}
            </label>
            <select
              value={form.merchant_code}
              onChange={(e) => handleMerchantChange(e.target.value)}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
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
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Business Type', 'လုပ်ငန်းအမျိုးအစား')}
            </label>
            <input
              value={form.business_type}
              onChange={(e) => updateForm({ business_type: e.target.value })}
              list="business-type-options"
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
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
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Payment Terms', 'ငွေချေစနစ်')}
            </label>
            <select
              value={form.payment_type}
              onChange={(e) => updateForm({ payment_type: e.target.value })}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
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
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Pickup Address', 'လိပ်စာ')}
            </label>
            <textarea
              rows={1}
              value={form.pickup_address}
              onChange={(e) => updateForm({ pickup_address: e.target.value })}
              placeholder={t('Enter full address...', 'လိပ်စာရိုက်ပါ...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Township', 'မြို့နယ်')}
            </label>
            <input
              value={form.township}
              onChange={(e) => handleTownshipChange(e.target.value)}
              onBlur={(e) => handleTownshipChange(e.target.value)}
              list="township-master-options"
              placeholder={t('Type or select township', 'မြို့နယ် ရွေးပါ သို့မဟုတ် ရိုက်ပါ')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
              required
            />
            <datalist id="township-master-options">
              {townships.map((tw) => (
                <option key={`${tw.township}-${tw.city || ''}`} value={tw.township}>
                  {[tw.city, tw.region_state].filter(Boolean).join(' / ')}
                </option>
              ))}
            </datalist>
            <p className="text-[#4d7a9b] text-[11px] mt-1">
              {form.city || '-'}{form.region_state ? ` / ${form.region_state}` : ''}
            </p>
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Expected Parcels', 'အရေအတွက်')}
            </label>
            <input
              type="number"
              min="1"
              value={form.expected_parcels}
              onChange={(e) => updateForm({ expected_parcels: Number(e.target.value || 1) })}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
              required
            />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Pickup Date', 'ရက်စွဲ')}
            </label>
            <input
              required
              type="date"
              value={form.pickup_date}
              onChange={(e) => updateForm({ pickup_date: e.target.value })}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Vehicle Required', 'လိုအပ်သော ယာဉ်')}
            </label>
            <select
              value={form.vehicle_required}
              onChange={(e) => updateForm({ vehicle_required: e.target.value })}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            >
              <option value="Bike">Bike</option>
              <option value="Van">Van</option>
              <option value="Mini Truck">Mini Truck</option>
              <option value="Truck">Truck</option>
              <option value="Car">Car</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t('Remark / Special Instruction', 'မှတ်ချက် / အထူးညွှန်ကြားချက်')}
            </label>
            <textarea
              rows={3}
              value={form.pickup_remark}
              onChange={(e) => updateForm({ pickup_remark: e.target.value })}
              maxLength={1000}
              placeholder={t('Optional pickup remark for supervisor/rider...', 'Supervisor / Rider အတွက် မှတ်ချက် ရိုက်ပါ...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] resize-none"
            />
            <p className="text-[#4d7a9b] text-[11px] mt-1">
              {form.pickup_remark.length}/1000
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-[#1a3a5c]">
          <button
            type="submit"
            disabled={loading || masterLoading}
            className="bg-[#f6b84b] text-[#061524] px-8 py-3 rounded-xl uppercase tracking-wider hover:bg-[#e5a93a] transition-colors flex items-center justify-center gap-2 cursor-pointer text-[13px] disabled:opacity-60"
          >
            <Send size={16} />{' '}
            {loading ? t('Submitting...', 'ဆောင်ရွက်နေပါသည်...') : t('Submit Order Picking Request', 'အတည်ပြုမည်')}
          </button>
        </div>
      </form>
    </div>
  );
}