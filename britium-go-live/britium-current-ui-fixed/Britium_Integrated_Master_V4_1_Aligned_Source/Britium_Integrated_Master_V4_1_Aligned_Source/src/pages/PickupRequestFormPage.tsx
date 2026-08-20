import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CloudUpload, Download, Filter, Package, Send, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Merchant = {
  merchant_code: string;
  merchant_name: string;
  business_type?: string;
  contact_person?: string;
  phone_primary?: string;
  phone_secondary?: string;
  address_mm?: string;
  address_line_1?: string;
  township?: string;
  city?: string;
  region_state?: string;
  allowed_cargo_weight_kg?: number;
  status?: string;
};

export default function PickupRequestFormPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantCode, setMerchantCode] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [township, setTownship] = useState("");
  const [city, setCity] = useState("Yangon");
  const [region, setRegion] = useState("Yangon Region");
  const [payment, setPayment] = useState("COD");
  const [parcels, setParcels] = useState(1);
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicle, setVehicle] = useState("Bike");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.merchant_code === merchantCode) || null,
    [merchantCode, merchants]
  );

  async function loadMerchants() {
    setMsg("");
    const { data, error } = await supabase.rpc("be_get_merchant_options", {
      p_include_inactive: false,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMerchants(((data as any)?.merchants || []) as Merchant[]);
  }

  useEffect(() => {
    loadMerchants();
  }, []);

  function chooseMerchant(code: string) {
    setMerchantCode(code);
    const m = merchants.find((item) => item.merchant_code === code);
    if (!m) return;

    setBusinessType(m.business_type || "");
    setContactPerson(m.contact_person || "");
    setPhone(m.phone_primary || "");
    setAddress(m.address_line_1 || m.address_mm || "");
    setTownship(m.township || "");
    setCity(m.city || "Yangon");
    setRegion(m.region_state || "Yangon Region");
  }

  function branchCode() {
    const c = `${city} ${region}`.toLowerCase();
    if (c.includes("mandalay")) return "MDY";
    if (c.includes("nay")) return "NPT";
    return "YGN";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");

    if (!selectedMerchant) {
      setMsg("Please select merchant from master data.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.rpc("be_create_pickup_request_from_portal", {
        p_merchant_code: selectedMerchant.merchant_code,
        p_merchant_name: selectedMerchant.merchant_name,
        p_pickup_address: address,
        p_pickup_township: township,
        p_expected_parcels: Number(parcels || 1),
        p_expected_weight_kg: 0,
        p_payment_method: payment,
        p_transport_mode: vehicle,
        p_note: note,
        p_branch_code: branchCode(),
      });

      if (error) throw error;

      setMsg(`Pickup created: ${(data as any)?.pickup_id || ""}. It is now in Supervisor Assignment.`);
      setMerchantCode("");
      setBusinessType("");
      setContactPerson("");
      setPhone("");
      setAddress("");
      setTownship("");
      setCity("Yangon");
      setRegion("Yangon Region");
      setParcels(1);
      setNote("");
    } catch (err: any) {
      setMsg(err?.message || "Pickup request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061524] text-[#eef8ff] p-4 md:p-6">
      <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="grid gap-4 md:grid-cols-[190px_190px_1fr] md:items-end">
          <label className="grid gap-2 text-[#9cc2d9]">
            <span><Filter size={14} className="inline" /> မှ</span>
            <input type="date" className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            <span><Filter size={14} className="inline" /> ထိ</span>
            <input type="date" className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-xl bg-[#1f4770] px-5 py-3 font-bold">
              <Download className="mr-2 inline" size={16} />
              အစီရင်ခံစာ ရယူမည်
            </button>
            <button type="button" className="rounded-xl border border-[#1a3a5c] px-5 py-3 font-bold text-[#4ea8de]">
              <Download className="mr-2 inline" size={16} />
              ပုံစံ
            </button>
            <button type="button" className="rounded-xl bg-[#f6b84b] px-5 py-3 font-black text-[#061524]">
              <CloudUpload className="mr-2 inline" size={16} />
              ဖိုင်တင်မည်
            </button>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="mt-6 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <h1 className="mb-6 flex items-center gap-3 border-b border-[#1a3a5c] pb-4 text-xl font-black">
          <Package className="text-[#4ea8de]" />
          ကုန်သည်နှင့် ပစ္စည်းအချက်အလက်
        </h1>

        {msg && (
          <div className="mb-5 rounded-xl border border-[#f6b84b]/40 bg-[#f6b84b]/10 px-4 py-3 text-[#f6b84b]">
            {msg}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          <label className="grid gap-2 text-[#9cc2d9]">
            <span><Store size={14} className="inline" /> ကုန်သည်</span>
            <select
              value={merchantCode}
              onChange={(e) => chooseMerchant(e.target.value)}
              className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white focus:border-[#f6b84b] focus:outline-none"
              required
            >
              <option value="">-- ရွေးပါ --</option>
              {merchants.map((m) => (
                <option key={m.merchant_code} value={m.merchant_code}>
                  {m.merchant_code} - {m.merchant_name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            လုပ်ငန်းအမျိုးအစား
            <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            ငွေပေးချေမှု
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white">
              <option>COD</option>
              <option>Prepaid</option>
              <option>Credit</option>
            </select>
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            ဆက်သွယ်ရန်
            <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            ဖုန်းနံပါတ်
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            ရက်စွဲ
            <div className="relative">
              <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
              <CalendarDays className="absolute right-3 top-3 text-[#9cc2d9]" size={18} />
            </div>
          </label>

          <label className="grid gap-2 text-[#9cc2d9] md:col-span-2">
            လိပ်စာ
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            မြို့နယ်
            <input value={township} onChange={(e) => setTownship(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
            <span className="text-sm text-[#4ea8de]">{township} / {city} / {region}</span>
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            အရေအတွက်
            <input type="number" min={1} value={parcels} onChange={(e) => setParcels(Number(e.target.value || 1))} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
          </label>

          <label className="grid gap-2 text-[#9cc2d9]">
            လိုအပ်သော ယာဉ်
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white">
              <option>Bike</option>
              <option>Van</option>
              <option>Mini Truck</option>
              <option>Box Truck</option>
            </select>
          </label>

          <label className="grid gap-2 text-[#9cc2d9] md:col-span-3">
            မှတ်ချက် / အထူးညွှန်ကြားချက်
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="min-h-[86px] rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white" />
            <span>{note.length}/1000</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#1a3a5c] pt-5">
          <button disabled={busy} className="rounded-xl bg-[#f6b84b] px-8 py-4 font-black text-[#061524] disabled:opacity-60">
            <Send className="mr-2 inline" size={18} />
            {busy ? "ပို့နေသည်..." : "အတည်ပြုမည်"}
          </button>
        </div>
      </form>
    </main>
  );
}
