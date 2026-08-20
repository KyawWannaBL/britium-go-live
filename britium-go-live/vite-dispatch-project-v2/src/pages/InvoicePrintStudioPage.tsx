import React, { useEffect, useState } from "react";
import { Ban, CheckSquare, Eye, Globe2, Lock, Printer, Send, ShieldAlert, Square, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { guardedBrowserPrint } from "@/lib/documentPrintGuard";

type Lang = "EN" | "MM";
type Role = "FINANCE" | "SUPER_ADMIN" | "OTHER";

const T = {
  EN: {
    title: "Invoice Print Studio",
    superAdmin: "SuperAdmin Reprint Approval",
    desc: "Authorize invoice reprint requests.",
    switchFin: "Switch to Finance",
    switchAdmin: "SuperAdmin",
    pendingReq: "No pending reprint requests.",
    invoices: "Invoices",
    invId: "Invoice ID",
    merchant: "Merchant",
    status: "Status",
    printed: "Locked",
    ready: "Ready",
    preview: "Preview",
    hidePreview: "Hide Preview",
    printNow: "Print Now",
    requestReprint: "Request Reprint",
    approve: "Approve"
  },
  MM: {
    title: "ငွေတောင်းခံလွှာ ပုံနှိပ်စတူဒီယို",
    superAdmin: "SuperAdmin ပြန်လည်ပုံနှိပ်ခွင့်",
    desc: "ထပ်မံပုံနှိပ်ခွင့် တောင်းဆိုချက်များကို ခွင့်ပြုရန်။",
    switchFin: "Finance View ပြောင်းမည်",
    switchAdmin: "SuperAdmin",
    pendingReq: "ပြန်ထုတ်ရန် တောင်းဆိုချက်မရှိပါ။",
    invoices: "ငွေတောင်းခံလွှာများ",
    invId: "Invoice နံပါတ်",
    merchant: "ကုန်သည်",
    status: "အခြေအနေ",
    printed: "ပိတ်ထားသည်",
    ready: "အသင့်",
    preview: "နမူနာကြည့်ရန်",
    hidePreview: "နမူနာပိတ်ရန်",
    printNow: "ယခု ပုံနှိပ်မည်",
    requestReprint: "ပြန်ထုတ်ရန်တောင်းဆိုမည်",
    approve: "ခွင့်ပြုမည်"
  }
};

function money(v: unknown) { return Number(v || 0).toLocaleString("en-US"); }


function resolvePrintableInvoiceNo(row: any) {
  return String(
    row?.invoice_no ||
    row?.invoiceNo ||
    row?.invoice ||
    row?.delivery_way_id?.replace(/^D/, "INV") ||
    row?.waybill_no?.replace(/^WB/, "INV") ||
    ""
  ).trim();
}

async function printInvoiceWithGuard(row: any) {
  const documentNo = resolvePrintableInvoiceNo(row);
  await guardedBrowserPrint({
    document_type: "INVOICE",
    document_no: documentNo,
    document_ref: row?.delivery_way_id || row?.waybill_no || documentNo,
    reason: "Invoice print from Finance Invoice Studio",
  });
}

export default function InvoicePrintStudioPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const t = T[lang];

  const [role, setRole] = useState<Role>("FINANCE");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("be_get_invoice_print_studio", { p_payload: {} });
    setInvoices((data as any)?.invoices || []);
    setRequests((data as any)?.reprint_requests || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const selectedRows = invoices.filter(x => selected.includes(x.invoice_id));
  const hasPrinted = selectedRows.some(x => x.is_printed);
  const hasReady = selectedRows.some(x => !x.is_printed);

  const printNow = () => {
    if (selectedRows.length === 0 || hasPrinted) return;
    setShowPreview(true);
    setTimeout(async () => {
      void printInvoiceWithGuard((typeof selectedRow !== 'undefined' && selectedRow) || (typeof selectedRows !== 'undefined' && selectedRows?.[0]) || (typeof rows !== 'undefined' && rows?.[0]) || {});
      await supabase.rpc("be_invoice_print_action", { p_payload: { action: "MARK_PRINTED", invoice_ids: selected, actor: "finance" } });
      setSelected([]);
      await load();
    }, 300);
  };

  const requestReprint = async () => {
    for (const inv of selectedRows.filter(x => x.is_printed)) {
      await supabase.rpc("be_invoice_print_action", { p_payload: { action: "REQUEST_REPRINT", invoice_id: inv.invoice_id, reason: "Printer error", actor: "finance" } });
    }
    setSelected([]);
    await load();
  };

  const adminApprove = async (reqNo: string) => {
    await supabase.rpc("be_invoice_print_action", { p_payload: { action: "APPROVE_REPRINT", request_no: reqNo, actor: "superadmin" } });
    await load();
  };

  if (role === "SUPER_ADMIN") {
    return (
      <div className="min-h-screen bg-[#061524] text-[#eef8ff] p-8 font-['Poppins',sans-serif]">
        <div className="flex justify-between mb-8 items-center">
          <div><h1 className="text-2xl font-black text-[#f6b84b]">{t.superAdmin}</h1><p className="text-[#9fc4df]">{t.desc}</p></div>
          <div className="flex gap-3">
            <button onClick={() => setLang(lang === "EN" ? "MM" : "EN")} className="px-4 py-2 rounded-xl bg-[#123456] text-[#f6b84b] font-bold flex gap-2 items-center"><Globe2 size={16}/> {lang}</button>
            <button onClick={() => setRole("FINANCE")} className="px-4 py-2 rounded-xl bg-[#1a3a5c] font-bold flex gap-2 items-center"><UserCog size={16} /> {t.switchFin}</button>
          </div>
        </div>
        <div className="space-y-4">
          {requests.filter(r => r.status === "PENDING").map(r => (
            <div key={r.request_no} className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 flex justify-between items-center">
              <div><div className="text-[#f6b84b] font-black">{r.request_no}</div><div className="text-white">Invoice: {r.invoice_id}</div></div>
              <button onClick={() => adminApprove(r.request_no)} className="px-4 py-2 bg-emerald-600 rounded-xl font-black">{t.approve}</button>
            </div>
          ))}
          {requests.filter(r => r.status === "PENDING").length === 0 && <div className="text-center text-[#4d7a9b] p-10">{t.pendingReq}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-slate-900 pb-8 print:bg-white font-['Poppins',sans-serif]">
      <style>{`@page { size: 210mm 297mm; margin: 0; } @media print { body { background: white !important; } .no-print { display: none !important; } .print-page { margin: 0 !important; box-shadow: none !important; } }`}</style>
      <header className="no-print bg-[#0b2236] text-white p-4 flex justify-between items-center">
        <h1 className="text-xl font-black text-[#f6b84b]"><Printer className="inline mr-2"/> {t.title}</h1>
        <div className="flex gap-3">
          <button onClick={() => setLang(lang === "EN" ? "MM" : "EN")} className="px-4 py-2 rounded-xl bg-[#123456] text-[#f6b84b] font-bold flex gap-2 items-center"><Globe2 size={16}/> {lang}</button>
          <button onClick={() => setRole("SUPER_ADMIN")} className="px-4 py-2 rounded-xl bg-[#1a3a5c] font-bold text-white"><ShieldAlert className="inline mr-2" size={16}/> {t.switchAdmin}</button>
        </div>
      </header>

      <main className="no-print max-w-6xl mx-auto mt-6 grid grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-3xl border p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left"><th className="p-3">Sel</th><th className="p-3">{t.invId}</th><th className="p-3">{t.merchant}</th><th className="p-3">{t.status}</th></tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.invoice_id} onClick={() => setSelected(prev => prev.includes(inv.invoice_id) ? prev.filter(x => x !== inv.invoice_id) : [...prev, inv.invoice_id])} className="border-b cursor-pointer hover:bg-blue-50">
                  <td className="p-3">{selected.includes(inv.invoice_id) ? <CheckSquare className="text-blue-600"/> : <Square className="text-gray-300"/>}</td>
                  <td className="p-3 font-bold">{inv.invoice_id}</td>
                  <td className="p-3">{inv.merchant_name}</td>
                  <td className="p-3">{inv.is_printed ? <span className="text-rose-600 font-bold"><Lock size={14} className="inline"/> {t.printed}</span> : <span className="text-emerald-600 font-bold">{t.ready}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-3xl border p-5 h-max space-y-4">
          <button onClick={() => setShowPreview(!showPreview)} className="w-full bg-gray-100 py-3 rounded-xl font-bold flex justify-center gap-2"><Eye size={18}/> {showPreview ? t.hidePreview : t.preview}</button>
          {hasPrinted && !hasReady ? (
             <button onClick={requestReprint} className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold flex justify-center gap-2"><Send size={18}/> {t.requestReprint}</button>
          ) : (
             <button disabled={selectedRows.length === 0 || hasPrinted} onClick={printNow} className="w-full bg-blue-600 text-white disabled:bg-gray-300 py-3 rounded-xl font-bold flex justify-center gap-2"><Printer size={18}/> {t.printNow}</button>
          )}
        </div>
      </main>

      <div className={showPreview ? "print:block mt-10" : "hidden"}>
        {selectedRows.map(inv => (
          <div key={inv.invoice_id} className="print-page bg-white shadow-xl mx-auto mb-6 p-8 font-sans" style={{ width: "210mm", height: "297mm", pageBreakAfter: "always" }}>
            <div className="flex justify-between border-b-2 border-black pb-4 mb-6">
              <div><h1 className="text-3xl font-black">BRITIUM EXPRESS</h1><p>info@britiumexpress.com</p></div>
              <div className="text-right"><h2 className="text-2xl font-bold text-gray-400">INVOICE</h2><p className="font-bold">{inv.invoice_id}</p></div>
            </div>
            <div className="grid grid-cols-2 mb-6">
              <div><div className="font-bold border-b pb-1">BILL TO:</div><div className="mt-2 font-black text-lg">{inv.merchant_name}</div></div>
              <div><div className="font-bold border-b pb-1">SHIP TO:</div><div className="mt-2 font-black">{inv.customer_name}</div><p>{inv.customer_address}</p></div>
            </div>
            <table className="w-full text-left mb-6"><thead className="bg-gray-100 border-y-2 border-black"><tr><th className="p-2">Description</th><th className="p-2 text-right">Amount</th></tr></thead><tbody><tr className="border-b"><td className="p-2">Delivery Service</td><td className="p-2 text-right">{money(inv.delivery_fee)}</td></tr></tbody></table>
            <div className="flex justify-end"><div className="w-64 text-right"><div className="flex justify-between p-2 font-black text-xl border-2 border-black bg-gray-100"><span>TOTAL</span><span>{money(inv.total)}</span></div></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
