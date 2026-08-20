import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Expand, FileSpreadsheet, RefreshCw, Save, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Tier = "STANDARD" | "ROYAL" | "COMMITMENT";

type Row = {
  waybill_no: string;
  recipient_name: string;
  contact_no_1: string;
  contact_no_2: string;
  township: string;
  recipient_address: string;
  customer_tier: Tier;
  item_price: string;
  weight_kg: string;
  surcharge: string;
  total_delivery_fee: string;
  cod: string;
  actual_collect: string;
  remark: string;
};

type Proof = {
  id: string;
  pickup_id?: string;
  delivery_way_id?: string;
  waybill_no?: string;
  parcel_no?: string;
  parcel_index?: number;
  status?: string;
  verification_status?: string;
  display_photo?: string;
  proof_photo_url?: string;
  proof_photo_path?: string;
  proof_photo_data?: string;
  photo_url?: string;
  image_url?: string;
};

const DEFAULT_PICKUP = "P0624-BBG-010";

function blankRow(index: number): Row {
  return {
    waybill_no: `WB-${String(index + 1).padStart(3, "0")}`,
    recipient_name: "",
    contact_no_1: "",
    contact_no_2: "",
    township: "",
    recipient_address: "",
    customer_tier: "STANDARD",
    item_price: "",
    weight_kg: "1",
    surcharge: "0",
    total_delivery_fee: "0",
    cod: "0",
    actual_collect: "0",
    remark: "",
  };
}

function num(v: any) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      current.push(cell);
      cell = "";
    } else if (ch === "\n") {
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  current.push(cell);
  rows.push(current);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function rowFromObject(o: any, index: number): Row {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const value = o[k] ?? o[normalizeKey(k)];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    }
    return "";
  };

  const row: Row = {
    waybill_no: get("waybill_no", "delivery_way_id", "parcel_no") || `WB-${String(index + 1).padStart(3, "0")}`,
    recipient_name: get("recipient_name", "recipient", "customer_name", "receiver_name"),
    contact_no_1: get("contact_no_1", "contact_no", "phone", "recipient_phone"),
    contact_no_2: get("contact_no_2", "phone_2"),
    township: get("township", "township_mm", "destination_township"),
    recipient_address: get("recipient_address", "address", "delivery_address", "receiver_address"),
    customer_tier: (get("customer_tier", "customer_type") || "STANDARD").toUpperCase() as Tier,
    item_price: get("item_price"),
    weight_kg: get("weight_kg", "weight") || "1",
    surcharge: get("surcharge") || "0",
    total_delivery_fee: get("total_delivery_fee", "delivery_fee") || "0",
    cod: get("cod") || "0",
    actual_collect: get("actual_collect") || "0",
    remark: get("remark", "remarks", "special_instruction"),
  };

  return recalcRow(row);
}

function baseFeeForTownship(township: string) {
  const t = township.toLowerCase();
  if (t.includes("hlaing thar yar") || t.includes("shwe pyi thar") || t.includes("လှိုင်သာယာ") || t.includes("ရွှေပြည်သာ")) return 4500;
  if (t.includes("mandalay") || t.includes("မန္တလေး")) return 6000;
  if (t.includes("naypyitaw") || t.includes("nay pyi taw") || t.includes("နေပြည်တော်")) return 6000;
  if (t.includes("aung mingalar") || t.includes("အောင်မင်္ဂလာ")) return 3000;
  if (t.includes("dagon thiri") || t.includes("ဒဂုံသီရိ")) return 4000;
  return 4000;
}

function recalcRow(row: Row): Row {
  const tier = (row.customer_tier || "STANDARD").toUpperCase() as Tier;
  const includedKg = tier === "STANDARD" ? 3 : 5;
  const extraKg = Math.max(0, Math.ceil(num(row.weight_kg) - includedKg));
  const fee = baseFeeForTownship(row.township) + extraKg * 500 + num(row.surcharge);
  const cod = num(row.cod);
  const itemPrice = num(row.item_price);
  const actual = (cod > 0 ? cod : itemPrice) + fee;
  return {
    ...row,
    customer_tier: tier,
    total_delivery_fee: String(fee),
    actual_collect: String(actual),
  };
}

function templateCsv() {
  const headers = [
    "waybill_no",
    "recipient_name",
    "contact_no_1",
    "contact_no_2",
    "township",
    "recipient_address",
    "customer_tier",
    "item_price",
    "weight_kg",
    "surcharge",
    "total_delivery_fee",
    "cod",
    "actual_collect",
    "remark",
  ];
  return headers.join(",") + "\n";
}

function downloadText(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadXlsxLib() {
  if ((window as any).XLSX) return (window as any).XLSX;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-be-xlsx="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Excel parser")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.async = true;
    script.dataset.beXlsx = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Excel parser"));
    document.head.appendChild(script);
  });

  return (window as any).XLSX;
}

function photoFromProof(proof: Proof) {
  const raw =
    proof.display_photo ||
    proof.proof_photo_url ||
    proof.photo_url ||
    proof.image_url ||
    proof.proof_photo_data ||
    proof.proof_photo_path ||
    "";

  if (!raw) return "";

  if (raw.startsWith("http") || raw.startsWith("data:image")) return raw;

  try {
    const { data } = supabase.storage.from("pickup-parcel-proofs").getPublicUrl(raw);
    return data.publicUrl || raw;
  } catch {
    return raw;
  }
}

export default function DataEntryProductionReadyV29() {
  const [pickupId, setPickupId] = useState(() => localStorage.getItem("be_data_entry_pickup_id") || DEFAULT_PICKUP);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => blankRow(i)));
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [full, setFull] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const proofCards = useMemo(() => {
    const cards = Array.from({ length: Math.max(10, rows.length) }, (_, i) => {
      const proof = proofs.find((p) => Number(p.parcel_index) === i + 1) || proofs[i];
      return proof || { id: `pending-${i}`, parcel_index: i + 1, verification_status: "PENDING" };
    });
    return cards;
  }, [proofs, rows.length]);

  async function currentEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.email || "unknown_operator";
    } catch {
      return "unknown_operator";
    }
  }

  async function refreshProofs() {
    setMessage("Refreshing rider proofs...");
    const attempts: (() => Promise<any[]>)[] = [
      async () => {
        const { data, error } = await (supabase as any).rpc("be_data_entry_parcel_proofs_v29", { p_pickup_id: pickupId });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
      async () => {
        const { data, error } = await (supabase as any).rpc("be_data_entry_parcel_proofs_v28", { p_pickup_id: pickupId });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
      async () => {
        const { data, error } = await (supabase as any).rpc("be_data_entry_any_rider_proofs", { p_pickup_id: pickupId });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
      async () => {
        const { data, error } = await (supabase as any).from("be_v_data_entry_parcel_proofs").select("*").or(`pickup_id.eq.${pickupId},waybill_no.eq.${pickupId},delivery_way_id.eq.${pickupId}`).limit(200);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
      async () => {
        const { data, error } = await (supabase as any).from("be_v_data_entry_rider_proofs").select("*").or(`pickup_id.eq.${pickupId},waybill_no.eq.${pickupId},delivery_way_id.eq.${pickupId}`).limit(200);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
      async () => {
        const { data, error } = await (supabase as any).from("be_pickup_parcel_verifications").select("*").eq("pickup_id", pickupId).limit(200);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      },
    ];

    for (const attempt of attempts) {
      try {
        const data = await attempt();
        if (data.length) {
          setProofs(data);
          setMessage(`${data.length} rider proof record(s) loaded.`);
          return;
        }
      } catch {
        // Continue to next proof source.
      }
    }

    setProofs([]);
    setMessage("No rider proof photos found for this pickup. New rider photos must be saved from Rider App for this pickup ID.");
  }

  async function refreshRows() {
    try {
      const { data, error } = await (supabase as any).rpc("be_data_entry_load_registration_lines_v5", { p_pickup_id: pickupId });
      if (!error && Array.isArray(data) && data.length) {
        setRows(data.map(rowFromObject));
        setMessage(`${data.length} registration line(s) loaded.`);
        return;
      }
    } catch {}

    try {
      const { data, error } = await (supabase as any).from("be_data_entry_registration_lines").select("*").eq("pickup_id", pickupId).limit(200);
      if (!error && Array.isArray(data) && data.length) {
        setRows(data.map(rowFromObject));
        setMessage(`${data.length} registration line(s) loaded.`);
        return;
      }
    } catch {}
  }

  useEffect(() => {
    localStorage.setItem("be_data_entry_pickup_id", pickupId);
  }, [pickupId]);

  useEffect(() => {
    void refreshRows();
    void refreshProofs();
  }, []);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        return recalcRow({ ...row, ...patch });
      }),
    );
  }

  function exportCsv() {
    const headers = Object.keys(blankRow(0)) as (keyof Row)[];
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","))].join("\n");
    downloadText(`Britium_Data_Entry_${pickupId}.csv`, csv);
  }

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = await file.text();
      const parsed = parseCsv(text);
      const headers = parsed[0].map(normalizeKey);
      const dataRows = parsed.slice(1).map((r, i) => {
        const o: any = {};
        headers.forEach((h, ix) => {
          o[h] = r[ix] || "";
        });
        return rowFromObject(o, i);
      });
      setRows(dataRows.length ? dataRows : rows);
      setMessage(`${dataRows.length} CSV row(s) loaded.`);
      return;
    }

    const XLSX = await loadXlsxLib();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    const dataRows = json.map(rowFromObject);
    setRows(dataRows.length ? dataRows : rows);
    setMessage(`${dataRows.length} Excel row(s) loaded.`);
  }

  async function saveDraft() {
    const key = `be_data_entry_draft_${pickupId}`;
    localStorage.setItem(key, JSON.stringify(rows));
    const actor = await currentEmail();

    try {
      const { data, error } = await (supabase as any).rpc("be_data_entry_submit_all_info_v5", {
        p_pickup_id: pickupId,
        p_rows: rows,
        p_actor_email: actor,
        p_submit: false,
      });
      if (error) throw error;
      setMessage(`Draft saved. ${JSON.stringify(data)}`);
    } catch {
      setMessage("Draft saved locally. Backend draft RPC was not available.");
    }
  }

  async function saveGenerate() {
    const actor = await currentEmail();

    try {
      const { data, error } = await (supabase as any).rpc("be_data_entry_submit_all_info_v5", {
        p_pickup_id: pickupId,
        p_rows: rows,
        p_actor_email: actor,
        p_submit: true,
      });
      if (error) throw error;
      setMessage(`Saved and submitted. ${JSON.stringify(data)}`);
    } catch {
      try {
        const { data, error } = await (supabase as any).rpc("be_register_delivery_items_v25", {
          p_rows: rows,
          p_actor_email: actor,
        });
        if (error) throw error;
        setMessage(`Saved to delivery workflow. ${JSON.stringify(data)}`);
      } catch (error: any) {
        setMessage(`Save failed: ${error?.message || String(error)}`);
      }
    }
  }

  const rootClass = full
    ? "fixed inset-0 z-[2147483000] overflow-auto bg-[#061525] p-4 text-slate-100"
    : "min-h-screen bg-[#061525] p-4 text-slate-100";

  return (
    <main className={rootClass} data-be-data-entry-production-v29="true">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.currentTarget.value = "";
        }}
      />

      <div className="mx-auto max-w-[1800px] space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-400">DATA ENTRY REGISTRATION</p>
              <h1 className="mt-1 text-xl font-black">Production Data Entry v29</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-sky-200">
                <span>Pickup:</span>
                <input value={pickupId} onChange={(e) => setPickupId(e.target.value)} className="h-8 rounded-lg border border-sky-800 bg-slate-950 px-2 text-white outline-none" />
                <span>Lines: {rows.length}</span>
                <span>Proof records: {proofs.length}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={refreshProofs} className="rounded-xl border border-sky-700 bg-slate-950 px-4 py-2 text-sm font-black">
                <RefreshCw className="mr-1 inline h-4 w-4" /> Refresh Rider Proofs
              </button>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-black text-white">
                <Upload className="mr-1 inline h-4 w-4" /> Bulk Upload Excel / CSV
              </button>
              <button onClick={() => downloadText("Britium_Data_Entry_Template.csv", templateCsv())} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950">
                <FileSpreadsheet className="mr-1 inline h-4 w-4" /> Download Template
              </button>
              <button onClick={exportCsv} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black">
                <Download className="mr-1 inline h-4 w-4" /> Export CSV
              </button>
              <button onClick={saveDraft} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950">
                <Save className="mr-1 inline h-4 w-4" /> Save Registration Draft
              </button>
              <button onClick={saveGenerate} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950">
                Save Data & Generate Waybill
              </button>
              <button onClick={() => setFull((v) => !v)} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950">
                <Expand className="mr-1 inline h-4 w-4" /> {full ? "Exit Full Screen" : "Full Screen Data Entry"}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-x-auto rounded-3xl border border-sky-900 bg-[#0b2940] p-3">
          <div className="flex min-w-max gap-3 pb-2">
            {proofCards.map((proof, i) => {
              const photo = photoFromProof(proof);
              return (
                <div key={proof.id || i} className="w-44 overflow-hidden rounded-xl border border-sky-800 bg-slate-950">
                  <div className="flex h-28 items-center justify-center bg-[#0b2940] text-xs text-sky-200">
                    {photo ? (
                      <button type="button" onClick={() => window.open(photo, "_blank")}>
                        <img src={photo} alt={`Proof ${i + 1}`} className="h-28 w-44 object-cover" />
                      </button>
                    ) : (
                      "Rider proof pending"
                    )}
                  </div>
                  <div className="p-2 text-xs">
                    <p className="text-sky-200">Delivery Way</p>
                    <p>Parcel: {proof.parcel_index || i + 1}</p>
                    <p className={photo ? "font-black text-emerald-300" : "font-black text-amber-300"}>{photo ? proof.verification_status || proof.status || "VERIFIED" : "PENDING"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-sky-900 bg-[#0b2940] p-3 text-sm text-sky-200">
          <b className="text-amber-300">Registration columns only:</b> Recipient Name · Contact No. (1) · Contact No. (2) · Township (EN/MM) · Recipient Address · Customer Tier · Item Price · Weight KG · Surcharge · Total Delivery Fee · COD · Actual Collect · Remark / Special Instruction.
          <br />
          <span>System-generated fields such as DeliveryWay ID, Pickup Date and Merchant are hidden during registration and included only in export/report/print.</span>
          {message ? <p className="mt-2 font-bold text-amber-300">{message}</p> : null}
        </section>

        <section className="overflow-auto rounded-3xl border border-sky-900 bg-[#071d30]">
          <table className="min-w-[1700px] w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-amber-400 text-slate-950">
              <tr>
                {[
                  "RECIPIENT NAME",
                  "CONTACT NO. (1)",
                  "CONTACT NO. (2)",
                  "TOWNSHIP (EN/MM)",
                  "RECIPIENT ADDRESS",
                  "CUSTOMER TIER",
                  "ITEM PRICE",
                  "WEIGHT KG",
                  "SURCHARGE",
                  "TOTAL DELI FEE",
                  "COD",
                  "ACTUAL COLLECT",
                  "REMARK / SPECIAL INSTRUCTION",
                ].map((h) => (
                  <th key={h} className="p-3 font-black">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-sky-950 align-top">
                  <td className="p-2"><input value={row.recipient_name} onChange={(e) => updateRow(index, { recipient_name: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.contact_no_1} onChange={(e) => updateRow(index, { contact_no_1: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.contact_no_2} onChange={(e) => updateRow(index, { contact_no_2: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2">
                    <input value={row.township} onChange={(e) => updateRow(index, { township: e.target.value })} placeholder="Type EN/MM township..." className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" />
                    <p className="mt-1 text-[11px] text-sky-300">English/Myanmar supported</p>
                  </td>
                  <td className="p-2"><textarea value={row.recipient_address} onChange={(e) => updateRow(index, { recipient_address: e.target.value })} className="h-14 w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2">
                    <select value={row.customer_tier} onChange={(e) => updateRow(index, { customer_tier: e.target.value as Tier })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 font-bold text-white outline-none">
                      <option>STANDARD</option>
                      <option>ROYAL</option>
                      <option>COMMITMENT</option>
                    </select>
                  </td>
                  <td className="p-2"><input value={row.item_price} onChange={(e) => updateRow(index, { item_price: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.weight_kg} onChange={(e) => updateRow(index, { weight_kg: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.surcharge} onChange={(e) => updateRow(index, { surcharge: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.total_delivery_fee} onChange={(e) => updateRow(index, { total_delivery_fee: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 font-bold text-amber-300 outline-none" /></td>
                  <td className="p-2"><input value={row.cod} onChange={(e) => updateRow(index, { cod: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                  <td className="p-2"><input value={row.actual_collect} onChange={(e) => updateRow(index, { actual_collect: e.target.value })} className="w-full rounded-lg border border-sky-800 bg-slate-950 p-2 font-bold text-amber-300 outline-none" /></td>
                  <td className="p-2"><textarea value={row.remark} onChange={(e) => updateRow(index, { remark: e.target.value })} className="h-14 w-full rounded-lg border border-sky-800 bg-slate-950 p-2 text-white outline-none" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
