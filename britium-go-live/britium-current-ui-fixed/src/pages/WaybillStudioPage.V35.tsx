import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authorizePrintV33, tableV33 } from "@/lib/britiumCompleteWireupApiV33";

type DocType = "WAYBILL" | "INVOICE" | "DOCUMENT";
type Paper = "4x6" | "A5" | "A4";
type Label = "4x6" | "4x3" | "4x2" | "2x3" | "2x1.5";

type PrintRow = Record<string, any> & {
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

type Layout = {
  columns: number;
  rows: number;
  perSheet: number;
  labelWidth: string;
  labelHeight: string;
  description: string;
};

type WaybillContext = {
  pickupId?: string;
  pickup_id?: string;
  waybillNo?: string;
  waybill_no?: string;
  waybillId?: string;
  waybill_id?: string;
  parcelCount?: number;
  parcel_count?: number;
};

const WAYBILL_CONTEXT_STORAGE_KEY = "britium:last-created-waybill";
const WAYBILL_STUDIO_BUILD = "WAYBILL_STUDIO_V38_BATCH_AUTH_OS_TOWNSHIP_REMARKS_2026-07-30";
const PRINT_AUTH_CONCURRENCY = 8;
const PRINT_IMAGE_WAIT_MS = 20000;

function navigationContext(): WaybillContext {
  const result: WaybillContext = {};

  try {
    const queryText = window.location.hash.includes("?") ? window.location.hash.split("?").slice(1).join("?") : window.location.search.slice(1);
    const params = new URLSearchParams(queryText);
    result.pickupId = params.get("pickup_id") || undefined;
    result.waybillNo = params.get("waybill_no") || undefined;
    result.waybillId = params.get("waybill_id") || undefined;
  } catch {
    // Browser navigation context is optional.
  }

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(WAYBILL_CONTEXT_STORAGE_KEY);
      if (!raw) continue;
      const saved = JSON.parse(raw) as WaybillContext;
      result.pickupId ||= saved.pickupId || saved.pickup_id;
      result.waybillNo ||= saved.waybillNo || saved.waybill_no;
      result.waybillId ||= saved.waybillId || saved.waybill_id;
      result.parcelCount ||= saved.parcelCount || saved.parcel_count;
    } catch {
      // Ignore malformed or unavailable storage.
    }
  }

  return result;
}

function rowMatchesSearch(row: PrintRow, query: string) {
  if (!query) return true;
  const haystack = [
    row.delivery_way_id,
    row.tracking_no,
    row.tracking_code,
    row.waybill_no,
    row.batch_waybill_no,
    row.pickup_id,
    row.merchant_name,
    row.os,
    row.recipient_name,
    row.recipient_phone,
    row.contact_no_1,
    row.recipient_address,
    row.delivery_address,
    row.township,
    row.destination,
    row.remark,
    row.remarks,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" | ");

  return query.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
}

const PAPER_LABELS: Record<Paper, string> = {
  "4x6": "4in × 6in thermal sheet",
  A5: "A5 paper",
  A4: "A4 paper",
};

const LABEL_LABELS: Record<Label, string> = {
  "4x6": "4in × 6in — 1 full waybill",
  "4x3": "4in × 3in — 2 stacked waybills",
  "4x2": "4in × 2in — 3 stacked waybills",
  "2x3": "2in × 3in — 4 waybills (2 × 2)",
  "2x1.5": "2in × 1.5in micro — true 8-up thermal size",
};

function layoutFor(paper: Paper, label: Label): Layout {
  const layouts: Record<Paper, Record<Label, Layout>> = {
    "4x6": {
      "4x6": { columns: 1, rows: 1, perSheet: 1, labelWidth: "4in", labelHeight: "6in", description: "One full-size waybill per thermal sheet." },
      "4x3": { columns: 1, rows: 2, perSheet: 2, labelWidth: "4in", labelHeight: "3in", description: "Two 4 × 3 waybills stacked on one 4 × 6 sheet." },
      "4x2": { columns: 1, rows: 3, perSheet: 3, labelWidth: "4in", labelHeight: "2in", description: "Three 4 × 2 waybills stacked on one 4 × 6 sheet." },
      "2x3": { columns: 2, rows: 2, perSheet: 4, labelWidth: "2in", labelHeight: "3in", description: "Four 2 × 3 waybills in a 2 × 2 grid on one 4 × 6 sheet." },
      "2x1.5": { columns: 2, rows: 4, perSheet: 8, labelWidth: "2in", labelHeight: "1.5in", description: "Eight true 2 × 1.5 micro labels on one thermal sheet." },
    },
    A5: {
      "4x6": { columns: 1, rows: 1, perSheet: 1, labelWidth: "4in", labelHeight: "6in", description: "One centered full-size waybill on A5." },
      "4x3": { columns: 1, rows: 2, perSheet: 2, labelWidth: "4in", labelHeight: "3in", description: "Two centered 4 × 3 labels on A5." },
      "4x2": { columns: 1, rows: 4, perSheet: 4, labelWidth: "4in", labelHeight: "2in", description: "Four centered 4 × 2 labels on A5." },
      "2x3": { columns: 2, rows: 2, perSheet: 4, labelWidth: "2in", labelHeight: "3in", description: "Four compact reference labels centered on A5." },
      "2x1.5": { columns: 2, rows: 5, perSheet: 10, labelWidth: "2in", labelHeight: "1.5in", description: "Ten true 2 × 1.5 micro labels centered on A5." },
    },
    A4: {
      "4x6": { columns: 2, rows: 1, perSheet: 2, labelWidth: "4in", labelHeight: "6in", description: "Two full-size waybills centered on A4." },
      "4x3": { columns: 2, rows: 3, perSheet: 6, labelWidth: "4in", labelHeight: "3in", description: "Six 4 × 3 labels arranged 2 × 3 on A4." },
      "4x2": { columns: 2, rows: 5, perSheet: 10, labelWidth: "4in", labelHeight: "2in", description: "Ten 4 × 2 labels arranged 2 × 5 on A4." },
      "2x3": { columns: 4, rows: 3, perSheet: 12, labelWidth: "2in", labelHeight: "3in", description: "Twelve compact reference labels arranged 4 × 3 on A4." },
      "2x1.5": { columns: 4, rows: 7, perSheet: 28, labelWidth: "2in", labelHeight: "1.5in", description: "Twenty-eight true 2 × 1.5 micro labels arranged 4 × 7 on A4." },
    },
  };

  return layouts[paper][label];
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "blue" | "green" | "dark" }) {
  const tone = props.tone || "gold";
  const cls =
    tone === "blue"
      ? "bg-sky-500 text-white hover:bg-sky-400"
      : tone === "green"
        ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
        : tone === "dark"
          ? "border border-sky-900 bg-slate-950 text-white hover:border-sky-600"
          : "bg-amber-400 text-slate-950 hover:bg-amber-300";

  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${props.className || ""}`}
    />
  );
}

function first(row: PrintRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function text(row: PrintRow, ...keys: string[]) {
  return String(first(row, ...keys) || "").trim();
}

function amount(row: PrintRow, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US");
}

function docNo(row: PrintRow, type: DocType) {
  if (type === "INVOICE") return text(row, "invoice_no", "invoiceNo", "delivery_way_id", "tracking_no", "waybill_no") || "INV-UAT";
  if (type === "DOCUMENT") return text(row, "document_no", "documentNo", "delivery_way_id", "tracking_no", "waybill_no") || "DOC-UAT";
  return text(row, "delivery_way_id", "tracking_no", "tracking_code", "way_id", "waybill_no", "waybillNo") || "WB-UAT";
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(value)}`;
}

function barcodeUrl(value: string) {
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value)}&scale=2&height=10&includetext=false&backgroundcolor=FFFFFF`;
}

function normalized(row: PrintRow, type: DocType) {
  const itemPrice = amount(row, "item_price", "itemPrice", "declared_value", "product_value");
  const deliveryFee = amount(row, "delivery_fee", "delivery_charges", "deliveryFee", "printed_waybill_delivery_charge", "deli_fee");
  const surcharge = amount(row, "surcharge", "extra_weight_charge", "overweight_charge", "extra_charge");
  const prepaid = amount(row, "prepaid", "prepaid_amount", "prepaid_to_os");
  const explicitCod = amount(row, "actual_collect", "collect_amount", "cod_amount", "total_cod", "waybill_total_cod");
  const cod = explicitCod || Math.max(0, itemPrice + deliveryFee + surcharge - prepaid);

  return {
    no: docNo(row, type),
    merchant: text(row, "os", "sender_name", "merchant_name", "merchantName", "merchant_id", "customer_id", "merchant_code") || "OS not provided",
    merchantPhone: text(row, "merchant_phone", "merchantPhone", "sender_phone", "customer_phone"),
    merchantAddress: text(row, "merchant_address", "sender_address", "pickup_address"),
    recipient: text(row, "recipient_name", "receiver_name", "recipientName") || "Recipient",
    recipientPhone: text(row, "recipient_phone", "receiver_phone", "contact_no_1", "phone"),
    recipientAddress: text(row, "recipient_address", "receiver_address", "delivery_address", "address"),
    township: text(row, "recipient_township", "township", "delivery_township", "receiver_township"),
    remarks: text(row, "remarks", "remark", "data_entry_remark", "special_instruction", "special_instructions", "instructions", "notes"),
    region: text(row, "region", "city", "destination", "destination_city", "sidebar"),
    service: text(row, "service_type", "delivery_type", "service_tier") || "Normal",
    cbm: text(row, "cbm", "volume_cbm") || "1",
    weight: text(row, "weight_kg", "weight", "actual_weight") || "-",
    createdAt: text(row, "created_at", "saved_at", "printed_at") || new Date().toLocaleString(),
    itemPrice,
    deliveryFee,
    surcharge,
    prepaid,
    cod,
  };
}

function brandMark() {
  return `<img class="be-logo" src="/logo.png?v=waybill-v3" alt="Britium Express logo">`;
}

function render4x3(row: PrintRow, type: DocType) {
  const d = normalized(row, type);
  return `<article class="be-label be-4x3">
    <header class="w43-head">
      <div class="w43-brand">${brandMark()}<div><strong>BRITIUM EXPRESS</strong><small>Hotline: 09-897447744</small></div></div>
      <div class="w43-code"><img class="barcode" src="${barcodeUrl(d.no)}" alt="Barcode"><b>${esc(d.no)}</b></div>
      <img class="qr" src="${qrUrl(d.no)}" alt="QR code">
    </header>
    <div class="w43-body">
      <section class="w43-person">
        <p><b>Merchant:</b> ${esc(d.merchant)}</p>
        <p class="phone">${esc(d.merchantPhone)}</p>
        <p class="recipient"><b>Recipient:</b> <strong>${esc(d.recipient)}</strong></p>
        <p class="phone">${esc(d.recipientPhone)}</p>
        <p class="address">${esc([d.recipientAddress, d.township].filter(Boolean).join(", "))}</p><p class="remarks"><b>Remarks:</b> ${esc(d.remarks || "-")}</p>
      </section>
      <section class="w43-money">
        <div class="money-row"><span>Item Price:</span><b>${money(d.itemPrice)}</b></div>
        <div class="money-row"><span>Deli Fee:</span><b>${money(d.deliveryFee)}</b></div>
        <div class="money-row"><span>Prepaid:</span><b>${money(d.prepaid)}</b></div>
        <div class="cod-box"><small>COD</small><strong>${money(d.cod)}</strong></div>
      </section>
    </div>
  </article>`;
}

function render4x2(row: PrintRow, type: DocType) {
  const d = normalized(row, type);
  return `<article class="be-label be-4x2">
    <aside class="w42-side">${esc(d.township || d.region || "Delivery")}</aside>
    <div class="w42-main">
      <header class="w42-head">
        <div class="w42-brand"><b>4D</b>${brandMark()}<div><strong>BRITIUM EXPRESS</strong><small>09 - 897447744</small><small>OS : ${esc(d.merchant)}</small></div></div>
        <div class="w42-code"><img class="barcode" src="${barcodeUrl(d.no)}" alt="Barcode"><b>${esc(d.no)}</b></div>
        <img class="qr" src="${qrUrl(d.no)}" alt="QR code">
      </header>
      <div class="w42-body">
        <div class="vertical-label">Recipient :</div>
        <section class="w42-person"><strong>${esc(d.recipient)}</strong><b>${esc(d.recipientPhone)}</b><p>${esc([d.recipientAddress, d.township].filter(Boolean).join(", "))}</p><p class="remarks"><b>Remarks:</b> ${esc(d.remarks || "-")}</p></section>
        <section class="w42-money">
          <div class="money-row"><span>Item Price :</span><b>${money(d.itemPrice)}</b></div>
          <div class="money-row"><span>Deli Fee :</span><b>${money(d.deliveryFee)}</b></div>
          <div class="money-row"><span>Surcharge :</span><b>${money(d.surcharge)}</b></div>
          <small>CBM/wt. (Kg) : ${esc(d.cbm)} / ${esc(d.weight)}</small>
          <div class="cod-box"><strong>${money(d.cod)}</strong></div>
        </section>
      </div>
    </div>
  </article>`;
}

function renderCompact(row: PrintRow, type: DocType) {
  const d = normalized(row, type);
  return `<article class="be-label be-compact">
    <header class="compact-head"><div class="compact-brand">${brandMark()}<div><strong>BRITIUM EXPRESS</strong><small>09-897447744</small></div></div><img class="qr" src="${qrUrl(d.no)}" alt="QR code"></header>
    <section class="compact-info"><p>Merchant : ${esc(d.merchant)}</p><p>Recipient : ${esc(d.recipient)}</p><p>Remarks : ${esc(d.remarks)}</p></section>
    <section class="compact-bottom"><div><p>Item Price : ${money(d.itemPrice)}</p><p>Deli Fee : ${money(d.deliveryFee)}</p></div><div class="cod-box"><small>COD</small><strong>${money(d.cod)}</strong></div></section>
    <footer class="compact-footer"><img class="barcode" src="${barcodeUrl(d.no)}" alt="Barcode"><small>${esc(d.createdAt)}</small></footer>
  </article>`;
}

function renderMicro(row: PrintRow, type: DocType) {
  const d = normalized(row, type);
  return `<article class="be-label be-micro">
    <header class="micro-head"><div>${brandMark()}<b>BRITIUM EXPRESS</b></div><img class="qr" src="${qrUrl(d.no)}" alt="QR code"></header>
    <div class="micro-person"><p><b>M:</b> ${esc(d.merchant)}</p><p><b>R:</b> ${esc(d.recipient)}</p><p>${esc(d.recipientPhone)}</p></div>
    <div class="micro-money"><span>Fee ${money(d.deliveryFee)}</span><strong>COD ${money(d.cod)}</strong></div>
    <footer class="micro-code"><img class="barcode" src="${barcodeUrl(d.no)}" alt="Barcode"><b>${esc(d.no)}</b></footer>
  </article>`;
}

function render4x6(row: PrintRow, type: DocType) {
  const d = normalized(row, type);
  return `<article class="be-label be-4x6">
    <header class="full-head">
      <div class="full-brand">${brandMark()}<div><strong>BRITIUM EXPRESS</strong>${type === "WAYBILL" ? "" : `<span>${esc(type)}</span>`}<b>HotLine: 09 - 897 44 77 44</b></div></div>
      <div class="full-code">
        <time>${esc(d.createdAt)}</time>
        <div class="full-scans">
          <img class="barcode" src="${barcodeUrl(d.no)}" alt="Barcode">
          <img class="qr" src="${qrUrl(d.no)}" alt="QR code">
        </div>
        <strong>${esc(d.no)}</strong>
      </div>
    </header>
    <section class="full-merchant"><span>Merchant :</span><div><b>${esc(d.merchant)}</b><p>${esc(d.merchantPhone)}</p><p>${esc(d.merchantAddress)}</p></div></section>
    <section class="full-recipient"><span>Recipient :</span><div><strong>${esc(d.recipient)}</strong><b>${esc(d.recipientPhone)}</b><p>${esc([d.recipientAddress, d.township].filter(Boolean).join(", "))}</p></div></section>
    <section class="full-finance">
      <div><p>CBM :<b>${esc(d.cbm)}</b></p><p>Weight (kg) :<b>${esc(d.weight)}</b></p><p>Delivery :<b>${esc(d.service)}</b></p></div>
      <div><p>Item Price :<b>${money(d.itemPrice)}</b></p><p>Delivery Fees :<b>${money(d.deliveryFee)}</b></p><p>Prepaid to OS :<b>${money(d.prepaid)}</b></p></div>
      <div class="cod-box"><small>COD</small><strong>${money(d.cod)}</strong></div>
    </section>
    <section class="full-remarks">Remarks : <span>${esc(d.remarks)}</span></section>
  </article>`;
}

function renderStaticLabel(row: PrintRow, type: DocType, label: Label) {
  if (label === "4x3") return render4x3(row, type);
  if (label === "4x2") return render4x2(row, type);
  if (label === "2x3") return renderCompact(row, type);
  if (label === "2x1.5") return renderMicro(row, type);
  return render4x6(row, type);
}

function paperSize(paper: Paper) {
  if (paper === "A4") return { width: "210mm", height: "297mm", page: "A4 portrait" };
  if (paper === "A5") return { width: "148mm", height: "210mm", page: "A5 portrait" };
  return { width: "4in", height: "6in", page: "4in 6in" };
}

function sharedLabelCss() {
  return `
    * { box-sizing: border-box; }
    .be-label { width: 100%; height: 100%; overflow: hidden; border: .35mm solid #111; color: #050505; background: #fff; font-family: "Poppins", "Noto Sans Myanmar", sans-serif; font-size: 12pt; font-weight: 400; letter-spacing: normal; line-height: 1.2; }
    .be-logo { display: block; flex: 0 0 auto; object-fit: contain; object-position: center; }
    .qr { display: block; object-fit: contain; }
    .barcode { display: block; width: 100%; object-fit: fill; }
    .money-row { display: flex; justify-content: space-between; gap: 5px; }
    .cod-box { border: .35mm solid #222; border-radius: 2mm; background: #d8d8d8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .be-4x3 { display: flex; flex-direction: column; padding: 2.2mm; font-size: 10pt; }
    .w43-head { height: 20%; display: grid; grid-template-columns: minmax(0,1fr) 32mm 14mm; gap: 1.5mm; align-items: center; border-bottom: .3mm solid #111; padding-bottom: 1.5mm; }
    .w43-brand { display: flex; align-items: center; gap: 1.5mm; min-width: 0; overflow: hidden; }
    .w43-brand .be-logo { width: 8mm; height: 8mm; }
    .w43-brand > div { min-width: 0; overflow: hidden; }
    .w43-brand strong { display: block; max-width: 100%; overflow: hidden; font-size: 8.5pt; line-height: 1.05; white-space: nowrap; }
    .w43-brand small { display: block; margin-top: .7mm; font-size: 6.8pt; white-space: nowrap; }
    .w43-code { text-align: center; min-width: 0; }
    .w43-code .barcode { height: 7mm; }
    .w43-code b { display: block; margin-top: .4mm; font-size: 7pt; white-space: nowrap; }
    .w43-head .qr { width: 13mm; height: 13mm; }
    .w43-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 61% 39%; padding-top: 2mm; }
    .w43-person { padding-right: 2.5mm; border-right: .3mm solid #111; overflow: hidden; }
    .w43-person p { margin: 0 0 1.4mm; line-height: 1.18; }
    .w43-person .recipient strong { font-size: 13.5pt; }
    .w43-person .phone { font-size: 9pt; }
    .w43-person .address { font-size: 9pt; line-height: 1.3; }
    .w43-person .remarks { font-size: 7.5pt; line-height: 1.15; max-height: 8mm; overflow: hidden; }
    .w43-money { display: flex; min-height: 0; flex-direction: column; padding-left: 2.5mm; gap: 1mm; }
    .w43-money .cod-box { margin-top: auto; min-height: 25mm; padding: 2mm; display: flex; flex-direction: column; justify-content: space-between; }
    .w43-money .cod-box strong { align-self: flex-end; font-size: 21pt; line-height: 1; }

    .be-4x2 { display: grid; grid-template-columns: 9mm minmax(0,1fr); font-size: 8.5pt; }
    .w42-side { display: flex; align-items: center; justify-content: center; border-right: .3mm solid #111; font-weight: 900; writing-mode: vertical-rl; transform: rotate(180deg); overflow: hidden; }
    .w42-main { min-width: 0; display: flex; flex-direction: column; padding: 1.3mm 1.7mm; }
    .w42-head { height: 25%; display: grid; grid-template-columns: minmax(0,1fr) 30mm 12mm; gap: 1.5mm; align-items: start; border-bottom: .3mm solid #111; padding-bottom: 1mm; }
    .w42-brand { display: flex; gap: 1.2mm; min-width: 0; align-items: flex-start; }
    .w42-brand > b { font-size: 11pt; }
    .w42-brand .be-logo { width: 6mm; height: 6mm; font-size: 8pt; }
    .w42-brand strong { display: block; font-size: 8.5pt; line-height: 1.05; white-space: nowrap; }
    .w42-brand small { display: block; font-size: 6.8pt; line-height: 1.15; }
    .w42-code { text-align: center; }
    .w42-code .barcode { height: 6mm; }
    .w42-code b { display: block; font-size: 6.5pt; white-space: nowrap; }
    .w42-head .qr { width: 11mm; height: 11mm; }
    .w42-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 5mm minmax(0,1.55fr) minmax(0,1fr); }
    .vertical-label { display: flex; align-items: flex-end; justify-content: center; padding-bottom: 1mm; font-size: 6.5pt; writing-mode: vertical-rl; transform: rotate(180deg); }
    .w42-person { padding: 1.2mm 2mm; border-right: .3mm solid #111; overflow: hidden; }
    .w42-person strong, .w42-person b { display: block; }
    .w42-person strong { font-size: 11pt; line-height: 1.05; }
    .w42-person p { margin: 1mm 0 0; font-size: 7.5pt; line-height: 1.25; }
    .w42-person .remarks { margin-top: .7mm; font-size: 6.5pt; line-height: 1.12; max-height: 8mm; overflow: hidden; }
    .w42-money { display: flex; flex-direction: column; gap: .5mm; padding: 1.2mm 0 0 2mm; min-width: 0; }
    .w42-money small { font-size: 6.5pt; }
    .w42-money .cod-box { margin-top: auto; padding: 1.2mm; text-align: right; }
    .w42-money .cod-box strong { font-size: 17pt; line-height: 1; }

    .be-compact { display: flex; flex-direction: column; padding: 1.4mm; font-size: 7.6pt; }
    .compact-head { height: 18%; display: flex; align-items: center; justify-content: space-between; border-bottom: .25mm solid #111; padding-bottom: .8mm; }
    .compact-brand { display: flex; align-items: center; gap: 1.2mm; }
    .compact-brand .be-logo { width: 6mm; height: 6mm; font-size: 8pt; }
    .compact-brand strong, .compact-brand span, .compact-brand small { display: block; line-height: 1.05; }
    .compact-brand strong { font-size: 7.5pt; }
    .compact-brand span, .compact-brand small { font-size: 6.2pt; }
    .compact-head .qr { width: 12mm; height: 12mm; }
    .compact-info { flex: 1; padding-top: 1.5mm; overflow: hidden; }
    .compact-info p { margin: 0 0 2mm; line-height: 1.2; }
    .compact-bottom { display: grid; grid-template-columns: minmax(0,1fr) 30mm; gap: 2mm; align-items: end; }
    .compact-bottom p { margin: 0 0 .8mm; }
    .compact-bottom .cod-box { min-height: 15mm; padding: 1mm; display: flex; flex-direction: column; justify-content: space-between; }
    .compact-bottom .cod-box strong { align-self: flex-end; font-size: 13pt; }
    .compact-footer { height: 13mm; border-top: .25mm solid #111; margin-top: 1.2mm; padding-top: 1mm; text-align: center; }
    .compact-footer .barcode { width: 28mm; height: 7mm; margin: 0 auto; }
    .compact-footer small { display: block; font-size: 5.5pt; }

    .be-micro { display: flex; flex-direction: column; padding: .8mm; font-size: 5.7pt; }
    .micro-head { height: 29%; display: flex; align-items: center; justify-content: space-between; border-bottom: .2mm solid #111; }
    .micro-head > div { display: flex; align-items: center; gap: .8mm; min-width: 0; }
    .micro-head .be-logo { width: 4.5mm; height: 4.5mm; font-size: 6pt; }
    .micro-head b { font-size: 5.9pt; white-space: nowrap; }
    .micro-head .qr { width: 9mm; height: 9mm; }
    .micro-person { flex: 1; min-height: 0; padding-top: .6mm; overflow: hidden; }
    .micro-person p { margin: 0 0 .35mm; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .micro-money { display: flex; justify-content: space-between; gap: 1mm; border-top: .2mm solid #111; padding-top: .45mm; }
    .micro-money strong { font-size: 6.4pt; }
    .micro-code { height: 7mm; text-align: center; }
    .micro-code .barcode { width: 23mm; height: 4mm; margin: .4mm auto 0; }
    .micro-code b { display: block; font-size: 4.7pt; line-height: 1; }

    .be-4x6 { display: grid; grid-template-rows: 34mm 27mm 40mm 35mm minmax(0, 1fr); padding: 3mm; font-size: 10pt; }
    .full-head { position: relative; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 45mm; align-items: center; gap: 2mm; border-bottom: .3mm solid #111; padding: 5mm 1mm 2.5mm; overflow: hidden; }
    .full-brand { min-width: 0; display: grid; grid-template-columns: 9mm minmax(0, 1fr); align-items: center; gap: 2mm; padding: 0; }
    .full-brand .be-logo { width: 9mm; height: 9mm; }
    .full-brand strong, .full-brand span, .full-brand b { display: block; }
    .full-brand strong { font-size: 10pt; line-height: 1.05; white-space: nowrap; font-weight: 700; letter-spacing: 0; }
    .full-brand span { margin-top: .8mm; font-size: 7.7pt; line-height: 1.1; white-space: nowrap; font-weight: 500; }
    .full-brand b { margin-top: .8mm; font-size: 6.3pt; line-height: 1.1; white-space: nowrap; font-weight: 500; }
    .full-code { width: 45mm; text-align: center; align-self: end; }
    .full-code time { position: absolute; top: .8mm; right: 1mm; width: 46mm; display: block; white-space: nowrap; font-size: 6.5pt; font-weight: 400; text-align: right; }
    .full-scans { display: grid; grid-template-columns: minmax(0, 1fr) 20mm; align-items: center; gap: 2mm; }
    .full-code .barcode { width: 100%; height: 9mm; object-fit: fill; }
    .full-code .qr { width: 20mm; height: 20mm; margin: 0; }
    .full-code strong { display: block; font-size: 7.2pt; font-weight: 600; white-space: nowrap; text-align: center; }
    .full-merchant, .full-recipient { min-height: 0; display: grid; grid-template-columns: 26mm minmax(0,1fr); border-bottom: .3mm solid #111; padding: 4mm 1mm 2.5mm; overflow: hidden; }
    .full-merchant > span, .full-recipient > span { white-space: nowrap; font-size: 9.5pt; font-weight: 400; }
    .full-merchant b { font-size: 9.5pt; font-weight: 500; }
    .full-merchant p, .full-recipient p { margin: 1.3mm 0 0; font-size: 8.5pt; font-weight: 400; line-height: 1.3; }
    .full-recipient strong, .full-recipient b { display: block; }
    .full-recipient strong { font-size: 16pt; font-weight: 700; line-height: 1.12; }
    .full-recipient b { margin-top: 2.5mm; font-size: 11.5pt; font-weight: 600; }
    .full-finance { min-height: 0; display: grid; grid-template-columns: 26% 37% 37%; border-bottom: .3mm solid #111; padding: 3mm 0; overflow: hidden; }
    .full-finance > div { padding-right: 3mm; }
    .full-finance > div + div { border-left: .3mm solid #111; padding-left: 3mm; }
    .full-finance p { margin: 0 0 2.2mm; font-size: 8.2pt; font-weight: 400; line-height: 1.15; }
    .full-finance p b { display: block; margin-top: .6mm; font-size: 9.5pt; font-weight: 600; }
    .full-finance .cod-box { align-self: stretch; min-height: 0; margin: 0 0 0 3mm; padding: 2.5mm; display: flex; flex-direction: column; justify-content: space-between; }
    .full-finance .cod-box strong { align-self: flex-end; font-size: 20pt; line-height: 1; font-weight: 700; }
    .full-remarks { min-height: 0; padding: 3mm 1mm 0; font-size: 9pt; font-weight: 400; overflow: hidden; }
    .full-remarks span { margin-left: 3mm; }
  `;
}

export default function BritiumUnifiedPrintStudioV37() {
  const sb = supabase as any;
  const [docType, setDocType] = useState<DocType>("WAYBILL");
  const [paper, setPaper] = useState<Paper>("4x6");
  const [label, setLabel] = useState<Label>("4x6");
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("Loading the latest Data Entry waybills...");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState({ stage: "", completed: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [activePickupId, setActivePickupId] = useState("");
  const [activeWaybillNo, setActiveWaybillNo] = useState("");

  const layout = useMemo(() => layoutFor(paper, label), [paper, label]);
  const page = paperSize(paper);

  async function currentActorEmail() {
    try {
      const result = await sb.auth.getUser();
      if (result?.data?.user?.email) return String(result.data.user.email);
    } catch {
      // Local storage fallback is used by older Portal builds.
    }

    try {
      return (
        window.localStorage.getItem("email") ||
        window.localStorage.getItem("user_email") ||
        window.localStorage.getItem("be_operator_email") ||
        "unknown_operator"
      );
    } catch {
      return "unknown_operator";
    }
  }

  async function loadEnrichedWaybillRows(pickupId: string) {
    try {
      const result = await sb.rpc("be_waybill_print_rows_v38", { p_pickup_id: pickupId });
      if (result.error) throw result.error;
      return Array.isArray(result.data) ? result.data : [];
    } catch (error) {
      console.warn("V38 enriched Waybill row RPC is unavailable; using compatibility sources", error);
      return [] as PrintRow[];
    }
  }

  async function loadCanonicalParcels(wayIds: string[]) {
    const uniqueWayIds = [...new Set(wayIds.map((value) => String(value || "").trim()).filter(Boolean))];
    const byWayId = new Map<string, PrintRow>();

    for (let start = 0; start < uniqueWayIds.length; start += 100) {
      const chunk = uniqueWayIds.slice(start, start + 100);
      try {
        const result = await sb.from("parcels").select("*").in("way_id", chunk);
        if (result.error) throw result.error;
        for (const row of Array.isArray(result.data) ? result.data : []) {
          const key = text(row, "way_id", "tracking_code", "tracking_no");
          if (key) byWayId.set(key, row);
        }
      } catch (error) {
        console.warn("Unable to enrich Waybill rows from public.parcels", error);
      }
    }

    return byWayId;
  }

  async function loadRows() {
    setLoading(true);
    try {
      const context = navigationContext();
      let pickupId = String(context.pickupId || context.pickup_id || "").trim();
      let summary: PrintRow | null = null;

      if (pickupId) {
        const summaryResult = await sb
          .from("be_parcel_waybills")
          .select("*")
          .eq("pickup_id", pickupId)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (!summaryResult.error) summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] || null : summaryResult.data || null;
      } else {
        const latestSummary = await sb
          .from("be_parcel_waybills")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (!latestSummary.error) summary = Array.isArray(latestSummary.data) ? latestSummary.data[0] || null : latestSummary.data || null;
        pickupId = String(summary?.pickup_id || "").trim();
      }

      if (pickupId) {
        let details = await loadEnrichedWaybillRows(pickupId);
        if (!details.length) {
          const detailsResult = await sb
            .from("be_data_entry_parcel_details")
            .select("*")
            .eq("pickup_id", pickupId)
            .order("parcel_sequence", { ascending: true })
            .limit(5000);

          if (detailsResult.error) throw detailsResult.error;
          details = Array.isArray(detailsResult.data) ? detailsResult.data : [];
        }

        if (details.length) {
          const batchWaybillNo = String(summary?.waybill_no || context.waybillNo || context.waybill_no || "").trim();
          const detailWayIds = details.map((row: PrintRow) => text(row, "delivery_way_id", "tracking_no", "tracking_code", "way_id"));
          const canonicalByWayId = await loadCanonicalParcels(detailWayIds);
          const next = details.map((row: PrintRow, index: number) => {
            const parcelNo = text(row, "delivery_way_id", "tracking_no", "tracking_code", "way_id") || `${batchWaybillNo || pickupId}-${String(index + 1).padStart(3, "0")}`;
            const canonical = canonicalByWayId.get(parcelNo) || {};
            return {
              ...row,
              ...canonical,
              pickup_id: pickupId,
              waybill_no: parcelNo,
              tracking_no: parcelNo,
              batch_waybill_no: batchWaybillNo,
              merchant_name: text(canonical, "os", "sender_name", "merchant_name", "merchant_id", "customer_id", "merchant_code") || text(row, "os", "sender_name", "merchant_name", "merchant_id", "customer_id", "merchant_code") || text(summary || {}, "merchant_name", "merchant_code") || "OS not provided",
              os: text(canonical, "os", "sender_name", "merchant_id", "customer_id") || text(row, "os", "sender_name", "merchant_id", "customer_id"),
              recipient_name: text(canonical, "recipient_name", "receiver_name") || text(row, "recipient_name", "receiver_name"),
              recipient_phone: text(canonical, "recipient_phone", "receiver_phone", "contact_no_1") || text(row, "recipient_phone", "contact_no_1", "receiver_phone"),
              recipient_address: text(canonical, "recipient_address", "delivery_address", "receiver_address") || text(row, "recipient_address", "delivery_address", "receiver_address"),
              township: text(canonical, "recipient_township", "township", "delivery_township", "receiver_township") || text(row, "recipient_township", "township", "delivery_township", "receiver_township"),
              destination: text(canonical, "destination", "city", "destination_city") || text(row, "destination", "city", "destination_city"),
              delivery_fee: amount(canonical, "delivery_fee", "delivery_charges") || amount(row, "delivery_fee", "delivery_charges"),
              surcharge: amount(canonical, "surcharge", "extra_weight_charge") || amount(row, "surcharge", "extra_weight_charge"),
              actual_collect: amount(canonical, "actual_collect", "collect_amount", "cod_amount") || amount(row, "actual_collect", "collect_amount", "cod_amount"),
              remarks: text(canonical, "remarks", "remark", "data_entry_remark", "special_instruction", "special_instructions", "instructions") || text(row, "remarks", "remark", "data_entry_remark", "special_instruction", "special_instructions", "instructions"),
            };
          });

          setRows(next);
          setSelected(next.map((row: PrintRow) => docNo(row, docType)));
          setActivePickupId(pickupId);
          setActiveWaybillNo(batchWaybillNo);
          setMessage(`${next.length} parcel waybill row(s) loaded for pickup ${pickupId}${batchWaybillNo ? ` · Batch ${batchWaybillNo}` : ""}.`);
          return;
        }
      }

      const legacyData = await tableV33("be_v32_parcels", 500);
      const legacyRows = (Array.isArray(legacyData) ? legacyData : []).filter((row: PrintRow) => !pickupId || text(row, "pickup_id") === pickupId);
      if (!legacyRows.length) {
        throw new Error(pickupId ? `No printable parcel rows were found for pickup ${pickupId}.` : "No printable parcel rows were found.");
      }

      setRows(legacyRows);
      setSelected(legacyRows.map((row: PrintRow) => docNo(row, docType)));
      setActivePickupId(pickupId || text(legacyRows[0], "pickup_id"));
      setActiveWaybillNo(String(context.waybillNo || context.waybill_no || ""));
      setMessage(`${legacyRows.length} legacy print row(s) loaded.`);
    } catch (error) {
      setRows([]);
      setSelected([]);
      setMessage(error instanceof Error ? error.message : "Unable to load live Waybill rows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    const reload = () => void loadRows();
    window.addEventListener("britium:waybill-created", reload as EventListener);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("britium:waybill-created", reload as EventListener);
      window.removeEventListener("storage", reload);
    };
    // Initial loading and cross-screen refresh are intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPrintWindow(targetCount: number) {
    const win = window.open("", "_blank", "width=1100,height=820");
    if (!win) return null;

    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Preparing Britium print job</title><style>
      *{box-sizing:border-box}body{margin:0;background:#061525;color:#eef8ff;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}
      .card{width:min(620px,92vw);border:1px solid #1a5a82;border-radius:20px;background:#0b2940;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      h1{margin:0 0 12px;color:#f6b84b;font-size:24px}.bar{height:12px;border-radius:999px;background:#061525;overflow:hidden;margin:18px 0}.fill{height:100%;width:0;background:#38bdf8;transition:width .2s ease}
      p{line-height:1.55;color:#c8dff0}.count{font-weight:800;color:#fff}
    </style></head><body><main class="card"><h1>Preparing ${targetCount} waybill(s)</h1><p id="be-print-status">Opening the secure print session…</p><div class="bar"><div id="be-print-fill" class="fill"></div></div><p id="be-print-detail" class="count">0 / ${targetCount}</p></main></body></html>`);
    win.document.close();
    win.focus();
    return win;
  }

  function updatePrintWindowProgress(win: Window, stage: string, completed: number, total: number) {
    if (win.closed) return;
    const status = win.document.getElementById("be-print-status");
    const detail = win.document.getElementById("be-print-detail");
    const fill = win.document.getElementById("be-print-fill") as HTMLElement | null;
    if (status) status.textContent = stage;
    if (detail) detail.textContent = `${completed} / ${total}`;
    if (fill) fill.style.width = `${total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0}%`;
  }

  function showPrintWindowMessage(win: Window, title: string, detail: string) {
    if (win.closed) return;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;background:#061525;color:#eef8ff;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}
      .card{width:min(720px,92vw);border:1px solid #1a5a82;border-radius:20px;background:#0b2940;padding:28px}h1{color:#f6b84b}p{white-space:pre-wrap;line-height:1.6;color:#c8dff0}
      button{border:0;border-radius:10px;background:#f6b84b;color:#061525;font-weight:800;padding:12px 18px;cursor:pointer}
    </style></head><body><main class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p><button onclick="window.close()">Close</button></main></body></html>`);
    win.document.close();
  }

  function printAuthorizationNo(targetRows: PrintRow[]) {
    return String(
      activeWaybillNo ||
      text(targetRows[0] || {}, "batch_waybill_no", "pickup_waybill_no", "waybill_batch_no") ||
      activePickupId ||
      docNo(targetRows[0] || {}, docType)
    ).trim();
  }

  function normalizedAuthorizationResult(result: any) {
    if (Array.isArray(result)) return result[0] || {};
    if (result && Array.isArray(result.data)) return result.data[0] || {};
    return result || {};
  }

  async function authorizeBatchPrint(targetRows: PrintRow[], reason = "") {
    const documentNo = printAuthorizationNo(targetRows);
    if (!documentNo) throw new Error("The batch Waybill number is missing.");

    const actorEmail = await currentActorEmail();
    try {
      const batchResult = await sb.rpc("be_waybill_authorize_batch_print_v38", {
        p_pickup_id: activePickupId || text(targetRows[0] || {}, "pickup_id"),
        p_waybill_no: documentNo,
        p_document_type: docType,
        p_row_count: targetRows.length,
        p_paper_size: paper,
        p_label_size: label,
        p_reason: reason,
        p_actor_email: actorEmail,
      });
      if (!batchResult.error) {
        return { documentNo, result: normalizedAuthorizationResult(batchResult.data) };
      }
      console.warn("V38 batch authorization RPC unavailable; using V33 compatibility authorization", batchResult.error);
    } catch (error) {
      console.warn("V38 batch authorization RPC failed; using V33 compatibility authorization", error);
    }

    const result = await authorizePrintV33({
      documentType: docType,
      documentNo,
      reason,
      paperSize: paper,
      labelSize: label,
    });

    return { documentNo, result: normalizedAuthorizationResult(result) };
  }

  async function guardedPrint(targetRows: PrintRow[]) {
    if (printing) return;
    if (!targetRows.length) {
      setMessage("Select at least one print row.");
      return;
    }

    const printWindow = openPrintWindow(targetRows.length);
    if (!printWindow) {
      setMessage("The browser blocked the print window. Allow pop-ups for this Vercel site and try again.");
      return;
    }

    setPrinting(true);
    setPrintProgress({ stage: "Authorizing batch Waybill print…", completed: 0, total: 1 });
    updatePrintWindowProgress(printWindow, "Authorizing batch Waybill print…", 0, 1);
    setMessage(`Preparing ${targetRows.length} ${docType.toLowerCase()} row(s) for printing…`);

    try {
      let authorization = await authorizeBatchPrint(targetRows);
      let result = authorization.result;

      if (result?.reason_required) {
        const reason = window.prompt(`Batch ${authorization.documentNo} was printed before. Enter a reprint reason:`, "");
        if (!reason?.trim()) {
          showPrintWindowMessage(printWindow, "Reprint cancelled", "A reprint reason is required for this batch Waybill.");
          setMessage("Print job cancelled because no reprint reason was provided.");
          return;
        }
        authorization = await authorizeBatchPrint(targetRows, reason.trim());
        result = authorization.result;
      }

      if (!result?.allowed) {
        const detail = result?.message || result?.reason || `Batch ${authorization.documentNo} was not authorized for printing.`;
        showPrintWindowMessage(printWindow, "Print authorization failed", detail);
        setMessage(`Print job stopped: batch ${authorization.documentNo} was not authorized. ${detail}`);
        return;
      }

      setPrintProgress({ stage: "Building printable pages…", completed: 1, total: 1 });
      updatePrintWindowProgress(printWindow, "Building printable pages…", 1, 1);
      printRows(targetRows, printWindow);
      setMessage(`Print window prepared for all ${targetRows.length} row(s) under batch ${authorization.documentNo}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || "Unable to prepare the print job.");
      showPrintWindowMessage(printWindow, "Print preparation failed", errorMessage);
      setMessage(`Print failed: ${errorMessage}`);
    } finally {
      setPrinting(false);
      setPrintProgress({ stage: "", completed: 0, total: 0 });
    }
  }

  function printRows(targetRows: PrintRow[], existingWindow?: Window | null) {
    const win = existingWindow || window.open("", "_blank", "width=1100,height=820");
    if (!win) {
      setMessage("The browser blocked the print window. Allow pop-ups for this Vercel site and try again.");
      return;
    }
    if (win.closed) {
      setMessage("The print window was closed before the pages were ready. Click Print again.");
      return;
    }

    const html = buildPrintHtml(targetRows);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();

    const printAfterImages = async () => {
      const images = Array.from(win.document.images);
      const imageWait = Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) resolve();
              else {
                image.onload = () => resolve();
                image.onerror = () => resolve();
              }
            }),
        ),
      );
      const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, PRINT_IMAGE_WAIT_MS));
      await Promise.race([imageWait.then(() => undefined), timeout]);
      if (win.document.fonts?.ready) await Promise.race([win.document.fonts.ready.then(() => undefined), timeout]);
      if (!win.closed) {
        win.focus();
        window.setTimeout(() => win.print(), 180);
      }
    };

    window.setTimeout(() => void printAfterImages(), 120);
  }

  function buildPrintHtml(targetRows: PrintRow[]) {
    const chunks: PrintRow[][] = [];
    for (let index = 0; index < targetRows.length; index += layout.perSheet) {
      chunks.push(targetRows.slice(index, index + layout.perSheet));
    }

    const sheets = chunks
      .map(
        (chunk) =>
          `<section class="sheet paper-${paper}" style="--cols:${layout.columns};--rows:${layout.rows};--label-w:${layout.labelWidth};--label-h:${layout.labelHeight};">${chunk
            .map((row) => `<div class="slot">${renderStaticLabel(row, docType, label)}</div>`)
            .join("")}</section>`,
      )
      .join("");

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Britium ${docType} Print</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>
      @page { size: ${page.page}; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      .print-toolbar { position: sticky; top: 0; z-index: 1000; display: flex; justify-content: center; gap: 12px; padding: 12px; background: #061525; color: white; font-family: Arial, sans-serif; }
      .print-toolbar button { border: 0; border-radius: 10px; background: #f6b84b; color: #061525; cursor: pointer; font-weight: 800; padding: 10px 18px; }
      .sheet { width: ${page.width}; height: ${page.height}; page-break-after: always; overflow: hidden; display: grid; grid-template-columns: repeat(var(--cols), var(--label-w)); grid-auto-rows: var(--label-h); justify-content: center; align-content: center; background: white; }
      .sheet:last-child { page-break-after: auto; }
      .slot { width: var(--label-w); height: var(--label-h); overflow: hidden; }
      @media print { .print-toolbar { display: none !important; } }
      ${sharedLabelCss()}
    </style></head><body><div class="print-toolbar"><span>${targetRows.length} ${esc(docType.toLowerCase())} row(s) ready.</span><button onclick="window.print()">Print now</button><button onclick="window.close()">Close</button></div>${sheets}</body></html>`;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = useMemo(
    () => rows.filter((row) => rowMatchesSearch(row, normalizedSearch)),
    [rows, normalizedSearch],
  );
  const selectedRows = rows.filter((row) => selected.includes(docNo(row, docType)));
  const previewRows = visibleRows.length
    ? Array.from({ length: layout.perSheet }, (_, index) => visibleRows[index % visibleRows.length])
    : [];
  const previewScale = paper === "A4" ? 0.68 : paper === "A5" ? 0.8 : 1;
  const previewHeight = paper === "A4" ? 1123 * previewScale : paper === "A5" ? 794 * previewScale : 576;

  return (
    <main data-waybill-studio-build={WAYBILL_STUDIO_BUILD} className="min-h-screen overflow-x-hidden bg-[#061525] p-3 text-slate-100 md:p-5">
      <style>{sharedLabelCss()}</style>
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-4 shadow-2xl md:p-5">
          <div className="inline-flex rounded-xl border-b-4 border-amber-700 bg-amber-400 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-slate-950">
            Waybill Print Studio
          </div>
          <h1 className="mt-3 text-2xl font-black md:text-3xl">Exact multi-size Waybill printing</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-sky-200">
            Select the document paper and label layout. The 4 × 6 thermal combinations follow the four supplied reference designs, while A5 and A4 arrange the same labels at their physical print dimensions.
          </p>

          <div className="mt-4 grid gap-3 xl:grid-cols-[180px_260px_340px_1fr]">
            <label className="text-xs font-black uppercase tracking-wider text-sky-200">
              Document type
              <select
                value={docType}
                onChange={(event) => {
                  const nextType = event.target.value as DocType;
                  setDocType(nextType);
                  setSelected(rows.map((row) => docNo(row, nextType)));
                }}
                className="mt-1 h-11 w-full rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
              >
                <option value="WAYBILL">WAYBILL</option>
                <option value="INVOICE">INVOICE</option>
                <option value="DOCUMENT">DOCUMENT</option>
              </select>
            </label>

            <label className="text-xs font-black uppercase tracking-wider text-sky-200">
              Paper size
              <select
                value={paper}
                disabled={printing}
                onChange={(event) => setPaper(event.target.value as Paper)}
                className="mt-1 h-11 w-full rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
              >
                {(Object.keys(PAPER_LABELS) as Paper[]).map((key) => (
                  <option key={key} value={key}>{PAPER_LABELS[key]}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-black uppercase tracking-wider text-sky-200">
              Waybill layout
              <select
                value={label}
                disabled={printing}
                onChange={(event) => setLabel(event.target.value as Label)}
                className="mt-1 h-11 w-full rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
              >
                {(Object.keys(LABEL_LABELS) as Label[]).map((key) => (
                  <option key={key} value={key}>{LABEL_LABELS[key]}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2">
              <Button tone="blue" disabled={loading || printing} onClick={() => void loadRows()}>{loading ? "Loading…" : "Refresh live rows"}</Button>
              <Button tone="green" disabled={printing || visibleRows.length === 0} onClick={() => setSelected(visibleRows.map((row) => docNo(row, docType)))}>Select all</Button>
              <Button tone="dark" disabled={printing || selected.length === 0} onClick={() => setSelected([])}>Clear</Button>
              <Button tone="gold" disabled={printing || selectedRows.length === 0} onClick={() => void guardedPrint(selectedRows)}>
                {printing ? `${printProgress.stage || "Preparing"} ${printProgress.completed}/${printProgress.total}` : `Print selected (${selectedRows.length})`}
              </Button>
              <Button tone="gold" disabled={printing || rows.length === 0} onClick={() => void guardedPrint(rows)}>
                {printing ? "Print job running…" : `Print all (${rows.length})`}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-sky-900 bg-slate-950/60 p-3"><b className="text-amber-300">Loaded:</b> {rows.length}</div>
            <div className="rounded-xl border border-sky-900 bg-slate-950/60 p-3"><b className="text-amber-300">Pickup:</b> {activePickupId || "—"}</div>
            <div className="rounded-xl border border-sky-900 bg-slate-950/60 p-3"><b className="text-amber-300">Batch:</b> {activeWaybillNo || "—"}</div>
            <div className="rounded-xl border border-sky-900 bg-slate-950/60 p-3"><b className="text-amber-300">Per sheet:</b> {layout.perSheet} ({layout.columns} × {layout.rows})</div>
            <div className="rounded-xl border border-sky-900 bg-slate-950/60 p-3"><b className="text-amber-300">Selected:</b> {selected.length}</div>
          </div>
          <p className="mt-3 rounded-xl border border-amber-700/50 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-200">{message} {layout.description}</p>
        </section>

        <section className="grid min-h-0 gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="min-h-0 rounded-3xl border border-sky-900 bg-[#0b2940] p-4">
            <h2 className="mb-3 rounded-xl border-b-4 border-amber-700 bg-amber-400 px-3 py-2 font-black text-slate-950">Print rows · {visibleRows.length}</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Way ID, pickup, recipient, phone, township..."
              className="mb-3 h-11 w-full rounded-xl border border-sky-900 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-400"
            />
            <div className="max-h-[72vh] space-y-2 overflow-auto pr-1">
              {!loading && visibleRows.length === 0 ? (
                <div className="rounded-2xl border border-sky-900 bg-slate-950 p-4 text-sm text-sky-200">No matching live Waybill rows.</div>
              ) : visibleRows.map((row, index) => {
                const no = docNo(row, docType);
                return (
                  <label key={`${no}-${index}`} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-sky-900 bg-slate-950 p-3 hover:border-amber-400">
                    <input
                      type="checkbox"
                      checked={selected.includes(no)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...new Set([...current, no])] : current.filter((value) => value !== no),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <b className="block truncate text-amber-300">{no}</b>
                      <small className="block truncate text-sky-100">{text(row, "recipient_name", "receiver_name") || "-"} · {text(row, "recipient_township", "township", "delivery_township", "receiver_township") || "-"}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 rounded-3xl border border-sky-900 bg-[#0b2940] p-3 md:p-4">
            <h2 className="mb-3 rounded-xl border-b-4 border-amber-700 bg-amber-400 px-3 py-2 font-black text-slate-950">Live print preview</h2>
            <div className="overflow-auto rounded-2xl bg-slate-950 p-3 md:p-6">
              <div className="mx-auto flex justify-center" style={{ minHeight: previewHeight }}>
                <div
                  className="sheet bg-white text-black shadow-2xl"
                  style={
                    {
                      width: page.width,
                      height: page.height,
                      display: "grid",
                      gridTemplateColumns: `repeat(${layout.columns}, ${layout.labelWidth})`,
                      gridAutoRows: layout.labelHeight,
                      justifyContent: "center",
                      alignContent: "center",
                      overflow: "hidden",
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top center",
                    } as React.CSSProperties
                  }
                >
                  {previewRows.map((row, index) => (
                    <div
                      key={`${docNo(row, docType)}-${index}`}
                      style={{ width: layout.labelWidth, height: layout.labelHeight, overflow: "hidden" }}
                      dangerouslySetInnerHTML={{ __html: renderStaticLabel(row, docType, label) }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
