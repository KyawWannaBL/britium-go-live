// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  border: "#1f4966",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#6f95b3",
  gold: "#f6b84b",
  orange: "#ff8a4c",
  green: "#22c55e",
  red: "#ff4f86",
  blue: "#38bdf8",
};

const today = new Date().toISOString().slice(0, 10);

function text(v: any, fallback = "") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function first(row: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
}

function readPayload(row: any) {
  const payload = row?.payload || row?.data || row?.metadata || row?.details || row?.extra || {};
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload && typeof payload === "object" ? payload : {};
}

function countValue(v: any) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 500) return 500;
  return n;
}

function makePickupId() {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PCK-${ymd}-${String(Date.now()).slice(-6)}`;
}

function normalizeMerchant(row: any, index: number, source = "") {
  const payload = readPayload(row);
  const merged = { ...payload, ...row };

  const code = first(
    merged,
    [
      "merchant_code",
      "merchant_id",
      "merchant_no",
      "customer_code",
      "customer_id",
      "account_code",
      "partner_code",
      "sender_code",
      "code",
      "short_code",
      "option_code",
      "value",
      "key",
    ],
    `M-${index + 1}`
  );

  const name = first(
    merged,
    [
      "merchant_name",
      "customer_name",
      "business_name",
      "company_name",
      "account_name",
      "partner_name",
      "sender_name",
      "name",
      "label",
      "option_label",
      "display_name",
      "title",
    ],
    code
  );

  return {
    raw: row,
    source,
    key: `${source}-${code}-${index}`,
    id: first(merged, ["id", "merchant_uuid", "customer_uuid", "uuid", "merchant_id", "customer_id"], code),
    code,
    name,
    phone: first(merged, ["contact_phone", "merchant_phone", "customer_phone", "phone", "mobile", "sender_phone", "contact_no"]),
    branch: first(merged, ["branch_code", "branch", "home_branch", "branch_name"], "YGN"),
    pickupTownship: first(merged, ["pickup_township", "township", "merchant_township", "customer_township"], ""),
    pickupCity: first(merged, ["pickup_city", "city", "merchant_city", "customer_city"], "Yangon"),
    payment: first(merged, ["payment_method", "default_payment_method", "payment_type"], "COD"),
    tariffTier: first(merged, ["tariff_tier", "tier", "default_tariff_tier", "rate_tier"], "Standard"),
    pickupAddress: first(merged, [
      "pickup_address",
      "merchant_pickup_address",
      "customer_pickup_address",
      "sender_address",
      "merchant_address",
      "customer_address",
      "address",
      "full_address",
      "registered_address",
      "shop_address",
      "office_address",
      "warehouse_address",
      "billing_address",
      "primary_address",
      "location_address",
    ]),
  };
}

function inputStyle(extra: any = {}) {
  return {
    width: "100%",
    minWidth: 0,
    border: `1px solid ${C.border}`,
    background: "#092035",
    color: C.text,
    borderRadius: 12,
    padding: "12px 13px",
    outline: "none",
    fontWeight: 800,
    fontSize: 14,
    ...extra,
  };
}

function labelStyle() {
  return {
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 7,
  };
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: "grid", gap: 0, minWidth: 0 }}>
      <span style={labelStyle()}>{label}</span>
      {children}
    </label>
  );
}

export default function CustomerServicePortalPage() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantSource, setMerchantSource] = useState("");
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState<any>(null);
  const [parcelCount, setParcelCount] = useState(1);

  const [form, setForm] = useState({
    merchantKey: "",
    merchantId: "",
    merchantCode: "",
    merchantName: "",
    contactPhone: "",
    branch: "YGN",
    pickupTownship: "",
    pickupCity: "Yangon",
    paymentMethod: "COD",
    tariffTier: "Standard",
    requestedDate: today,
    timeWindow: "09:00-12:00",
    priority: "NORMAL",
    serviceType: "Standard",
    pickupAddress: "",
  });

  async function loadMerchants() {
    const candidateTables = [
      "merchants",
      "customer_master",
      "be_merchant_master",
      "be_merchants",
      "be_merchant_profiles",
      "be_merchant_accounts",
      "be_customer_merchants",
      "be_customer_master",
      "be_customers",
      "be_master_merchants",
      "be_master_customers",
      "be_master_data",
      "be_master_data_options",
      "be_business_partners",
      "be_sender_master",
      "be_shipper_master",
      "be_account_master",
      "be_portal_pickup_requests",
    ];

    const found: any[] = [];
    const debug: string[] = [];

    for (const table of candidateTables) {
      const res = await supabase.from(table).select("*").limit(500);

      if (res.error) {
        debug.push(`${table}: ${res.error.message}`);
        continue;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      debug.push(`${table}: ${rows.length}`);

      const normalized = rows
        .map((row, i) => normalizeMerchant(row, i, table))
        .filter((m: any) => m.code && m.name && (m.pickupAddress || m.phone || m.source === "be_portal_pickup_requests"));

      for (const m of normalized) {
        const existing = found.find(
          (x) =>
            String(x.code).toLowerCase() === String(m.code).toLowerCase() ||
            String(x.name).toLowerCase() === String(m.name).toLowerCase()
        );

        if (!existing) found.push(m);
        else {
          existing.pickupAddress = existing.pickupAddress || m.pickupAddress;
          existing.phone = existing.phone || m.phone;
          existing.pickupTownship = existing.pickupTownship || m.pickupTownship;
          existing.pickupCity = existing.pickupCity || m.pickupCity;
          existing.branch = existing.branch || m.branch;
        }
      }
    }

    console.info("[CS Portal Merchant Masterdata]", debug, found);
    setMerchants(found);
    setMerchantSource(found.length ? [...new Set(found.map((m) => m.source))].join(", ") : "No merchant masterdata found");
  }

  async function loadQueue() {
    const res = await supabase
      .from("be_portal_pickup_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!res.error) setQueue(res.data || []);
  }

  async function load() {
    setLoading(true);
    setNotice(null);
    try {
      await Promise.all([loadMerchants(), loadQueue()]);
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message || "Failed to load CS portal data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectMerchant(key: string) {
    const m = merchants.find((x) => x.key === key);
    if (!m) return;

    setForm((f) => ({
      ...f,
      merchantKey: key,
      merchantId: m.id,
      merchantCode: m.code,
      merchantName: m.name,
      contactPhone: m.phone,
      branch: m.branch || "YGN",
      pickupTownship: m.pickupTownship || f.pickupTownship,
      pickupCity: m.pickupCity || "Yangon",
      paymentMethod: m.payment || f.paymentMethod,
      tariffTier: m.tariffTier || f.tariffTier,
      pickupAddress: m.pickupAddress || "",
    }));
  }

  async function submitToSupervisor() {
    setNotice(null);

    if (!form.merchantName.trim()) {
      setNotice({ type: "error", text: "Select merchant first." });
      return;
    }

    if (!form.pickupAddress.trim()) {
      setNotice({ type: "error", text: "Merchant pickup address is required." });
      return;
    }

    const totalParcels = countValue(parcelCount);

    setSaving(true);

    const requestPayload = {
      merchant_id: form.merchantId || null,
      merchant_code: form.merchantCode,
      merchant_name: form.merchantName,
      contact_phone: form.contactPhone,
      sender_phone: form.contactPhone,
      branch_code: form.branch || "YGN",
      pickup_address: form.pickupAddress,
      pickup_township: form.pickupTownship,
      pickup_city: form.pickupCity,
      requested_date: form.requestedDate,
      pickup_date: form.requestedDate,
      time_window: form.timeWindow,
      payment_method: form.paymentMethod,
      tariff_tier: form.tariffTier,
      priority: form.priority,
      service_type: form.serviceType,

      parcel_count: totalParcels,
      number_of_parcels: totalParcels,
      total_parcels: totalParcels,
      delivery_way_count: totalParcels,

      status: "PICKUP_REQUESTED",
      process_status: "PICKUP_REQUESTED",
      data_entry_status: "PENDING",
      source_portal: "CS_PORTAL",
      requester_type: "CUSTOMER_SERVICE",
    };

    try {
      const { data, error } = await supabase.rpc("be_cs_submit_pickup_request", {
        p_request: requestPayload,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error("Pickup workflow RPC did not return success.");

      setNotice({
        type: "success",
        text: `Submitted: ${data.pickup_id} · ${data.delivery_way_count} Data Entry line(s) will be generated.`,
      });

      setParcelCount(1);
      setForm((f) => ({
        ...f,
        pickupAddress: "",
        merchantKey: "",
        merchantId: "",
        merchantCode: "",
        merchantName: "",
        contactPhone: "",
        pickupTownship: "",
      }));

      await loadQueue();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message || "Submit failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", background: C.bg, color: C.text, padding: 24, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 18 }}>
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Britium Express · Customer Service
              </div>
              <h1 style={{ margin: "8px 0 0", fontSize: 28, color: C.text }}>Customer Service Pickup Portal</h1>
              <p style={{ margin: "8px 0 0", color: C.sub }}>
                CS registers pickup header only. Delivery details are entered later by Data Entry.
              </p>
              <p style={{ margin: "8px 0 0", color: C.muted, fontSize: 12 }}>
                Merchant source: {merchantSource || "not loaded"} · Loaded: {merchants.length}
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{ border: `1px solid ${C.border}`, background: "#092035", color: C.text, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </section>

        {notice && (
          <div style={{ border: `1px solid ${notice.type === "success" ? C.green : C.red}`, background: notice.type === "success" ? "rgba(34,197,94,.12)" : "rgba(255,79,134,.12)", color: notice.type === "success" ? C.green : C.red, borderRadius: 16, padding: 14, fontWeight: 800 }}>
            {notice.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18 }}>
          <section style={{ background: `linear-gradient(135deg, ${C.panel}, #092035)`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Order Pickup Request</h2>
            <p style={{ color: C.sub, marginTop: 6 }}>
              Register merchant pickup request only. No recipient/delivery information required here.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 18 }}>
              <Field label="Merchant">
                <select value={form.merchantKey} onChange={(e) => selectMerchant(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">Select merchant</option>
                  {merchants.map((m) => (
                    <option key={m.key} value={m.key}>{m.code} — {m.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Merchant Name">
                <input autoComplete="off" value={form.merchantName} onChange={(e) => setForm({ ...form, merchantName: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Contact Phone">
                <input autoComplete="off" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Branch">
                <input autoComplete="off" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Pickup Township">
                <input autoComplete="off" value={form.pickupTownship} onChange={(e) => setForm({ ...form, pickupTownship: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Pickup City">
                <input autoComplete="off" value={form.pickupCity} onChange={(e) => setForm({ ...form, pickupCity: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Payment">
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} style={inputStyle()}>
                  <option>COD</option>
                  <option>Prepaid</option>
                  <option>Monthly</option>
                </select>
              </Field>

              <Field label="Tariff Tier">
                <input autoComplete="off" value={form.tariffTier} onChange={(e) => setForm({ ...form, tariffTier: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Requested Date">
                <input type="date" value={form.requestedDate} onChange={(e) => setForm({ ...form, requestedDate: e.target.value })} style={inputStyle()} />
              </Field>

              <Field label="Time Window">
                <select value={form.timeWindow} onChange={(e) => setForm({ ...form, timeWindow: e.target.value })} style={inputStyle()}>
                  <option>09:00-12:00</option>
                  <option>12:00-15:00</option>
                  <option>15:00-18:00</option>
                </select>
              </Field>

              <Field label="Priority">
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle()}>
                  <option>NORMAL</option>
                  <option>HIGH</option>
                  <option>URGENT</option>
                </select>
              </Field>

              <Field label="Service">
                <input autoComplete="off" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} style={inputStyle()} />
              </Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <Field label="Pickup Address">
                <textarea
                  autoComplete="new-password"
                  spellCheck={false}
                  value={form.pickupAddress}
                  onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
                  placeholder="Merchant pickup address auto-fills here"
                  style={inputStyle({ minHeight: 88, resize: "vertical" })}
                />
              </Field>
            </div>

            <section style={{ marginTop: 18, border: `1px solid ${C.border}`, background: "#071827", borderRadius: 18, padding: 16 }}>
              <Field label="Number of Parcels / Delivery Ways">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={parcelCount}
                  onChange={(e) => setParcelCount(countValue(e.target.value))}
                  style={inputStyle({ fontSize: 22, color: C.gold, textAlign: "center", maxWidth: 220 })}
                />
              </Field>
              <p style={{ color: C.sub, margin: "12px 0 0", lineHeight: 1.6 }}>
                Data Entry will receive this pickup request with exactly <b style={{ color: C.gold }}>{countValue(parcelCount)}</b> registration line(s).
              </p>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                disabled={saving}
                onClick={submitToSupervisor}
                style={{ border: `1px solid rgba(246,184,75,.55)`, background: "linear-gradient(135deg,#f6b84b,#ff8a4c)", color: "#1b0b05", borderRadius: 14, padding: "13px 22px", fontWeight: 950, cursor: saving ? "not-allowed" : "pointer", display: "flex", gap: 9, alignItems: "center", boxShadow: "0 10px 30px rgba(246,184,75,.22)" }}
              >
                <Save size={17} /> {saving ? "Submitting..." : "Submit to Supervisor"}
              </button>
            </div>
          </section>

          <aside style={{ background: `linear-gradient(135deg, ${C.panel}, #092035)`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>CS Pickup Queue</h2>
            <p style={{ color: C.sub, marginTop: 6 }}>Latest pickup requests from be_portal_pickup_requests.</p>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              {queue.length === 0 && (
                <div style={{ color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 16 }}>
                  No pickup requests yet.
                </div>
              )}

              {queue.slice(0, 12).map((r: any) => (
                <div key={r.id || r.pickup_id} style={{ border: `1px solid ${C.border}`, background: "#071827", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b style={{ color: C.gold }}>{text(r.pickup_id, "Pickup")}</b>
                    <span style={{ color: C.blue, fontSize: 12, fontWeight: 900 }}>{text(r.status, "SUBMITTED")}</span>
                  </div>
                  <div style={{ color: C.text, marginTop: 6, fontWeight: 800 }}>{text(r.merchant_name)}</div>
                  <div style={{ color: C.sub, marginTop: 5, fontSize: 13 }}>
                    {text(r.pickup_township)} · {text(r.pickup_city)} · {countValue(r.parcel_count || r.total_parcels || r.number_of_parcels || r.delivery_way_count)} line(s)
                  </div>
                  <div style={{ color: C.muted, marginTop: 5, fontSize: 12 }}>
                    Data Entry: {text(r.data_entry_status, "PENDING")}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
