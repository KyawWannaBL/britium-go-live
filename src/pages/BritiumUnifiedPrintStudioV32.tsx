import React, { useEffect, useMemo, useState } from "react";
import { beV32AuthorizePrint, beV32List } from "@/lib/britiumCompleteWireupApiV32";

type DocType = "WAYBILL" | "INVOICE" | "DOCUMENT";
type Row = Record<string, any>;

const PAPER = {
  SHEET_4X6: { label: "4in x 6in", w: 104, h: 156 },
  A5: { label: "A5", w: 148, h: 210 },
  A4: { label: "A4", w: 210, h: 297 },
};

const LABEL = {
  FULL_4X6: { label: "4in x 6in", w: 104, h: 156 },
  HALF_4X3: { label: "4in x 3in", w: 104, h: 78 },
  THIRD_4X2: { label: "4in x 2in", w: 104, h: 52 },
};

function modeFromRoute(): DocType {
  const h = window.location.hash.toLowerCase();
  if (h.includes("invoice")) return "INVOICE";
  if (h.includes("document")) return "DOCUMENT";
  return "WAYBILL";
}

function text(...v: any[]) {
  for (const x of v) {
    const s = String(x ?? "").trim();
    if (s && s !== "-" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined") return s;
  }
  return "";
}

function money(v: any) { return Number(v || 0).toLocaleString("en-US"); }

export default function BritiumUnifiedPrintStudioV32() {
  const [docType, setDocType] = useState<DocType>(modeFromRoute());
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [paperKey, setPaperKey] = useState<keyof typeof PAPER>("SHEET_4X6");
  const [labelKey, setLabelKey] = useState<keyof typeof LABEL>("FULL_4X6");
  const [message, setMessage] = useState("Ready.");

  async function load() {
    const data = await beV32List("be_v32_parcels", 500).catch(() => []);
    setRows(data);
    const first: Record<string, boolean> = {};
    data.slice(0, 1).forEach((r: any) => { first[text(r.waybill_no)] = true; });
    setSelected(first);
  }

  useEffect(() => { void load(); }, []);

  const layout = useMemo(() => {
    const p = PAPER[paperKey];
    const l = LABEL[labelKey];
    return { p, l, cols: Math.max(1, Math.floor(p.w / l.w)), rows: Math.max(1, Math.floor(p.h / l.h)), per: Math.max(1, Math.floor(p.w / l.w) * Math.floor(p.h / l.h)) };
  }, [paperKey, labelKey]);

  const selectedRows = rows.filter((r) => selected[text(r.waybill_no)]);
  const previewRows = (selectedRows.length ? selectedRows : rows).slice(0, layout.per);

  function idOf(row: Row) {
    if (docType === "INVOICE") return text(row.invoice_no, row.waybill_no);
    if (docType === "DOCUMENT") return text(row.document_no, row.waybill_no);
    return text(row.waybill_no);
  }

  async function authorizeRows(input: Row[]) {
    const allowed: Row[] = [];
    const blocked: string[] = [];
    const needReason: Row[] = [];
    for (const row of input) {
      const id = idOf(row);
      const res = await beV32AuthorizePrint(docType, id, "", { paperSize: paperKey, labelSize: labelKey });
      if (res?.allowed) allowed.push(row);
      else if (res?.reason_required) needReason.push(row);
      else blocked.push(`${id}: ${res?.message || "Blocked"}`);
    }
    if (needReason.length) {
      const reason = window.prompt(`${needReason.length} ${docType} document(s) already printed. Enter reprint reason for Superadmin approval:`, "");
      if (reason?.trim()) {
        for (const row of needReason) {
          const id = idOf(row);
          const res = await beV32AuthorizePrint(docType, id, reason.trim(), { paperSize: paperKey, labelSize: labelKey });
          blocked.push(`${id}: ${res?.message || "Reprint approval requested"}`);
        }
      }
    }
    if (blocked.length) alert(["Print control", "", ...blocked].join("\n"));
    return allowed;
  }

  async function printRows(input: Row[]) {
    const allowed = await authorizeRows(input);
    if (!allowed.length) {
      setMessage("No documents were authorized to print.");
      return;
    }
    const html = chunk(allowed, layout.per).map((group) => `<section class="sheet" style="width:${layout.p.w}mm;height:${layout.p.h}mm;grid-template-columns:repeat(${layout.cols},${layout.l.w}mm);grid-auto-rows:${layout.l.h}mm;">${group.map((r) => labelHtml(r, docType, layout.l.w, layout.l.h)).join("")}</section>`).join("");
    const css = document.getElementById("be-v32-print-css")?.innerHTML || "";
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<html><head><title>Britium ${docType} Print</title><style>${css}</style><style>@page{size:${layout.p.w}mm ${layout.p.h}mm;margin:0}body{margin:0;background:white}.sheet{display:grid;page-break-after:always;break-after:page;overflow:hidden;background:white}</style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 250);
    setMessage(`${allowed.length} ${docType} document(s) sent to print.`);
  }

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100">
      <style id="be-v32-print-css">{`
        .label{position:relative;overflow:hidden;background:#fff;color:#111;border:1px solid #aaa;font-family:Arial,sans-serif}
        .doc{position:absolute;left:50%;top:50%;width:104mm;height:156mm;transform-origin:center center}
        .doc.full{transform:translate(-50%,-50%) scale(1)}
        .doc.small{transform:translate(-50%,-50%) rotate(-90deg) scale(.50)}
        .head{height:28mm;display:flex;justify-content:space-between;border-bottom:1px solid #999;padding:3mm}
        .logo{width:16mm;height:16mm;border-radius:50%;object-fit:contain}
        .brand{font-weight:900;font-size:12pt}.sub{font-weight:800;font-size:9pt}.hot{color:#d00000;font-weight:900}
        .qr{width:23mm;height:23mm}.row{border-bottom:1px solid #999;padding:4mm 3mm;font-size:9pt}.body{height:58mm;border-bottom:1px solid #999;padding:4mm 3mm;font-size:10pt;text-align:center}
        .money{height:31mm;border-bottom:1px solid #999;display:flex;justify-content:space-between;padding:3mm 5mm;font-size:9pt}.cod{border:1px solid #777;border-radius:5mm;background:#eee;padding:3mm;width:38mm}.foot{padding:2mm 3mm;font-size:8pt;font-weight:800}
      `}</style>
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">BRITIUM PRINT STUDIO</p>
          <h1 className="mt-2 text-2xl font-black">Unified Waybill / Invoice / Document Print Studio v32</h1>
          <p className="text-sm text-sky-200">Neat fixed template, paper/label selection, select all, print all, and one-time print control.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["WAYBILL","INVOICE","DOCUMENT"] as DocType[]).map((x) => <button key={x} onClick={() => setDocType(x)} className={`rounded-xl px-4 py-2 font-black ${docType === x ? "bg-amber-400 text-slate-950" : "bg-slate-950 text-white"}`}>{x}</button>)}
            <button onClick={load} className="rounded-xl bg-slate-950 px-4 py-2 font-black">Refresh</button>
            <button onClick={() => setSelected(Object.fromEntries(rows.map((r) => [text(r.waybill_no), true])))} className="rounded-xl bg-sky-500 px-4 py-2 font-black text-white">Select All</button>
            <button onClick={() => printRows(selectedRows)} className="rounded-xl bg-amber-400 px-4 py-2 font-black text-slate-950">Print Selected</button>
            <button onClick={() => printRows(rows)} className="rounded-xl bg-amber-400 px-4 py-2 font-black text-slate-950">Print All</button>
          </div>
          <p className="mt-2 text-sm text-amber-300">{message}</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <aside className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
            <h2 className="mb-2 font-black text-amber-300">Paper Size</h2>
            {(Object.keys(PAPER) as Array<keyof typeof PAPER>).map((k) => <button key={k} onClick={() => setPaperKey(k)} className={`mb-2 block w-full rounded-xl border px-3 py-3 text-left font-black ${paperKey === k ? "border-amber-400 text-amber-300" : "border-sky-900 bg-slate-950"}`}>{PAPER[k].label}</button>)}
            <h2 className="mb-2 mt-4 font-black text-amber-300">Label Size</h2>
            {(Object.keys(LABEL) as Array<keyof typeof LABEL>).map((k) => <button key={k} onClick={() => setLabelKey(k)} className={`mb-2 block w-full rounded-xl border px-3 py-3 text-left font-black ${labelKey === k ? "border-amber-400 text-amber-300" : "border-sky-900 bg-slate-950"}`}>{LABEL[k].label}</button>)}
            <div className="mt-4 max-h-[45vh] overflow-auto space-y-2">{rows.map((r) => <button key={text(r.waybill_no)} onClick={() => setSelected((s) => ({ ...s, [text(r.waybill_no)]: !s[text(r.waybill_no)] }))} className="block w-full rounded-xl border border-sky-900 bg-slate-950 p-3 text-left text-sm"><span className="font-black text-amber-300">{selected[text(r.waybill_no)] ? "☑ " : "☐ "}{text(r.waybill_no)}</span><br />{text(r.recipient_name)} · {text(r.township)}</button>)}</div>
          </aside>
          <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
            <h2 className="mb-2 font-black">Live Preview: {layout.per} per {layout.p.label}</h2>
            <div className="overflow-auto rounded-2xl bg-[#062033] p-8">
              <div className="grid bg-white shadow-2xl" style={{ width: `${layout.p.w}mm`, minHeight: `${layout.p.h}mm`, gridTemplateColumns: `repeat(${layout.cols}, ${layout.l.w}mm)`, gridAutoRows: `${layout.l.h}mm` }}>
                {previewRows.map((r) => <div key={idOf(r)} dangerouslySetInnerHTML={{ __html: labelHtml(r, docType, layout.l.w, layout.l.h) }} />)}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function chunk<T>(rows: T[], size: number) { const out: T[][] = []; for (let i=0;i<rows.length;i+=size) out.push(rows.slice(i,i+size)); return out; }

function labelHtml(row: Row, type: DocType, w: number, h: number) {
  const small = h < 100;
  const no = type === "INVOICE" ? text(row.invoice_no, row.waybill_no) : type === "DOCUMENT" ? text(row.document_no, row.waybill_no) : text(row.waybill_no);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(no)}`;
  return `<div class="label" style="width:${w}mm;height:${h}mm"><div class="doc ${small ? "small" : "full"}"><div class="head"><div style="display:flex;gap:3mm"><img class="logo" src="/logo.png"/><div><div class="brand">BRITIUM EXPRESS</div><div class="sub">${type} SERVICE</div><div>HotLine:</div><div class="hot">09897447744</div></div></div><div style="text-align:center"><b>${no}</b><br/><img class="qr" src="${qr}"/><br/><b>${no}</b></div></div><div class="row"><b>Merchant :</b> ${text(row.merchant_name,row.merchant_code)}</div><div class="body"><b>Recipient :</b> ${text(row.recipient_name)} &nbsp; ${text(row.township)}<br/><br/>${text(row.recipient_phone,row.customer_phone)}<br/><br/>${text(row.recipient_address)}</div><div class="row"><b>Remarks :</b> ${text(row.remark,row.remarks)}</div><div class="money"><div>Item Price : ${money(row.item_price)}<br/>Delivery Fees : ${money(row.delivery_fee)}<br/>Prepaid Amount : 0</div><div class="cod"><b>COD &nbsp;&nbsp; MMK</b><br/><br/>${money(row.cod_amount || row.cod || row.actual_collect)}</div></div><div class="foot">ဘောင်ချာပါငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ဆက်သွယ်တိုင်ကြားနိုင်ပါသည်။<br/>Hotline: 09897447744</div></div></div>`;
}
