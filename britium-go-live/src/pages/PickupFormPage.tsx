// LIVE: pickup submit uses be_submit_pickup_request canonical backend.
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, Download, UploadCloud, Calendar, Filter, Printer } from "lucide-react";

// --- BILINGUAL TRANSLATION DICTIONARY ---
const TRANSLATIONS = {
  en: {
    title: "Pickup Request Form",
    dateFrom: "From Date",
    dateTo: "To Date",
    btnReport: "Download Report",
    btnPrint: "Print",
    btnSubmit: "Submit Request",
    sectionTitle: "Merchant & Item Information",
    lblMerchant: "Merchant",
    lblBusinessType: "Business Type",
    lblPayment: "Payment Terms",
    lblContact: "Contact Person",
    lblPhone: "Phone",
    lblDate: "Date",
    lblAddress: "Address",
    lblTownship: "Township",
    lblParcels: "Expected Parcels",
    lblVehicle: "Required Vehicle",
    lblInstructions: "Remarks / Special Instructions",
    phMerchant: "-- Select --",
    loading: "Loading..."
  },
  my: {
    title: "Pickup တောင်းဆိုမှုဖောင်",
    dateFrom: "မှ",
    dateTo: "ထိ",
    btnReport: "အစီရင်ခံစာ ရယူမည်",
    btnPrint: "ပုံနှိပ်မည်",
    btnSubmit: "ဖိုင်တင်မည်",
    sectionTitle: "ကုန်သည်နှင့် ပစ္စည်းအချက်အလက်",
    lblMerchant: "ကုန်သည်",
    lblBusinessType: "လုပ်ငန်းအမျိုးအစား",
    lblPayment: "ငွေပေးချေမှု",
    lblContact: "ဆက်သွယ်ရန်",
    lblPhone: "ဖုန်းနံပါတ်",
    lblDate: "ရက်စွဲ",
    lblAddress: "လိပ်စာ",
    lblTownship: "မြို့နယ်",
    lblParcels: "အရေအတွက်",
    lblVehicle: "လိုအပ်သော ယာဉ်",
    lblInstructions: "မှတ်ချက် / အထူးညွှန်ကြားချက်",
    phMerchant: "-- ရွေးပါ --",
    loading: "ဒေတာရယူနေပါသည်..."
  }
};

const PICKUP_FORM_BLACK_TEXT_V1_20260817 = true;

const PICKUP_FORM_WHITE_FIELDS_V2_20260817 = true;

const PICKUP_FORM_WHITE_FIELDS_V3_20260817 = true;

const PICKUP_FORM_WHITE_FIELDS_V4_20260817 = true;

export default function PickupFormPage() {
  const language = "en";
const [activeLang, setActiveLang] = useState<"en" | "my">(
    (language === "my" || language === "mm") ? "my" : "en"
  );

  // AppShell Global Language Sync
const t = TRANSLATIONS[activeLang];

  // --- STATE ---
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  const [formData, setFormData] = useState({
    dateFrom: "",
    dateTo: "",
    merchantCode: "",
    businessType: "",
    paymentTerms: "COD",
    contactPerson: "",
    phone: "",
    pickupDate: new Date().toISOString().split("T")[0],
    address: "",
    township: "",
    city: "",
    region: "",
    expectedParcels: "1",
    requiredVehicle: "Bike",
    instructions: ""
  });

  // --- FIX 1: Replace merchant loading ---
  useEffect(() => {
    async function fetchOptions() {
      setLoadingOptions(true);
      const { data, error } = await supabase.rpc("be_get_merchants_dropdown");

      if (error) {
        console.error("Merchant dropdown loading failed:", error);
        setLoadingOptions(false);
        return;
      }

      setMerchants(data?.options ?? []);
      setLoadingOptions(false);
    }
    fetchOptions();
  }, []);

  // --- FIX 2: Update merchant autofill ---
  const handleMerchantSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setAutofilling(true);

    const selected = merchants.find(m => m.value === code);

    if (selected) {
      const meta = selected;
      setFormData(prev => ({
        ...prev,
        merchantCode: code,
        businessType: meta.business_type || "",
        paymentTerms: meta.payment_terms || "COD",
        contactPerson: meta.contact_person || "",
        phone: meta.phone || "",
        address: meta.address || "",
        township: meta.township || "",
        city: meta.city || "Yangon",
        region: meta.region_state || "Yangon Region"
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        merchantCode: code,
        businessType: "",
        paymentTerms: "COD",
        contactPerson: "",
        phone: "",
        address: "",
        township: "",
        city: "",
        region: ""
      }));
    }

    setTimeout(() => setAutofilling(false), 300); // Visual feedback pulse
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // --- FIX 3: Submit button is currently inactive ---
  async function submitPickupRequest() {
    if (!formData.merchantCode) {
      alert("Please select a merchant.");
      return;
    }

    const payload = {
      merchant_code: formData.merchantCode,
      merchant_name: merchants.find(m => m.value === formData.merchantCode)?.label,
      pickup_address: formData.address,
      pickup_township: formData.township,
      pickup_city: formData.city,
      parcel_count: Number(formData.expectedParcels),
      payment_terms: formData.paymentTerms,
      required_vehicle: formData.requiredVehicle,
      remark: formData.instructions
    };

    const { data, error } = await supabase.rpc("be_submit_pickup_request", {
      p_payload: payload
    });

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    alert(activeLang === "my" ? "Pickup တောင်းဆိုမှု အောင်မြင်ပါသည်" : "Pickup request submitted successfully");

    // Optional: clear form after submit
    setFormData(prev => ({ ...prev, merchantCode: "", businessType: "", contactPerson: "", phone: "", address: "", township: "", instructions: "" }));
  }

  // --- STYLING (Matches User Liveups perfectly) ---
  const inputClass = `
    w-full px-4 py-3 rounded-xl appearance-none outline-none transition-all duration-200
    bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] font-medium text-[14px]
    hover:border-[#4ea8de] focus:border-[#f6b84b] focus:ring-1 focus:ring-[#f6b84b]
    disabled:opacity-70 disabled:cursor-not-allowed
    [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert
  `;

  const labelClass = "flex items-center text-[13px] text-[#4d7a9b] mb-2";

  return (
    <div data-pickup-form="true" className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Poppins',sans-serif]">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* TOP ACTION BAR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl">
          <div className="flex gap-4 items-center w-full lg:w-auto">
            <div className="relative">
              <label className={labelClass}><Filter size={14} className="mr-1"/> {t.dateFrom}</label>
              <input type="date" name="dateFrom" value={formData.dateFrom} onChange={handleChange} className={`${inputClass} !py-2.5 w-44`} />
            </div>
            <div className="relative">
              <label className={labelClass}><Filter size={14} className="mr-1"/> {t.dateTo}</label>
              <input type="date" name="dateTo" value={formData.dateTo} onChange={handleChange} className={`${inputClass} !py-2.5 w-44`} />
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
            {/* FIX 4: Report and Print buttons wired */}
            <button onClick={() => window.open("/reports/pickup-request", "_blank")} className="flex items-center justify-center gap-2 bg-[#1a3a5c] hover:bg-[#254b73] text-[#c8dff0] px-5 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap border border-[#254b73]">
              <Download size={16}/> {t.btnReport}
            </button>
            <button onClick={() => window.print()} className="flex items-center justify-center gap-2 bg-transparent hover:bg-[#1a3a5c] text-[#c8dff0] px-5 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap border border-[#1a3a5c]">
              <Printer size={16}/> {t.btnPrint}
            </button>
            <button onClick={submitPickupRequest} className="flex items-center justify-center gap-2 bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] px-6 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap shadow-[0_0_15px_rgba(246,184,75,0.2)]">
              <UploadCloud size={18}/> {t.btnSubmit}
            </button>
          </div>
        </div>

        {/* MAIN FORM CARD */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-[24px] p-6 md:p-8 shadow-xl relative overflow-hidden">
          {autofilling && <div className="absolute top-0 left-0 h-1 bg-[#f6b84b] w-full animate-pulse z-10" />}

          <div className="flex items-center gap-3 mb-8 border-b border-[#1a3a5c]/50 pb-5">
            <Package className="text-[#4ea8de] h-6 w-6"/>
            <h2 className="text-lg font-bold text-white">{t.sectionTitle}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-8">

            {/* ROW 1 */}
            <div>
              <label className={labelClass}>{t.lblMerchant}</label>
              <select name="merchantCode" value={formData.merchantCode} onChange={handleMerchantSelect} disabled={loadingOptions} className={`${inputClass} cursor-pointer ${formData.merchantCode ? 'border-[#f6b84b]' : ''}`}>
                <option value="" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>{loadingOptions ? t.loading : t.phMerchant}</option>
                {merchants.map(m => (
                  <option key={m.value} value={m.value} className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>{m.value} - {m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>{t.lblBusinessType}</label>
              <input name="businessType" value={formData.businessType} onChange={handleChange} className={inputClass} readOnly />
            </div>

            <div>
              <label className={labelClass}>{t.lblPayment}</label>
              <select name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} className={`${inputClass} cursor-pointer`}>
                <option value="COD" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>COD</option>
                <option value="Prepaid" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>Prepaid</option>
                <option value="Monthly" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>Monthly</option>
              </select>
            </div>

            {/* ROW 2 */}
            <div>
              <label className={labelClass}>{t.lblContact}</label>
              <input name="contactPerson" value={formData.contactPerson} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>{t.lblPhone}</label>
              <input name="phone" value={formData.phone} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>{t.lblDate}</label>
              <input type="date" name="pickupDate" value={formData.pickupDate} onChange={handleChange} className={inputClass} />
            </div>

            {/* ROW 3 */}
            <div className="md:col-span-2">
              <label className={labelClass}>{t.lblAddress}</label>
              <textarea name="address" value={formData.address} onChange={handleChange} rows={3} className={`${inputClass} resize-none`} />
            </div>

            <div className="md:col-span-1">
              <label className={labelClass}>{t.lblTownship}</label>
              <input name="township" value={formData.township} onChange={handleChange} className={inputClass} />
              <div className="text-[13px] text-[#4ea8de] mt-2 font-medium">
                 / {formData.city || "Yangon"} / {formData.region || "Yangon Region"}
              </div>
            </div>

            {/* ROW 4 */}
            <div className="md:col-span-1">
              <label className={labelClass}>{t.lblParcels}</label>
              <input type="number" name="expectedParcels" value={formData.expectedParcels} onChange={handleChange} className={inputClass} />
            </div>

            <div className="md:col-span-1">
              <label className={labelClass}>{t.lblVehicle}</label>
              <select name="requiredVehicle" value={formData.requiredVehicle} onChange={handleChange} className={`${inputClass} cursor-pointer`}>
                <option value="Bike" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>Bike</option>
                <option value="Van" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>Delivery Van</option>
                <option value="Mini Truck" className="!bg-white !text-black" style={{ color: "#000000", backgroundColor: "#ffffff" }}>Mini Truck</option>
              </select>
            </div>

            <div className="md:col-span-1 hidden md:block"></div>

            {/* ROW 5 */}
            <div className="md:col-span-3">
              <label className={labelClass}>{t.lblInstructions}</label>
              <textarea name="instructions" value={formData.instructions} onChange={handleChange} rows={3} className={`${inputClass} resize-none`} />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}