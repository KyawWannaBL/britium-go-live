import { useEffect, useMemo, useState } from "react";
import { Search, Store, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Merchant = {
  merchant_code: string;
  merchant_name: string;
  business_type?: string | null;
  contact_person?: string | null;
  phone_primary?: string | null;
  phone_secondary?: string | null;
  email?: string | null;
  address_mm?: string | null;
  address_line_1?: string | null;
  township?: string | null;
  city?: string | null;
  region_state?: string | null;
  customer_tier?: string | null;
  allowed_cargo_weight_kg?: number | null;
  monthly_commitment_parcels?: number | null;
  commitment_discount_mmk?: number | null;
  status?: string | null;
  refund_amount?: number | null;
};

type MerchantPatch = {
  merchant_code: string;
  merchant_name: string;
  business_type: string;
  contact_person: string;
  phone_primary: string;
  phone_secondary: string;
  email: string;
  pickup_address: string;
  address_mm: string;
  address_line_1: string;
  township: string;
  city: string;
  region_state: string;
  zone: string;
  branch_code: string;
  payment_terms: string;
  allowed_cargo_weight_kg: number | "";
  customer_tier: string;
  refund_amount: number | "";
};

type Props = {
  value?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  onSelect: (displayValue: string, patch: MerchantPatch, merchant?: Merchant) => void;
};

function inferBranchCode(city?: string | null, region?: string | null) {
  const text = `${city || ""} ${region || ""}`.toLowerCase();

  if (text.includes("mandalay")) return "MDY";
  if (text.includes("nay") || text.includes("npt")) return "NPT";
  return "YGN";
}

function inferZone(township?: string | null) {
  const t = String(township || "").toLowerCase();

  if (["north dagon", "east dagon", "south dagon", "dagon seikkan"].some((x) => t.includes(x))) {
    return "Yangon East";
  }

  if (["shwe pyi thar", "hlaing thar yar", "insein", "mingaladon", "north okkalapa"].some((x) => t.includes(x))) {
    return "Yangon North";
  }

  if (["thaketa", "tamwe", "thingangyun", "south okkalapa"].some((x) => t.includes(x))) {
    return "Yangon South";
  }

  if (["kamayut", "bahan", "ahlone", "alone", "yankin", "mingala taung nyunt"].some((x) => t.includes(x))) {
    return "Yangon Central";
  }

  return "Yangon Central";
}

export default function MerchantAutoFillField({
  value = "",
  label = "Merchant / Customer",
  required = false,
  placeholder = "Search merchant code or name...",
  onSelect,
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    loadMerchants();
  }, []);

  async function loadMerchants() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.rpc("be_get_merchant_options", {
        p_include_inactive: false,
      });

      if (error) throw error;

      setMerchants((((data as any)?.merchants || []) as Merchant[]).filter(Boolean));
    } catch (err: any) {
      setError(err?.message || "Could not load merchants.");
      setMerchants([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();

    if (!key) return merchants.slice(0, 80);

    return merchants
      .filter((m) =>
        [
          m.merchant_code,
          m.merchant_name,
          m.business_type,
          m.contact_person,
          m.phone_primary,
          m.township,
          m.city,
        ]
          .join(" ")
          .toLowerCase()
          .includes(key),
      )
      .slice(0, 80);
  }, [query, merchants]);

  function choose(m: Merchant) {
    const displayValue = `${m.merchant_code} - ${m.merchant_name}`;

    const patch: MerchantPatch = {
      merchant_code: m.merchant_code || "",
      merchant_name: m.merchant_name || "",
      business_type: m.business_type || "",
      contact_person: m.contact_person || "",
      phone_primary: m.phone_primary || "",
      phone_secondary: m.phone_secondary || "",
      email: m.email || "",
      pickup_address: m.address_line_1 || m.address_mm || "",
      address_mm: m.address_mm || "",
      address_line_1: m.address_line_1 || "",
      township: m.township || "",
      city: m.city || "Yangon",
      region_state: m.region_state || "Yangon Region",
      zone: inferZone(m.township),
      branch_code: inferBranchCode(m.city, m.region_state),
      payment_terms: "COD",
      allowed_cargo_weight_kg: m.allowed_cargo_weight_kg ?? "",
      customer_tier: m.customer_tier || "",
      refund_amount: m.refund_amount ?? "",
    };

    setQuery(displayValue);
    setOpen(false);
    onSelect(displayValue, patch, m);
  }

  return (
    <div className="relative">
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-[#4d7a9b]">
        {label}
        {required ? <span className="ml-1 text-[#f6b84b]">*</span> : null}
      </label>

      <div className="relative">
        <Store className="absolute left-3 top-3.5 text-[#4ea8de]" size={16} />

        <input
          value={query}
          required={required}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder={loading ? "Loading merchants..." : placeholder}
          className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-3 pl-10 pr-10 text-[13px] text-[#eef8ff] outline-none focus:border-[#f6b84b]"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-3 top-3.5 text-[#9cc2d9] hover:text-white"
          >
            <X size={16} />
          </button>
        ) : (
          <Search className="absolute right-3 top-3.5 text-[#4d7a9b]" size={16} />
        )}
      </div>

      {error ? (
        <div className="mt-2 rounded-lg border border-[#ff4f86]/30 bg-[#ff4f86]/10 px-3 py-2 text-xs text-[#ff8aa3]">
          {error}
        </div>
      ) : null}

      {open ? (
        <div className="absolute z-50 mt-2 max-h-[360px] w-full overflow-y-auto rounded-xl border border-[#1a3a5c] bg-[#061524] shadow-2xl">
          {loading ? (
            <div className="px-4 py-3 text-sm text-[#9cc2d9]">Loading merchants...</div>
          ) : filtered.length ? (
            filtered.map((m) => (
              <button
                key={m.merchant_code}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(m)}
                className="block w-full border-b border-[#1a3a5c]/70 px-4 py-3 text-left hover:bg-[#102b45]"
              >
                <div className="font-black text-[#eef8ff]">
                  {m.merchant_code} - {m.merchant_name}
                </div>
                <div className="mt-1 text-xs text-[#9cc2d9]">
                  {m.business_type || "Merchant"} · {m.contact_person || "-"} · {m.phone_primary || "-"}
                </div>
                <div className="mt-1 text-xs text-[#4ea8de]">
                  {m.township || "-"} / {m.city || "Yangon"} / {m.region_state || "Yangon Region"}
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-[#9cc2d9]">
              No active merchant found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
