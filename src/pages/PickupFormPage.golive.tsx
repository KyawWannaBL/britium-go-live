import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Package, Send, Download, Filter, UploadCloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import MerchantAutoFillField from '@/components/common/MerchantAutoFillField';
import SmartTownshipCityField from '@/components/common/SmartTownshipCityField';
import { inferBranchCode } from '@/lib/locationMerchantSync';

const emptyForm = {
  merchant_code: '',
  merchant_name: '',
  business_type: '',
  payment_terms: '',
  contact_person: '',
  phone_primary: '',
  pickup_address: '',
  township: '',
  city: '',
  region_state: '',
  zone: '',
  branch_code: '',
  expected_parcels: 1,
  pickup_date: '',
  vehicle_required: 'Bike',
};

export default function PickupFormPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patchForm = (patch: Partial<typeof emptyForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const branchCode = form.branch_code || inferBranchCode(`${form.city} ${form.township} ${form.pickup_address}`);

      const payload = {
        source_channel: 'CUSTOMER_SERVICE',
        merchant_code: form.merchant_code,
        merchant_name: form.merchant_name,
        business_type: form.business_type,
        payment_terms: form.payment_terms,
        contact_person: form.contact_person || form.merchant_name,
        phone_primary: form.phone_primary,
        pickup_address: form.pickup_address,
        township: form.township,
        city: form.city,
        region_state: form.region_state,
        zone: form.zone,
        branch_code: branchCode,
        expected_parcels: Number(form.expected_parcels || 1),
        pickup_date: form.pickup_date,
        vehicle_type: form.vehicle_required,
        request_status: 'PICKUP_REQUESTED',
        pickup_status: 'Draft',
      };

      const { data, error } = await (supabase as any).rpc('be_submit_pickup_request', {
        p_source_channel: 'CUSTOMER_SERVICE',
        p_payload: payload,
      });

      if (error) throw error;

      const pickupId = data?.pickup_id || data?.pickup_code || data?.id || '';
      alert(t(
        `Order Picking Request submitted successfully.${pickupId ? ` Pickup ID: ${pickupId}` : ''}`,
        `တောင်းဆိုမှု အောင်မြင်ပါသည်။${pickupId ? ` Pickup ID: ${pickupId}` : ''}`,
      ));

      setForm(emptyForm);
    } catch (error: any) {
      alert(error?.message || t('Pickup request failed.', 'Pickup Request မအောင်မြင်ပါ။'));
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (fileName: string) => {
    const link = document.createElement('a'); link.href = `/templates/${fileName}`; link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleBulkUpload = async (file: File | null) => {
    if (!file) return;

    try {
      const filePath = `pickup-requests/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('pickup-imports').upload(filePath, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error } = await (supabase as any).rpc('be_register_pickup_bulk_upload', {
        p_file_path: filePath,
        p_file_name: file.name,
        p_source_channel: 'CUSTOMER_SERVICE',
      });

      if (error) throw error;
      alert(t('Bulk upload registered successfully.', 'ဖိုင်တင်ခြင်း အောင်မြင်ပါသည်။'));
    } catch (error: any) {
      alert(error?.message || t('Bulk upload failed.', 'ဖိုင်တင်ခြင်း မအောင်မြင်ပါ။'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1a3a5c] pb-4">
        <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">{t('ORDER PICKING REQUEST', 'ပစ္စည်းကောက်ယူရန် တောင်းဆိုမှု')}</h1>
        <p className="text-[#4d7a9b] text-[13px]">{t('Customer Service registers the pickup request to initiate the operational workflow.', 'CS မှ ပစ္စည်းကောက်ယူရန် ကနဦးတောင်းဆိုမှုကို စာရင်းသွင်းပါ။')}</p>
      </div>

      {/* ── TIMELINE FILTER & REPORTS ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-4 items-end">
        <div className="w-full lg:w-auto"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1"><Filter size={12}/>{t('From Date', 'မှ')}</label><input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" /></div>
        <div className="w-full lg:w-auto"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1"><Filter size={12}/>{t('To Date', 'ထိ')}</label><input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" /></div>
        <div className="flex gap-2 w-full lg:flex-1 justify-end">
          <button type="button" className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] flex items-center justify-center gap-2 transition-colors cursor-pointer"><Download size={14} /> {t('Download Report', 'အစီရင်ခံစာ ရယူမည်')}</button>
          <button type="button" onClick={() => downloadFile('Britium_Data_Entry_UAT_GoLive_Template.xlsx')} className="bg-[#061524] text-[#4ea8de] border border-[#1a3a5c] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#4ea8de] flex items-center justify-center gap-2 transition-colors cursor-pointer"><Download size={14} /> {t('Template', 'ပုံစံခွက်')}</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer"><UploadCloud size={14} /> {t('Bulk Upload', 'ဖိုင်တင်မည်')}</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleBulkUpload(e.target.files?.[0] || null)} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl space-y-6">
        <div className="flex items-center gap-2 border-b border-[#1a3a5c] pb-3 text-[#eef8ff] text-[14px] uppercase tracking-widest">
          <Package size={16} className="text-[#4ea8de]" />
          {t('Merchant & Parcel Details', 'ကုန်သည်နှင့် ပစ္စည်းအချက်အလက်')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MerchantAutoFillField
            value={form.merchant_name ? `${form.merchant_code} - ${form.merchant_name}` : ''}
            required
            label={t('Merchant / Customer', 'ကုန်သည်')}
            onSelect={(_, patch) => patchForm({
              merchant_code: patch.merchant_code,
              merchant_name: patch.merchant_name,
              business_type: patch.business_type,
              payment_terms: patch.payment_terms,
              contact_person: patch.contact_person,
              phone_primary: patch.phone_primary,
              pickup_address: patch.pickup_address,
              township: patch.township,
              city: patch.city,
              region_state: patch.region_state,
              zone: patch.zone,
              branch_code: patch.branch_code,
            })}
          />

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Merchant Code', 'Merchant Code')}</label>
            <input value={form.merchant_code} readOnly className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] opacity-80" />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Phone Number', 'ဖုန်းနံပါတ်')}</label>
            <input value={form.phone_primary} onChange={(e) => patchForm({ phone_primary: e.target.value })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Business Type', 'လုပ်ငန်းအမျိုးအစား')}</label>
            <input value={form.business_type} onChange={(e) => patchForm({ business_type: e.target.value })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" required />
          </div>
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Payment Terms', 'ငွေချေစနစ်')}</label>
            <input value={form.payment_terms} onChange={(e) => patchForm({ payment_terms: e.target.value })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" required />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Pickup Address', 'လိပ်စာ')}</label>
            <textarea rows={1} value={form.pickup_address} onChange={(e) => patchForm({ pickup_address: e.target.value })} placeholder={t('Enter full address...', 'လိပ်စာရိုက်ပါ...')} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] resize-none" required />
          </div>

          <SmartTownshipCityField
            township={form.township}
            city={form.city}
            required
            townshipLabel={t('Township', 'မြို့နယ်')}
            cityLabel={t('City', 'မြို့')}
            onPatch={(patch) => patchForm(patch as any)}
          />

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Expected Parcels', 'အရေအတွက်')}</label>
            <input type="number" min="1" value={form.expected_parcels} onChange={(e) => patchForm({ expected_parcels: Number(e.target.value || 1) })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" required />
          </div>
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Pickup Date', 'ရက်စွဲ')}</label>
            <input required type="date" value={form.pickup_date} onChange={(e) => patchForm({ pickup_date: e.target.value })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
          </div>
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Vehicle Required', 'လိုအပ်သော ယာဉ်')}</label>
            <select value={form.vehicle_required} onChange={(e) => patchForm({ vehicle_required: e.target.value })} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]">
              <option value="Bike">Bike</option><option value="Van">Van</option><option value="Mini Truck">Mini Truck</option><option value="Truck">Truck</option><option value="Car">Car</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-[#1a3a5c]">
          <button type="submit" disabled={loading} className="bg-[#f6b84b] text-[#061524] px-8 py-3 rounded-xl uppercase tracking-wider hover:bg-[#e5a93a] transition-colors flex items-center justify-center gap-2 cursor-pointer text-[13px]">
            <Send size={16} /> {loading ? t('Submitting...', 'ဆောင်ရွက်နေပါသည်...') : t('Submit Order Picking Request', 'အတည်ပြုမည်')}
          </button>
        </div>
      </form>
    </div>
  );
}