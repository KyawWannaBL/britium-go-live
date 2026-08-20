// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Printer, RefreshCw } from "lucide-react";
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  red: "#f87171",
};

function val(row: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() && !["null", "undefined", "nan"].includes(String(v).toLowerCase())) {
      return String(v).trim();
    }
  }
  return fallback;
}

function num(v: any) {
  const n = Number(String(v ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v: any) {
  return num(v).toLocaleString();
}

function normalizeRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function groupName(row: any) {
  return val(row, ["wayplan_id", "wayplan_code", "manifest_group", "vehicle_name", "vehicle_code", "rider_name"], "Generated Wayplan");
}

export default function ManifestPrintStudioPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      let res = await supabase.rpc("be_warehouse_wayplan_center", { p_limit: 1000 });
      if (res.error) {
        res = await supabase.rpc("be_wayplan_command_center", { p_limit: 1000 });
      }
      if (res.error) throw res.error;
      setRows(normalizeRows(res.data));
    } catch (e: any) {
      setErr(e?.message || "Failed to load generated manifest rows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const key = groupName(r);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <style>{`
        .manifest-page {
          width: 210mm;
          min-height: 297mm;
          padding: 10mm;
          margin: 8mm auto;
          background: white;
          color: black;
          box-sizing: border-box;
          page-break-after: always;
          font-family: Pyidaungsu, Arial, sans-serif;
          font-size: 11px;
        }
        .manifest-title {
          text-align: center;
          font-size: 20px;
          font-weight: 900;
          margin-bottom: 15px;
          text-decoration: underline;
        }
        .manifest-meta {
          width: 100%;
          border-collapse: collapse;
          font-weight: 700;
          font-size: 12px;
          margin-bottom: 10px;
        }
        .manifest-meta td {
          border: 1px solid #ddd;
          padding: 4px;
        }
        .manifest-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .manifest-table th {
          background: #D7E4BC;
          border: 1px solid black;
          padding: 5px;
          text-align: center;
          font-weight: 900;
        }
        .manifest-table td {
          border: 1px solid black;
          padding: 4px;
          vertical-align: middle;
          word-break: break-word;
        }
        .sum-row td {
          background: #f9f9f9;
          font-weight: 900;
        }
        .manifest-footer {
          font-size: 12px;
          font-weight: 700;
          line-height: 1.8;
          margin-top: 15px;
        }
        .manifest-flex {
          display: flex;
          justify-content: space-between;
          gap: 14px;
        }
        .sign-box {
          text-align: center;
          width: 22%;
          font-size: 11px;
        }
        @media print {
          body * { visibility: hidden !important; }
          #manifest-print-area, #manifest-print-area * { visibility: visible !important; }
          #manifest-print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; }
          .no-print { display: none !important; }
          .manifest-page { margin: 0; box-shadow: none; }
        }
      `}</style>

      <section className="no-print" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Manifest Print Studio</h1>
        <p style={{ color: C.sub }}>Generated from live wayplan/warehouse rows after Generate Wayplan.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={load} disabled={loading} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
            <RefreshCw size={15} /> {loading ? "Loading..." : "Sync"}
          </button>
          <button onClick={() => window.print()} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
            <Printer size={15} /> Print All
          </button>
        </div>
        {err && <div style={{ color: C.red, marginTop: 10 }}>{err}</div>}
      </section>

      <section id="manifest-print-area">
        {groups.map(([name, items]) => {
          const normalCount = items.filter((r) => !String(val(r, ["township", "destination"], "")).toLowerCase().includes("highway")).length;
          const highwayCount = items.length - normalCount;
          const itemTotal = items.reduce((s, r) => s + num(val(r, ["item_price", "cod_amount", "cod", "cod_expected"], "0")), 0);
          const feeTotal = items.reduce((s, r) => s + num(val(r, ["delivery_fee", "deli_fee", "fee"], "0")), 0);
          const total = itemTotal + feeTotal;

          return (
            <div className="manifest-page" key={name}>
              <div className="manifest-title">Manifest: {name}</div>

              <table className="manifest-meta">
                <tbody>
                  <tr>
                    <td style={{ width: "38%" }}>Date: {new Date().toLocaleDateString("en-GB")}</td>
                    <td style={{ width: "38%" }}>ယာဉ်မောင်း/ပို့ဆောင်သူ: ___________________</td>
                    <td style={{ width: "24%" }}>ပုံမှန်ပို့ဆောင်ရမည့်အရေအတွက်: {normalCount}</td>
                  </tr>
                  <tr>
                    <td>ကုန်လှောင်ရုံတာဝန်ခံ: ___________________</td>
                    <td>ယာဉ်နောက်လိုက်: ___________________</td>
                    <td>အဝေးပြေးဂိတ်ပို့ရန်အရေအတွက်: {highwayCount}</td>
                  </tr>
                  <tr>
                    <td>ကုန်လှောင်ရုံလက်ထောက်: ___________________</td>
                    <td>ယာဉ်အမှတ် (Plate No): ___________________</td>
                    <td>စုစုပေါင်းပါဆယ်အရေအတွက်: {items.length}</td>
                  </tr>
                  <tr>
                    <td colSpan={3}>ငွေအကြွေထုတ်ယူမှုပမာဏ: ___________________</td>
                  </tr>
                </tbody>
              </table>

              <table className="manifest-table">
                <thead>
                  <tr>
                    <th style={{ width: "10%" }}>Way ID</th>
                    <th style={{ width: "3%" }}>စဉ်</th>
                    <th style={{ width: "11%" }}>အမည်</th>
                    <th style={{ width: "8%" }}>မြို့နယ်</th>
                    <th style={{ width: "18%" }}>လိပ်စာ</th>
                    <th style={{ width: "5%" }}>အလေးချိန်<br />kg</th>
                    <th style={{ width: "7%" }}>ပစ္စည်းတန်ဖိုး</th>
                    <th style={{ width: "6%" }}>ပို့ဆောင်ခ</th>
                    <th style={{ width: "6%" }}>အလေးချိန်<br />ကျသင့်ငွေ</th>
                    <th style={{ width: "8%" }}>စုစုပေါင်း</th>
                    <th style={{ width: "10%" }}>ဖုန်း</th>
                    <th style={{ width: "8%" }}>မှတ်ချက်</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => {
                    const item = num(val(r, ["item_price", "cod_amount", "cod", "cod_expected"], "0"));
                    const fee = num(val(r, ["delivery_fee", "deli_fee", "fee"], "0"));
                    const weightFee = num(val(r, ["weight_fee", "surcharge"], "0"));
                    return (
                      <tr key={`${name}-${i}`}>
                        <td style={{ textAlign: "center" }}>{val(r, ["delivery_way_id", "tracking_no", "waybill_no", "pickup_id"], "-")}</td>
                        <td style={{ textAlign: "center" }}>{i + 1}</td>
                        <td>{val(r, ["recipient_name", "receiver_name", "customer_name"], "-")}</td>
                        <td style={{ textAlign: "center" }}>{val(r, ["township", "destination", "delivery_township"], "-")}</td>
                        <td>{val(r, ["address", "delivery_address", "recipient_address"], "-")}</td>
                        <td style={{ textAlign: "center" }}>{val(r, ["weight", "weight_kg"], "0")}</td>
                        <td style={{ textAlign: "right" }}>{money(item)}</td>
                        <td style={{ textAlign: "right" }}>{money(fee)}</td>
                        <td style={{ textAlign: "right" }}>{money(weightFee)}</td>
                        <td style={{ textAlign: "right", fontWeight: 900 }}>{money(item + fee + weightFee)}</td>
                        <td style={{ textAlign: "center" }}>{val(r, ["recipient_phone", "receiver_phone", "phone"], "-")}</td>
                        <td>{val(r, ["remarks", "remark", "note"], "")}</td>
                      </tr>
                    );
                  })}
                  <tr className="sum-row">
                    <td colSpan={6} style={{ textAlign: "right" }}>Trip Totals (စုစုပေါင်း):</td>
                    <td style={{ textAlign: "right" }}>{money(itemTotal)}</td>
                    <td style={{ textAlign: "right" }}>{money(feeTotal)}</td>
                    <td style={{ textAlign: "right" }}>0</td>
                    <td style={{ textAlign: "right", color: "red" }}>{money(total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>

              <div className="manifest-footer">
                <div className="manifest-flex">
                  <div>ကောက်ခံရရှိငွေ (Cash Collected): ______________________</div>
                  <div>Mobile Banking: _________________</div>
                </div>
                <div>စုစုပေါင်း (Total Collected): ______________________</div>

                <div className="manifest-flex" style={{ marginTop: 20 }}>
                  <div className="sign-box">______________________<br />ယာဉ်မောင်း/ပို့ဆောင်သူ လက်မှတ်</div>
                  <div className="sign-box">______________________<br />ယာဉ်နောက်လိုက် လက်မှတ်</div>
                  <div className="sign-box">______________________<br />ကုန်လှောင်ရုံတာဝန်ခံ လက်မှတ်</div>
                  <div className="sign-box">______________________<br />ကုန်လှောင်ရုံလက်ထောက်</div>
                </div>

                <div className="manifest-flex" style={{ marginTop: 20, padding: "0 50px" }}>
                  <div className="sign-box">______________________<br />Operation (Ack)</div>
                  <div className="sign-box">______________________<br />Finance (Received)</div>
                  <div className="sign-box">______________________<br />Finance (Ack)</div>
                </div>
              </div>
            </div>
          );
        })}

        {!groups.length && (
          <div className="manifest-page">
            <div className="manifest-title">No generated wayplan manifest rows found</div>
            <p>Click Generate Wayplan in Wayplan Command Center first, then return here and press Sync.</p>
          </div>
        )}
      </section>
    </main>
  );
}