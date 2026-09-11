import React, { useMemo, useState } from "react";
import { authorizePrintV33, tableV33 } from "@/lib/britiumCompleteWireupApiV33";

type DocType = "WAYBILL" | "INVOICE" | "DOCUMENT";
type Paper = "4x6" | "A5" | "A4";
type Label = "4x6" | "4x3" | "4x2" | "A5" | "A4";

type PrintRow = {
  waybill_no?: string;
  invoice_no?: string;
  document_no?: string;
  merchant_name?: string;
  recipient_name?: string;
  recipient_phone?: string;
  township?: string;
  recipient_address?: string;
  delivery_fee?: number;
  cod_amount?: number;
  actual_collect?: number;
};

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "blue" | "green" | "dark" }) {
  const tone = props.tone || "gold";
  const cls =
    tone === "blue" ? "bg-sky-500 text-white" :
    tone === "green" ? "bg-emerald-400 text-slate-950" :
    tone === "dark" ? "bg-slate-950 text-white border border-sky-900" :
    "bg-amber-400 text-slate-950";
  return <button {...props} className={`rounded-xl px-4 py-2 text-sm font-black ${cls} ${props.className || ""}`} />;
}

function money(v: any) {
  return Number(v || 0).toLocaleString("en-US");
}

function docNo(row: PrintRow, type: DocType) {
  if (type === "INVOICE") return row.invoice_no || row.waybill_no || "INV-UAT";
  if (type === "DOCUMENT") return row.document_no || row.waybill_no || "DOC-UAT";
  return row.waybill_no || "WB-UAT";
}

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}`;
}

function WaybillLabel({ row, type, scale = 1 }: { row: PrintRow; type: DocType; scale?: number }) {
  const no = docNo(row, type);
  return (
    <div className="be-label" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div className="be-label-top">
        <div className="be-brand">
          <img src="/logo.png" onError={(e) => ((e.currentTarget.style.display = "none"))} />
          <div>
            <b>BRITIUM EXPRESS</b>
            <span>{type === "WAYBILL" ? "DELIVERY SERVICE" : type === "INVOICE" ? "INVOICE" : "DOCUMENT"}</span>
            <small>Hotline: <b>09897447744</b></small>
          </div>
        </div>
        <div className="be-qr"><b>{no}</b><img src={qrUrl(no)} /></div>
      </div>
      <div className="be-line"><b>Merchant :</b><span>{row.merchant_name || "-"}</span></div>
      <div className="be-recipient">
        <b>Recipient :</b>
        <span>{row.recipient_name || "-"} &nbsp; {row.township || ""}</span>
        <small>{row.recipient_phone || ""}</small>
        <small>{row.recipient_address || ""}</small>
      </div>
      <div className="be-remarks"><b>Remarks :</b></div>
      <div className="be-bottom">
        <div>
          <p>Item Price : {money((row as any).item_price)}</p>
          <p>Delivery Fees : {money(row.delivery_fee)}</p>
          <p>Prepaid Amount : 0</p>
        </div>
        <div className="be-cod"><span>COD</span><span>MMK</span><strong>{money(row.cod_amount || row.actual_collect)}</strong></div>
      </div>
      <div className="be-footer">ဘောင်ချာပါငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ဆက်သွယ်တိုင်ကြားနိုင်ပါသည်။ Hotline 09897447744</div>
    </div>
  );
}

export default function BritiumUnifiedPrintStudioV33() {
  const [docType, setDocType] = useState<DocType>("WAYBILL");
  const [paper, setPaper] = useState<Paper>("4x6");
  const [label, setLabel] = useState<Label>("4x6");
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("Unified print studio ready.");

  const perSheet = useMemo(() => {
    if (paper === "4x6" && label === "4x3") return 2;
    if (paper === "4x6" && label === "4x2") return 3;
    if (paper === "A4" && label === "4x6") return 4;
    if (paper === "A5" && label === "4x6") return 2;
    return 1;
  }, [paper, label]);

  async function loadRows() {
    try {
      const data = await tableV33("be_v32_parcels", 500);
      setRows(data);
      setSelected(data.map((r: any) => docNo(r, docType)));
      setMessage(`${data.length} print row(s) loaded.`);
    } catch {
      const fallback: PrintRow[] = [
        { waybill_no: "WB-UAT-001", merchant_name: "UAT Merchant", recipient_name: "UAT Recipient", township: "Yangon", delivery_fee: 4000, cod_amount: 42000 },
      ];
      setRows(fallback);
      setSelected(fallback.map((r) => docNo(r, docType)));
      setMessage("Using fallback UAT row because parcel view is not available.");
    }
  }

  async function guardedPrint(targetRows: PrintRow[]) {
    const allowed: PrintRow[] = [];
    const blocked: string[] = [];
    const needReason: PrintRow[] = [];

    for (const row of targetRows) {
      const documentNo = docNo(row, docType);
      const result = await authorizePrintV33({ documentType: docType, documentNo, paperSize: paper, labelSize: label });
      if (result?.allowed) allowed.push(row);
      else if (result?.reason_required) needReason.push(row);
      else blocked.push(`${documentNo}: ${result?.message || "blocked"}`);
    }

    if (needReason.length) {
      const reason = window.prompt(`${needReason.length} ${docType}(s) already printed once. Enter reprint reason for superadmin approval:`, "");
      if (reason?.trim()) {
        for (const row of needReason) {
          const documentNo = docNo(row, docType);
          const result = await authorizePrintV33({ documentType: docType, documentNo, reason: reason.trim(), paperSize: paper, labelSize: label });
          blocked.push(`${documentNo}: ${result?.message || "reprint approval requested"}`);
        }
      } else {
        needReason.forEach((row) => blocked.push(`${docNo(row, docType)}: reprint cancelled`));
      }
    }

    if (allowed.length) printRows(allowed);
    if (blocked.length) alert(["Print control:", "", ...blocked].join("\n"));
  }

  function printRows(targetRows: PrintRow[]) {
    const html = buildPrintHtml(targetRows);
    const win = window.open("", "_blank", "width=980,height=720");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  function buildPrintHtml(targetRows: PrintRow[]) {
    const chunks: PrintRow[][] = [];
    for (let i = 0; i < targetRows.length; i += perSheet) chunks.push(targetRows.slice(i, i + perSheet));

    const pageClass = `paper-${paper} label-${label}`;
    const body = chunks.map((chunk) => `<section class="sheet ${pageClass}">${chunk.map((r) => `<div class="slot">${renderStaticLabel(r)}</div>`).join("")}</section>`).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>Britium ${docType} Print</title><style>${printCss()}</style></head><body>${body}</body></html>`;
  }

  function renderStaticLabel(row: PrintRow) {
    const no = docNo(row, docType);
    return `<div class="be-label">
      <div class="be-label-top">
        <div class="be-brand"><img src="/logo.png" /><div><b>BRITIUM EXPRESS</b><span>${docType === "WAYBILL" ? "DELIVERY SERVICE" : docType}</span><small>Hotline: <b>09897447744</b></small></div></div>
        <div class="be-qr"><b>${no}</b><img src="${qrUrl(no)}" /></div>
      </div>
      <div class="be-line"><b>Merchant :</b><span>${row.merchant_name || "-"}</span></div>
      <div class="be-recipient"><b>Recipient :</b><span>${row.recipient_name || "-"} ${row.township || ""}</span><small>${row.recipient_phone || ""}</small><small>${row.recipient_address || ""}</small></div>
      <div class="be-remarks"><b>Remarks :</b></div>
      <div class="be-bottom"><div><p>Item Price : ${money((row as any).item_price)}</p><p>Delivery Fees : ${money(row.delivery_fee)}</p><p>Prepaid Amount : 0</p></div><div class="be-cod"><span>COD</span><span>MMK</span><strong>${money(row.cod_amount || row.actual_collect)}</strong></div></div>
      <div class="be-footer">ဘောင်ချာပါငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ဆက်သွယ်တိုင်ကြားနိုင်ပါသည်။ Hotline 09897447744</div>
    </div>`;
  }

  function printCss() {
    return `
      @page { margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; background: white; font-family: Arial, sans-serif; }
      .sheet { page-break-after: always; overflow: hidden; display: grid; background: white; }
      .paper-4x6 { width: 4in; height: 6in; }
      .paper-A5 { width: 148mm; height: 210mm; padding: 5mm; gap: 4mm; }
      .paper-A4 { width: 210mm; height: 297mm; padding: 8mm; gap: 5mm; }
      .paper-4x6.label-4x6 { grid-template-rows: 1fr; }
      .paper-4x6.label-4x3 { grid-template-rows: 1fr 1fr; }
      .paper-4x6.label-4x2 { grid-template-rows: 1fr 1fr 1fr; }
      .paper-A5 { grid-template-columns: 1fr; }
      .paper-A4 { grid-template-columns: 1fr 1fr; }
      .slot { overflow: hidden; border: .4mm solid #111; display: flex; align-items: stretch; justify-content: stretch; }
      .be-label { width: 100%; height: 100%; border: 0; font-size: 10px; overflow: hidden; display: flex; flex-direction: column; color: #111; }
      .be-label-top { height: 28%; display: flex; border-bottom: .3mm solid #999; }
      .be-brand { flex: 1; display: flex; gap: 6px; align-items: flex-start; padding: 5px; }
      .be-brand img { width: 34px; height: 34px; object-fit: contain; }
      .be-brand b { display: block; font-size: 13px; }
      .be-brand span { display: block; font-weight: 700; font-size: 11px; }
      .be-brand small { display: block; font-size: 9px; }
      .be-qr { width: 30%; text-align: center; padding: 4px; }
      .be-qr b { display: block; font-size: 11px; line-height: 1.1; word-break: break-word; }
      .be-qr img { width: 70%; max-height: 70%; object-fit: contain; }
      .be-line { height: 8%; border-bottom: .3mm solid #bbb; display: flex; align-items: center; gap: 4px; padding: 0 6px; }
      .be-recipient { height: 31%; border-bottom: .3mm solid #bbb; padding: 6px; }
      .be-recipient b { margin-right: 6px; }
      .be-recipient small { display: block; margin-top: 6px; font-size: 10px; }
      .be-remarks { height: 8%; border-bottom: .3mm solid #bbb; display: flex; align-items: center; padding: 0 6px; }
      .be-bottom { height: 18%; display: flex; border-bottom: .3mm solid #999; }
      .be-bottom > div:first-child { flex: 1; padding: 4px 12px; }
      .be-bottom p { margin: 0 0 3px; }
      .be-cod { width: 36%; margin: 5px; border: .4mm solid #999; border-radius: 10px; padding: 5px; display: grid; grid-template-columns: 1fr 1fr; }
      .be-cod strong { grid-column: span 2; font-size: 16px; text-align: center; }
      .be-footer { height: 7%; padding: 2px 6px; font-weight: 800; font-size: 9px; line-height: 1.1; overflow: hidden; }
      .paper-4x6.label-4x2 .be-label { font-size: 7px; }
      .paper-4x6.label-4x2 .be-brand img { width: 22px; height: 22px; }
      .paper-4x6.label-4x2 .be-brand b { font-size: 9px; }
      .paper-4x6.label-4x2 .be-brand span { font-size: 8px; }
      .paper-4x6.label-4x2 .be-qr b { font-size: 8px; }
      .paper-4x6.label-4x2 .be-cod strong { font-size: 11px; }
      .paper-4x6.label-4x2 .be-footer { font-size: 7px; }
      .paper-4x6.label-4x3 .be-label { font-size: 8px; }
      .paper-4x6.label-4x3 .be-brand img { width: 26px; height: 26px; }
      .paper-4x6.label-4x3 .be-brand b { font-size: 10px; }
      .paper-4x6.label-4x3 .be-cod strong { font-size: 13px; }
      .paper-4x6.label-4x3 .be-footer { font-size: 8px; }
    `;
  }

  const visibleRows = rows.length ? rows : [{ waybill_no: "WB-UAT-001", merchant_name: "UAT Merchant", recipient_name: "UAT Recipient", township: "Yangon", delivery_fee: 4000, cod_amount: 42000 }];
  const selectedRows = visibleRows.filter((r) => selected.includes(docNo(r, docType)));

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">PRINT AND DOCUMENT STUDIO</p>
          <h1 className="mt-2 text-2xl font-black">Unified Waybill / Invoice / Document Print Studio v33</h1>
          <p className="mt-1 text-sm text-sky-200">Unified format, neat labels, Select All / Print All, one-time print control and superadmin reprint approval.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} className="rounded-xl bg-slate-950 px-3 py-2 text-white"><option>WAYBILL</option><option>INVOICE</option><option>DOCUMENT</option></select>
            <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} className="rounded-xl bg-slate-950 px-3 py-2 text-white"><option value="4x6">4in x 6in Sheet</option><option value="A5">A5 Sheet</option><option value="A4">A4 Sheet</option></select>
            <select value={label} onChange={(e) => setLabel(e.target.value as Label)} className="rounded-xl bg-slate-950 px-3 py-2 text-white"><option value="4x6">4in x 6in</option><option value="4x3">4in x 3in</option><option value="4x2">4in x 2in</option><option value="A5">A5</option><option value="A4">A4</option></select>
            <Button tone="blue" onClick={loadRows}>Refresh</Button>
            <Button tone="green" onClick={() => setSelected(visibleRows.map((r) => docNo(r, docType)))}>Select All</Button>
            <Button tone="dark" onClick={() => setSelected([])}>Clear</Button>
            <Button tone="gold" onClick={() => void guardedPrint(selectedRows.length ? selectedRows : visibleRows.slice(0, 1))}>Print Selected</Button>
            <Button tone="gold" onClick={() => void guardedPrint(visibleRows)}>Print All</Button>
          </div>
          <p className="mt-3 text-sm text-amber-300">{message} Per sheet: {perSheet}. Selected: {selected.length}.</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <aside className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
            <h2 className="mb-3 font-black text-amber-300">Print Rows</h2>
            <div className="max-h-[70vh] space-y-2 overflow-auto">
              {visibleRows.map((r) => {
                const no = docNo(r, docType);
                return (
                  <label key={no} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-sky-900 bg-slate-950 p-3">
                    <input type="checkbox" checked={selected.includes(no)} onChange={(e) => setSelected((cur) => e.target.checked ? [...new Set([...cur, no])] : cur.filter((x) => x !== no))} />
                    <span><b className="text-amber-300">{no}</b><br /><small>{r.recipient_name || "-"} · {r.township || "-"}</small></span>
                  </label>
                );
              })}
            </div>
          </aside>

          <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
            <h2 className="mb-3 font-black text-amber-300">Live Preview</h2>
            <div className="overflow-auto rounded-2xl bg-slate-950 p-6">
              <div className="mx-auto bg-white text-black" style={{ width: paper === "4x6" ? "4in" : paper === "A5" ? "148mm" : "210mm", minHeight: paper === "4x6" ? "6in" : paper === "A5" ? "210mm" : "297mm", display: "grid", gridTemplateRows: paper === "4x6" && label === "4x2" ? "1fr 1fr 1fr" : paper === "4x6" && label === "4x3" ? "1fr 1fr" : "1fr", gap: "0", overflow: "hidden" }}>
                {visibleRows.slice(0, perSheet).map((r, ix) => <div key={ix} className="border border-black overflow-hidden"><WaybillLabel row={r} type={docType} /></div>)}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
