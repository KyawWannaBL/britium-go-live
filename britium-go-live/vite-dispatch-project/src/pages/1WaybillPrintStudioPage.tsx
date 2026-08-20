// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Printer, RefreshCw, Search, Barcode } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const WAYBILL_SERVICE_NOTICE = "အောက်ပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ\nHotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  red: "#f87171",
};

type PaperSize = "4x6" | "A5" | "A4";
type LabelSize = "4x6" | "4x3" | "4x2" | "2x3";

const PAPER_SIZES: Record<PaperSize, { label: string; page: string; width: string; height: string }> = {
  "4x6": { label: "4 × 6 inch sheet", page: "4in 6in", width: "4in", height: "6in" },
  A5: { label: "A5 sheet", page: "148mm 210mm", width: "148mm", height: "210mm" },
  A4: { label: "A4 sheet", page: "210mm 297mm", width: "210mm", height: "297mm" },
};

const LABEL_SIZES: Record<LabelSize, { label: string }> = {
  "4x6": { label: "4 × 6 main sticker (1 per page)" },
  "4x3": { label: "4 × 3 half sticker (2 per page)" },
  "4x2": { label: "4 × 2 third sticker (3 per page)" },
  "2x3": { label: "2 × 3 quarter sticker (4 per page)" },
};

const PRINT_LAYOUTS: Record<PaperSize, Record<LabelSize, { perPage: number }>> = {
  "4x6": { "4x6": { perPage: 1 }, "4x3": { perPage: 2 }, "4x2": { perPage: 3 }, "2x3": { perPage: 4 } },
  A5: { "4x6": { perPage: 1 }, "4x3": { perPage: 2 }, "4x2": { perPage: 3 }, "2x3": { perPage: 4 } },
  A4: { "4x6": { perPage: 1 }, "4x3": { perPage: 2 }, "4x2": { perPage: 3 }, "2x3": { perPage: 4 } },
};

function chunkRows<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    pages.push(rows.slice(index, index + size));
  }
  return pages;
}

function first(row: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() && String(v).toLowerCase() !== "null") {
      return String(v).trim();
    }
  }
  return fallback;
}

function money(v: any) {
  return Number(v || 0).toLocaleString();
}

function waybillNo(row: any) {
  return first(row, ["waybill_no", "waybill_number", "tracking_no", "delivery_way_id", "delivery_waybill_id", "pickup_way_id", "pickup_id"], "UNASSIGNED");
}

function qrSrc(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(value)}&margin=0`;
}

function barcodeSrc(value: string) {
  return `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(value)}&code=Code128&translate-esc=on&imagetype=Png&dpi=96`;
}

function normalizeRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.waybills)) return payload.waybills;
  return [];
}

async function waitForPrintAssets(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
          };
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          window.setTimeout(finish, 8000);
        }),
    ),
  );
  
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

function WaybillLabel({ row, labelSize }: { row: any; labelSize: LabelSize }) {
  const wb = waybillNo(row);
  const merchant = first(row, ["merchant_name", "merchant", "merchant_code"], "-");
  const recipient = first(row, ["recipient_name", "receiver_name", "receiver", "customer_name"], "-");
  const phone = first(row, ["recipient_phone", "receiver_phone", "phone", "customer_phone"], "-");
  const address = first(row, ["recipient_address", "delivery_address", "address", "township"], "-");
  const itemPrice = Number(first(row, ["item_price", "item_value", "cod_amount", "cod"], "0"));
  const fee = Number(first(row, ["delivery_fee", "delivery_charges", "deli_fee", "fee"], "0"));
  const prepaid = Number(first(row, ["prepaid_amount", "prepaid"], "0"));
  const cod = Number(first(row, ["actual_collect", "final_cod", "cod_amount", "cod"], "0")) || Math.max(itemPrice + fee - prepaid, 0);
  const cbm = first(row, ["cbm", "volume"], "1");
  const weight = first(row, ["weight", "kg"], "5");
  const sidebar = first(row, ["route_name", "township", "city"], "မန္တလေး");
  
  const remark = first(row, ["remarks", "remark", "notes"], WAYBILL_SERVICE_NOTICE);
  const formattedTime = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (labelSize === "4x3") {
    return (
      <div className="f4">
          <div className="flex space-between border-bottom" style={{ paddingBottom: 8, marginBottom: 8 }}>
              <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#2c3e50", color: "white", fontSize: 16, textAlign: "center", lineHeight: "30px", fontWeight: "bold" }}>B</div>
                  <div>
                      <div className="bold" style={{ fontSize: 14 }}>BRITIUM EXPRESS</div>
                      <div style={{ fontSize: 10 }}>Hotline: 09-897447744</div>
                  </div>
              </div>
              <div className="flex" style={{ gap: 10, textAlign: "right", alignItems: "center" }}>
                  <div>
                      <div style={{ width: 120, height: 24 }}><img src={barcodeSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "fill" }} alt="bc" /></div>
                      <div className="bold" style={{ fontSize: 10, marginTop: 2 }}>{wb}</div>
                  </div>
                  <div style={{ width: 40, height: 40 }}><img src={qrSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="qr" /></div>
              </div>
          </div>
          <div className="flex" style={{ flex: 1 }}>
              <div style={{ flex: 1.5, borderRight: "1px solid #000", paddingRight: 8 }}>
                  <div><span className="bold">Merchant:</span> {merchant} Os</div>
                  <div style={{ marginTop: 8 }}><span className="bold">Recipient:</span> <span className="bold" style={{ fontSize: 14 }}>{recipient}</span></div>
                  <div>{phone}</div>
                  <div style={{ marginTop: 4, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{address}</div>
              </div>
              <div style={{ flex: 1, paddingLeft: 8, display: "flex", flexDirection: "column" }}>
                  <div className="flex space-between" style={{ marginBottom: 4 }}><span>Item Price:</span> <span>{money(itemPrice)}</span></div>
                  <div className="flex space-between" style={{ marginBottom: 4 }}><span>Deli Fee:</span> <span>{money(fee)}</span></div>
                  <div className="flex space-between" style={{ marginBottom: 4 }}><span>Prepaid:</span> <span>{money(prepaid)}</span></div>
                  <div className="f4-cod bg-grey">
                      <span>COD</span><br/>{money(cod)}
                  </div>
              </div>
          </div>
      </div>
    );
  }

  if (labelSize === "4x2") {
    return (
      <div className="f2">
          <div className="f2-side">{sidebar}</div>
          <div className="f2-main">
              <div className="flex space-between border-bottom" style={{ paddingBottom: 3, marginBottom: 3, alignItems: "flex-start" }}>
                  <div className="flex" style={{ gap: 4 }}>
                      <div className="bold" style={{ fontSize: 12 }}>4D</div>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#2c3e50", color: "white", fontSize: 9, textAlign: "center", lineHeight: "14px", fontWeight: "bold", marginTop: 2 }}>B</div>
                      <div>
                          <div className="bold" style={{ fontSize: 9 }}>BRITIUM EXPRESS DELIVERY SERVICE</div>
                          <div style={{ fontSize: 8 }}>09 - 897447744</div>
                          <div style={{ fontSize: 8, marginTop: 3 }}>OS : {merchant}</div>
                      </div>
                  </div>
                  <div className="flex" style={{ gap: 4, textAlign: "right", alignItems: "center" }}>
                      <div>
                          <div style={{ width: 90, height: 18 }}><img src={barcodeSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "fill" }} alt="bc" /></div>
                          <div className="bold" style={{ fontSize: 8, marginTop: 1 }}>{wb}</div>
                      </div>
                      <div style={{ width: 32, height: 32 }}><img src={qrSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="qr" /></div>
                  </div>
              </div>
              <div className="flex" style={{ flex: 1 }}>
                  <div style={{ width: 14, writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 7 }}>Recipient :</div>
                  <div style={{ flex: 1.5, borderRight: "1px solid #000", paddingRight: 4 }}>
                      <div className="bold" style={{ fontSize: 11 }}>{recipient}</div>
                      <div className="bold" style={{ fontSize: 9 }}>{phone}</div>
                      <div style={{ fontSize: 8, marginTop: 2, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{address}</div>
                  </div>
                  <div style={{ flex: 1, paddingLeft: 4, display: "flex", flexDirection: "column" }}>
                      <div className="flex space-between"><span>Item Price :</span> <span>{money(itemPrice)}</span></div>
                      <div className="flex space-between"><span>Deli Fee :</span> <span>{money(fee)}</span></div>
                      <div className="flex space-between"><span>Surcharge :</span> <span>-</span></div>
                      <div style={{ fontSize: 7, marginTop: 2 }}>CBM/wt. (Kg) : {cbm}/{weight}</div>
                      <div className="f2-cod bg-grey">{money(cod)}</div>
                  </div>
              </div>
          </div>
      </div>
    );
  }

  if (labelSize === "2x3") {
    return (
      <div className="f1">
          <div className="flex space-between border-bottom" style={{ paddingBottom: 2, marginBottom: 4 }}>
              <div className="flex" style={{ alignItems: "center", gap: 2 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#2c3e50", color: "white", fontSize: 9, textAlign: "center", lineHeight: "14px", fontWeight: "bold" }}>B</div>
                  <div>
                      <div className="bold" style={{ fontSize: 7 }}>BRITIUM EXPRESS</div>
                      <div style={{ fontSize: 6 }}>DELIVERY SERVICE</div>
                      <div className="bold" style={{ fontSize: 7 }}>09-897447744</div>
                  </div>
              </div>
              <div style={{ width: 32, height: 32 }}><img src={qrSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="qr" /></div>
          </div>
          <div style={{ flex: 1 }}>
              <div>Merchant : {merchant}</div>
              <div style={{ marginTop: 6 }}>Recipient : {recipient}</div>
              <div style={{ marginTop: 10, fontSize: 7 }}>Remarks :</div>
          </div>
          <div className="flex space-between" style={{ alignItems: "flex-end", marginBottom: 4 }}>
              <div style={{ lineHeight: 1.4 }}>
                  <div>Item Price : {money(itemPrice)}</div>
                  <div>Deli Fee : {money(fee)}</div>
              </div>
              <div className="f1-cod bg-grey">
                  <span>COD</span><br/>
                  <div style={{ marginTop: 2 }}>{money(cod)}</div>
              </div>
          </div>
          <div style={{ textAlign: "center", borderTop: "1px solid #000", paddingTop: 2 }}>
              <div style={{ width: "100%", height: 18 }}><img src={barcodeSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "fill" }} alt="bc" /></div>
              <div style={{ fontSize: 6, marginTop: 1 }}>{formattedTime}</div>
          </div>
      </div>
    );
  }

  return (
    <div className="f3">
        <div className="flex space-between border-bottom" style={{ paddingBottom: 12, marginBottom: 12 }}>
            <div className="flex" style={{ gap: 10, alignItems: "center" }}>
                <div style={{ width: 45, height: 45, borderRadius: "50%", background: "#2c3e50", color: "white", fontSize: 24, textAlign: "center", lineHeight: "45px", fontWeight: "bold" }}>B</div>
                <div>
                    <div className="bold" style={{ fontSize: 20 }}>BRITIUM EXPRESS</div>
                    <div style={{ fontSize: 15, marginTop: 2 }}>DELIVERY SERVICE</div>
                    <div className="bold" style={{ fontSize: 13, marginTop: 4 }}>HotLine: 09 - 897 44 77 44</div>
                </div>
            </div>
            <div className="text-right">
                <div style={{ fontSize: 12 }}>{formattedTime}</div>
                <div style={{ width: 80, height: 80, margin: "6px 0 6px auto" }}><img src={qrSrc(wb)} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="qr" /></div>
                <div style={{ fontSize: 12, fontWeight: "bold" }}>{wb}</div>
            </div>
        </div>
        <div className="border-bottom" style={{ paddingBottom: 12, marginBottom: 12 }}>
            <table style={{ width: "100%", fontSize: 13, lineHeight: 1.5 }}>
                <tbody>
                  <tr><td style={{ width: 90, verticalAlign: "top" }}>Merchant :</td><td>{merchant} Os<br/><br/>{phone}<br/>{address.substring(0,25)}...</td></tr>
                </tbody>
            </table>
        </div>
        <div className="border-bottom" style={{ paddingBottom: 12, marginBottom: 12, flex: 1 }}>
            <table style={{ width: "100%", fontSize: 13 }}>
                <tbody>
                  <tr><td style={{ width: 90, verticalAlign: "top" }}>Recipient :</td><td><b style={{ fontSize: 20 }}>{recipient}</b><br/><br/><b style={{ fontSize: 15 }}>{phone}</b><br/><br/><span style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{address}</span></td></tr>
                </tbody>
            </table>
        </div>
        <div className="flex border-bottom" style={{ paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, borderRight: "1px solid #000" }}>
                <div>CBM :<br/><b style={{ fontSize: 14 }}>{cbm}</b></div>
                <div style={{ marginTop: 12 }}>Weight (kg) :<br/><b style={{ fontSize: 14 }}>{weight}</b></div>
                <div style={{ marginTop: 12 }}>Delivery :<br/><b style={{ fontSize: 14 }}>Normal</b></div>
            </div>
            <div style={{ flex: 1.2, paddingLeft: 12 }}>
                <div>Item Price :<br/><span style={{ fontSize: 14 }}>{money(itemPrice)}</span></div>
                <div style={{ marginTop: 12 }}>Delivery Fees :<br/><span style={{ fontSize: 14 }}>{money(fee)}</span></div>
                <div style={{ marginTop: 12 }}>Prepaid to OS :<br/><span style={{ fontSize: 14 }}>{money(prepaid)}</span></div>
            </div>
            <div style={{ flex: 1.5, paddingLeft: 12, display: "flex", alignItems: "center" }}>
                <div className="f3-cod bg-grey" style={{ width: "100%" }}>
                    <span>COD</span><br/>{money(cod)}
                </div>
            </div>
        </div>
        <div style={{ marginBottom: 20 }}>Remarks : {remark}</div>
        <div className="text-center bold" style={{ fontSize: 12, paddingTop: 12, borderTop: "1px dashed #000", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {WAYBILL_SERVICE_NOTICE}
        </div>
    </div>
  );
}

export default function WaybillStudioPage() {
  const { role } = useAuth() as any;
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [paperSize, setPaperSize] = useState<PaperSize>("4x6");
  const [labelSize, setLabelSize] = useState<LabelSize>("4x6");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const args: any = {};
      if (date) args.p_date = date;

      let res = await supabase.rpc("be_get_waybill_print_queue", args);
      if (res.error) res = await supabase.rpc("be_get_waybill_print_queue");
      if (res.error) throw res.error;

      const next = normalizeRows(res.data);
      setRows(next);
      const picked: Record<string, boolean> = {};
      next.forEach((r) => { picked[waybillNo(r)] = true; });
      setSelected(picked);
    } catch (e: any) {
      setErr(e?.message || "Failed to load waybill print queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      return JSON.stringify(r).toLowerCase().includes(q);
    });
  }, [rows, query]);

  const printable = filtered.filter((r) => selected[waybillNo(r)]);
  const paperSpec = PAPER_SIZES[paperSize];
  const printLayout = PRINT_LAYOUTS[paperSize][labelSize];
  
  const printPages = useMemo(
    () => chunkRows(printable, printLayout.perPage),
    [printable, printLayout.perPage],
  );

  function selectAll() {
    const next = { ...selected };
    filtered.forEach((r) => { next[waybillNo(r)] = true; });
    setSelected(next);
  }

  function clearAll() {
    const next = { ...selected };
    filtered.forEach((r) => { next[waybillNo(r)] = false; });
    setSelected(next);
  }

  async function printNow() {
    setErr("");
    if (printable.length === 0) {
      setErr("Select at least one Waybill before printing.");
      return;
    }

    const alreadyPrinted = printable.filter((r) => Number(r.print_count || 0) > 0 || Number(r.printed_count || 0) > 0 || r.is_printed === true);
    const isSuperAdmin = role === 'superadmin' || role === 'admin' || role === 'management';

    if (alreadyPrinted.length > 0 && !isSuperAdmin) {
      const ids = alreadyPrinted.map((r) => waybillNo(r)).slice(0, 3).join(", ");
      const more = alreadyPrinted.length > 3 ? ` and ${alreadyPrinted.length - 3} more` : "";
      setErr(`SECURITY ALERT: ${alreadyPrinted.length} waybill(s) have already been printed (e.g. ${ids}${more}). Superadmin granting is required for re-printing.`);
      return;
    }

    const root = document.getElementById("waybill-print-area");
    if (!root) {
      setErr("Waybill print area could not be prepared.");
      return;
    }

    try {
      const waybillIds = printable.map(r => waybillNo(r));
      await supabase.rpc("be_mark_waybills_printed", { p_waybill_ids: waybillIds });
    } catch (e) {
      console.warn("Silent failure on marking waybills as printed:", e);
    }

    await waitForPrintAssets(root);
    window.print();
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <style>{`
        /* EXACT CSS TRANSLATION FROM HTML FILE */
        .flex { display: flex; }
        .space-between { justify-content: space-between; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .bold { font-weight: bold; }
        .bg-grey { background-color: #d0d0d0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .border-bottom { border-bottom: 1px solid #000; }
        
        .print-sheet {
            width: ${paperSpec.width};
            height: ${paperSpec.height};
            background: white;
            margin-bottom: 20px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            page-break-after: always;
            display: flex;
            flex-wrap: wrap;
            overflow: hidden;
            box-sizing: border-box;
            color: black;
            font-family: Arial, sans-serif;
        }

        .f1 { width: 50%; height: 50%; padding: 4px; border: 1px solid #000; font-size: 8px; display: flex; flex-direction: column; line-height: 1.2; box-sizing: border-box; }
        .f1-cod { border: 1px solid #000; border-radius: 2px; text-align: right; font-size: 11px; font-weight: bold; padding: 4px; position: relative; width: 75px; }
        .f1-cod span { position: absolute; top: 2px; left: 2px; font-size: 6px; font-weight: normal; }

        .f2 { width: 100%; height: 33.333%; display: flex; border: 1px solid #000; font-size: 9px; line-height: 1.2; box-sizing: border-box; }
        .f2-side { width: 20px; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font-weight: bold; border-right: 1px solid #000; font-size: 10px; padding: 4px 0; }
        .f2-main { flex: 1; display: flex; flex-direction: column; padding: 3px; }
        .f2-cod { border: 1px solid #000; text-align: right; font-size: 14px; font-weight: bold; padding: 4px; margin-top: auto; }

        .f3 { width: 100%; height: 100%; padding: 12px; border: 1px solid #000; font-size: 12px; display: flex; flex-direction: column; box-sizing: border-box; }
        .f3-cod { border: 1px solid #000; border-radius: 4px; text-align: right; font-size: 24px; font-weight: bold; padding: 15px 10px; position: relative; }
        .f3-cod span { position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: normal; }

        .f4 { width: 100%; height: 50%; padding: 8px; border: 1px solid #000; font-size: 10px; display: flex; flex-direction: column; line-height: 1.3; box-sizing: border-box; }
        .f4-cod { border: 1px solid #000; border-radius: 3px; text-align: right; font-size: 18px; font-weight: bold; padding: 10px 5px 5px 5px; position: relative; margin-top: auto; }
        .f4-cod span { position: absolute; top: 2px; left: 4px; font-size: 8px; font-weight: normal; }

        @media print {
          @page {
            size: ${paperSpec.page};
            margin: 0;
          }
          html, body, #root { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
          body * { visibility: hidden !important; }
          #waybill-print-area, #waybill-print-area * { visibility: visible !important; }
          #waybill-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #ffffff !important; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; }
          .print-sheet:last-child { page-break-after: auto !important; }
        }
      `}</style>

      <section className="no-print" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>WAYBILL PRINT STUDIO</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}><Barcode size={24} /> Live Waybill Print Studio</h1>
        <p style={{ color: C.sub, margin: 0 }}>Prints precise fluid layouts scaled purely by CSS percentages, exactly mapped to the provided HTML template.</p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={load} disabled={loading} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>
            <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
          </button>
          
          <button onClick={() => void printNow()} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>
            <Printer size={15} /> Print Selected
          </button>

          <button onClick={selectAll} style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>
            Select All Visible
          </button>
          <button onClick={clearAll} style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>
            Clear
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6, color: C.sub, fontSize: 12, fontWeight: 900 }}>
            PRINT DOCUMENT SIZE
            <select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PaperSize)} style={{ padding: "11px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontWeight: 800 }}>
              {Object.entries(PAPER_SIZES).map(([value, option]) => (<option key={value} value={value}>{option.label}</option>))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, color: C.sub, fontSize: 12, fontWeight: 900 }}>
            PRINTING / LABEL SIZE
            <select value={labelSize} onChange={(event) => setLabelSize(event.target.value as LabelSize)} style={{ padding: "11px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontWeight: 800 }}>
              {Object.entries(LABEL_SIZES).map(([value, option]) => (<option key={value} value={value}>{option.label}</option>))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ position: "relative", minWidth: 280, flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: C.sub }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search waybill..." style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "11px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
        </div>

        {err && <div style={{ marginTop: 12, color: C.red, border: `1px solid ${C.red}`, padding: 10, borderRadius: 8, background: 'rgba(248, 113, 113, 0.1)' }}>{err}</div>}
        <div style={{ marginTop: 12, color: C.sub }}>{printable.length} selected / {filtered.length} visible / {rows.length} loaded</div>
      </section>

      <section className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 16 }}>
        {filtered.map((r) => {
          const wb = waybillNo(r);
          return (
            <label key={wb} style={{ background: C.panel, border: `1px solid ${selected[wb] ? C.gold : C.border}`, borderRadius: 14, padding: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={!!selected[wb]} onChange={(e) => setSelected((x) => ({ ...x, [wb]: e.target.checked }))} style={{ marginRight: 8 }} />
              <b style={{ color: C.gold }}>{wb}</b>
              <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>{first(r, ["merchant_name", "merchant"], "-")} → {first(r, ["recipient_name", "receiver"], "-")}</div>
            </label>
          );
        })}
      </section>

      {/* RENDER ENGINE */}
      <section id="waybill-print-area" data-paper-size={paperSize} data-label-size={labelSize} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {printPages.map((pageRows, pageIndex) => (
          <div key={`page-${pageIndex}`} className="print-sheet">
            {pageRows.map((row) => (
              <WaybillLabel key={waybillNo(row)} row={row} labelSize={labelSize} />
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}