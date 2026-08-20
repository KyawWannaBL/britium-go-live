import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";
import {
  CloudUpload,
  Download,
  Filter,
  PackageOpen,
  Printer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Language = "en" | "my";

type MerchantOption = {
  value: string;
  label: string;
  business_type?: string | null;
  payment_terms?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  address?: string | null;
  township?: string | null;
  city?: string | null;
  region_state?: string | null;
};

type PickupForm = {
  dateFrom: string;
  dateTo: string;
  merchantCode: string;
  businessType: string;
  paymentTerms: string;
  contactPerson: string;
  phone: string;
  pickupDate: string;
  address: string;
  township: string;
  city: string;
  region: string;
  expectedParcels: string;
  requiredVehicle: string;
  instructions: string;
};

const copy = {
  en: {
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
    loading: "Loading...",
  },
  my: {
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
    loading: "ဒေတာရယူနေပါသည်...",
  },
} satisfies Record<Language, Record<string, string>>;

/*
 * These inline colors intentionally override global form-control CSS and native
 * browser defaults. The previous white select/textarea background combined with
 * inherited pale text, so dropdown labels appeared blank.
 */
const controlStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "12px",
  appearance: "none",
  outline: "none",
  backgroundColor: "transparent",
  color: "#eef8ff",
  WebkitTextFillColor: "#eef8ff",
  border: "1px solid #1a3a5c",
  fontWeight: 500,
  fontSize: "14px",
  colorScheme: "dark",
};

const readonlyControlStyle: CSSProperties = {
  ...controlStyle,
  backgroundColor: "transparent",
  opacity: 1,
};

const optionStyle: CSSProperties = {
  backgroundColor: "#0b2236",
  color: "#eef8ff",
};

const labelClass = "mb-2 flex items-center text-[13px] font-medium text-[#9cc2d9]";

function initialForm(): PickupForm {
  return {
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
    instructions: "",
  };
}

export default function PickupFormPage() {
  const [language] = useState<Language>("en");
  const labels = copy[language];
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [merchantChanging, setMerchantChanging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PickupForm>(initialForm);

  useEffect(() => {
    async function loadMerchants() {
      setLoadingMerchants(true);

      const { data, error } = await supabase.rpc("be_get_merchants_dropdown");

      if (error) {
        console.error("Merchant dropdown loading failed:", error);
        setLoadingMerchants(false);
        return;
      }

      setMerchants((((data as any)?.options ?? []) as MerchantOption[]));
      setLoadingMerchants(false);
    }

    void loadMerchants();
  }, []);

  function changeField(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function changeMerchant(event: ChangeEvent<HTMLSelectElement>) {
    const merchantCode = event.target.value;
    const merchant = merchants.find((item) => item.value === merchantCode);
    setMerchantChanging(true);

    if (merchant) {
      setForm((current) => ({
        ...current,
        merchantCode,
        businessType: merchant.business_type || "",
        paymentTerms: merchant.payment_terms || "COD",
        contactPerson: merchant.contact_person || "",
        phone: merchant.phone || "",
        address: merchant.address || "",
        township: merchant.township || "",
        city: merchant.city || "Yangon",
        region: merchant.region_state || "Yangon Region",
      }));
    } else {
      setForm((current) => ({
        ...current,
        merchantCode,
        businessType: "",
        paymentTerms: "COD",
        contactPerson: "",
        phone: "",
        address: "",
        township: "",
        city: "",
        region: "",
      }));
    }

    window.setTimeout(() => setMerchantChanging(false), 300);
  }

  async function submitPickup() {
    if (!form.merchantCode) {
      window.alert("Please select a merchant.");
      return;
    }

    setSubmitting(true);

    const selectedMerchant = merchants.find(
      (merchant) => merchant.value === form.merchantCode,
    );
    const payload = {
      merchant_code: form.merchantCode,
      merchant_name: selectedMerchant?.label,
      pickup_address: form.address,
      pickup_township: form.township,
      pickup_city: form.city,
      parcel_count: Number(form.expectedParcels),
      payment_terms: form.paymentTerms,
      required_vehicle: form.requiredVehicle,
      remark: form.instructions,
    };

    const { data, error } = await supabase.rpc("be_submit_pickup_request", {
      p_payload: payload,
    });

    setSubmitting(false);

    if (error) {
      console.error(error);
      window.alert(error.message);
      return;
    }

    if ((data as any)?.ok === false) {
      window.alert((data as any)?.error || "Pickup request could not be submitted.");
      return;
    }

    window.alert(
      language === "my"
        ? "Pickup တောင်းဆိုမှု အောင်မြင်ပါသည်"
        : "Pickup request submitted successfully",
    );
    setForm((current) => ({
      ...current,
      merchantCode: "",
      businessType: "",
      contactPerson: "",
      phone: "",
      address: "",
      township: "",
      city: "",
      region: "",
      instructions: "",
    }));
  }

  return (
    <main className="min-h-screen bg-[#061524] p-6 font-['Poppins',sans-serif] text-[#eef8ff] md:p-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl lg:flex-row lg:items-end">
          <div className="flex w-full items-center gap-4 lg:w-auto">
            <div>
              <label className={labelClass}>
                <Filter className="mr-1" size={14} />
                {labels.dateFrom}
              </label>
              <input
                type="date"
                name="dateFrom"
                value={form.dateFrom}
                onChange={changeField}
                style={{ ...controlStyle, width: "176px", paddingTop: "10px", paddingBottom: "10px" }}
              />
            </div>
            <div>
              <label className={labelClass}>
                <Filter className="mr-1" size={14} />
                {labels.dateTo}
              </label>
              <input
                type="date"
                name="dateTo"
                value={form.dateTo}
                onChange={changeField}
                style={{ ...controlStyle, width: "176px", paddingTop: "10px", paddingBottom: "10px" }}
              />
            </div>
          </div>

          <div className="flex w-full gap-3 overflow-x-auto pb-1 lg:w-auto lg:pb-0">
            <button
              type="button"
              onClick={() => window.open("/reports/pickup-request", "_blank")}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#254b73] bg-[#1a3a5c] px-5 py-3 text-sm font-medium text-[#c8dff0] transition-colors hover:bg-[#254b73]"
            >
              <Download size={16} />
              {labels.btnReport}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#1a3a5c] bg-transparent px-5 py-3 text-sm font-medium text-[#c8dff0] transition-colors hover:bg-[#1a3a5c]"
            >
              <Printer size={16} />
              {labels.btnPrint}
            </button>
            <button
              type="button"
              onClick={() => void submitPickup()}
              disabled={submitting}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#f6b84b] px-6 py-3 text-sm font-bold text-[#061524] shadow-[0_0_15px_rgba(246,184,75,0.2)] transition-colors hover:bg-[#e5a93a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CloudUpload size={18} />
              {submitting ? "Submitting..." : labels.btnSubmit}
            </button>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl md:p-8">
          {merchantChanging && (
            <div className="absolute left-0 top-0 z-10 h-1 w-full animate-pulse bg-[#f6b84b]" />
          )}

          <div className="mb-8 flex items-center gap-3 border-b border-[#1a3a5c]/50 pb-5">
            <PackageOpen className="h-6 w-6 text-[#4ea8de]" />
            <h1 className="text-lg font-bold text-white">{labels.sectionTitle}</h1>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-3">
            <div>
              <label className={labelClass}>{labels.lblMerchant}</label>
              <select
                name="merchantCode"
                value={form.merchantCode}
                onChange={changeMerchant}
                disabled={loadingMerchants}
                style={{
                  ...controlStyle,
                  cursor: loadingMerchants ? "not-allowed" : "pointer",
                  borderColor: form.merchantCode ? "#f6b84b" : "#1a3a5c",
                }}
              >
                <option value="" style={optionStyle}>
                  {loadingMerchants ? labels.loading : labels.phMerchant}
                </option>
                {merchants.map((merchant) => (
                  <option key={merchant.value} value={merchant.value} style={optionStyle}>
                    {merchant.value} - {merchant.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>{labels.lblBusinessType}</label>
              <input
                name="businessType"
                value={form.businessType}
                onChange={changeField}
                readOnly
                style={readonlyControlStyle}
              />
            </div>

            <div>
              <label className={labelClass}>{labels.lblPayment}</label>
              <select
                name="paymentTerms"
                value={form.paymentTerms}
                onChange={changeField}
                style={{ ...controlStyle, cursor: "pointer" }}
              >
                <option value="COD" style={optionStyle}>COD</option>
                <option value="Prepaid" style={optionStyle}>Prepaid</option>
                <option value="Monthly" style={optionStyle}>Monthly</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>{labels.lblContact}</label>
              <input
                name="contactPerson"
                value={form.contactPerson}
                onChange={changeField}
                style={controlStyle}
              />
            </div>

            <div>
              <label className={labelClass}>{labels.lblPhone}</label>
              <input
                name="phone"
                value={form.phone}
                onChange={changeField}
                style={controlStyle}
              />
            </div>

            <div>
              <label className={labelClass}>{labels.lblDate}</label>
              <input
                type="date"
                name="pickupDate"
                value={form.pickupDate}
                onChange={changeField}
                style={controlStyle}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>{labels.lblAddress}</label>
              <textarea
                name="address"
                value={form.address}
                onChange={changeField}
                rows={3}
                style={{ ...controlStyle, resize: "none" }}
              />
            </div>

            <div>
              <label className={labelClass}>{labels.lblTownship}</label>
              <input
                name="township"
                value={form.township}
                onChange={changeField}
                style={controlStyle}
              />
              <div className="mt-2 text-[13px] font-medium text-[#4ea8de]">
                / {form.city || "Yangon"} / {form.region || "Yangon Region"}
              </div>
            </div>

            <div>
              <label className={labelClass}>{labels.lblParcels}</label>
              <input
                type="number"
                min="1"
                name="expectedParcels"
                value={form.expectedParcels}
                onChange={changeField}
                style={controlStyle}
              />
            </div>

            <div>
              <label className={labelClass}>{labels.lblVehicle}</label>
              <select
                name="requiredVehicle"
                value={form.requiredVehicle}
                onChange={changeField}
                style={{ ...controlStyle, cursor: "pointer" }}
              >
                <option value="Bike" style={optionStyle}>Bike</option>
                <option value="Van" style={optionStyle}>Delivery Van</option>
                <option value="Mini Truck" style={optionStyle}>Mini Truck</option>
              </select>
            </div>

            <div className="hidden md:block" />

            <div className="md:col-span-3">
              <label className={labelClass}>{labels.lblInstructions}</label>
              <textarea
                name="instructions"
                value={form.instructions}
                onChange={changeField}
                rows={3}
                style={{ ...controlStyle, resize: "none" }}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
