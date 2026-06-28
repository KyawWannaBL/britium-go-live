import React, { useState } from 'react';
import { Printer, FileText, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// --- MOCK INVOICE DATA ---
const invoiceData = {
  invoiceNumber: "INV-20260628-001",
  date: "2026-06-28",
  merchant: {
    name: "Baby Genius",
    phone: "09-796239153",
    address: "ဒဂုံမြို့သစ်အရှေ့ပိုင်း, Yangon"
  },
  items: [
    { id: "D0627-BBG-015", recipient: "Ma Htet Htet", destination: "Dawbon", weight: "5 kg", cod: 79000, deliFee: 3000 },
    { id: "D0627-BBG-016", recipient: "Ko Aung", destination: "Kamayut", weight: "2 kg", cod: 45000, deliFee: 2500 },
    { id: "D0627-BBG-017", recipient: "Daw Su Su", destination: "Insein", weight: "1 kg", cod: 0, deliFee: 2500 },
    { id: "D0627-BBG-018", recipient: "Kyaw Kyaw", destination: "Hlaing", weight: "3.5 kg", cod: 120000, deliFee: 3000 },
  ]
};

// --- TRANSLATIONS DICTIONARY ---
const TRANSLATIONS = {
  en: {
    studioTitle: "Native Invoice Studio",
    printInstruction: "Ensure printer is set to A4 Portrait with Default or Minimum margins.",
    printBtn: "Print Invoice",
    serviceDesc: "Delivery Service",
    hotline: "Hotline",
    location: "Yangon, Myanmar",
    invoiceDoc: "INVOICE",
    invNo: "Invoice No:",
    date: "Date:",
    billTo: "Settlement For / Bill To:",
    thNo: "No.",
    thWaybill: "Waybill ID",
    thRecipient: "Recipient / Dest.",
    thCod: "COD (MMK)",
    thFee: "Deli Fee (MMK)",
    totalCod: "Total COD Collected:",
    totalFee: "Total Delivery Fees:",
    netSettlement: "Net Settlement:",
    prepBy: "Prepared By",
    finDept: "Britium Finance Dept.",
    merchSig: "Merchant Signature",
    recvBy: "Received By",
    footerMsg: "Thank you for choosing Britium Express. For any billing inquiries, please contact our hotline.",
    generated: "Generated:"
  },
  mm: {
    studioTitle: "ပြေစာထုတ်ယူရန်စနစ်",
    printInstruction: "ပရင်တာကို A4 Portrait နှင့် Default/Minimum margin ထား၍ ပရင့်ထုတ်ပါ။",
    printBtn: "ပြေစာ ပရင့်ထုတ်မည်",
    serviceDesc: "ပို့ဆောင်ရေး ဝန်ဆောင်မှု",
    hotline: "ဆက်သွယ်ရန်",
    location: "ရန်ကုန်, မြန်မာ",
    invoiceDoc: "ပြေစာ",
    invNo: "ပြေစာအမှတ်:",
    date: "နေ့စွဲ:",
    billTo: "ငွေပေးချေရန် / လက်ခံမည့်သူ:",
    thNo: "စဉ်",
    thWaybill: "လမ်းညွှန်အမှတ်",
    thRecipient: "လက်ခံမည့်သူ / နေရာ",
    thCod: "ကောက်ခံငွေ (ကျပ်)",
    thFee: "ပို့ဆောင်ခ (ကျပ်)",
    totalCod: "စုစုပေါင်း ကောက်ခံငွေ:",
    totalFee: "စုစုပေါင်း ပို့ဆောင်ခ:",
    netSettlement: "ရှင်းပေးရမည့် ငွေကျပ်:",
    prepBy: "ပြင်ဆင်သူ",
    finDept: "ဘရစ်တီယမ် ဘဏ္ဍာရေးဌာန",
    merchSig: "ကုန်သည် လက်မှတ်",
    recvBy: "လက်ခံသူ",
    footerMsg: "ဘရစ်တီယမ် အမြန်ပို့ဆောင်ရေးကို ရွေးချယ်သည့်အတွက် ကျေးဇူးတင်ပါသည်။ ငွေစာရင်းဆိုင်ရာ မေးမြန်းလိုပါက ဆက်သွယ်နိုင်ပါသည်။",
    generated: "ထုတ်ယူသည့်အချိန်:"
  }
};

export default function InvoicePrintStudioPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[(lang || 'en').toLowerCase() as 'en' | 'mm'] || TRANSLATIONS.en;

  const handlePrint = () => {
    window.print();
  };

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'mm' : 'en');
  };

  // Calculate Totals
  const totalCOD = invoiceData.items.reduce((sum, item) => sum + item.cod, 0);
  const totalDeliFee = invoiceData.items.reduce((sum, item) => sum + item.deliFee, 0);
  const netPayableToMerchant = totalCOD - totalDeliFee;

  return (
    <div style={{ minHeight: '100vh', background: '#061524', color: '#eef8ff', fontFamily: "'Poppins', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }} className="print:py-0 print:bg-white print:text-black">
      
      {/* GLOBAL PRINT STYLES - Protects the exact A4 dimension mapping */}
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: A4 portrait; margin: 0; }
        @media print {
            body { background: white !important; margin: 0; padding: 0; color: black !important; }
            .no-print { display: none !important; }
            .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .invoice-page { box-shadow: none !important; border: none !important; margin: 0 !important; }
            * { color: black !important; }
        }
      `}} />

      {/* HEADER / CONTROLS (Hidden during printing) */}
      <div className="no-print w-full max-w-2xl mb-8 text-center p-6 rounded-xl shadow-md border" style={{ background: '#0b2236', borderColor: '#1a3a5c' }}>
        {/* Language Toggle Button */}
        <button 
          onClick={toggleLanguage}
          style={{ position: 'absolute', top: 40, right: 40, display: 'flex', alignItems: 'center', gap: 8, background: '#081b2e', color: '#eef8ff', border: '1px solid #1a3a5c', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}
          className="hover:bg-[#0f2a42] transition"
        >
          <Globe size={16} />
          {lang === 'en' ? 'မြန်မာ' : 'English'}
        </button>

        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f6b84b', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <FileText size={24} color="#38bdf8" /> {t.studioTitle}
        </h2>
        <p style={{ fontSize: 14, color: '#c8dff0', marginBottom: 24 }}>
          {lang === 'en' ? (
            <>Ensure printer is set to <strong style={{color:'#fff'}}>A4 Portrait</strong> with <strong style={{color:'#fff'}}>Default or Minimum</strong> margins.</>
          ) : (
            <>{t.printInstruction}</>
          )}
        </p>
        <button 
          onClick={handlePrint} 
          style={{ background: '#f6b84b', color: '#061524', padding: '12px 24px', borderRadius: 10, fontWeight: 700, width: '100%', maxWidth: 320, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", fontSize: 15 }}
          className="shadow hover:bg-[#d49a36] transition"
        >
          <Printer size={18} />
          {t.printBtn}
        </button>
      </div>

      {/* --- INVOICE A4 PAGE --- */}
      <div className="invoice-page print-exact" style={{ width: '210mm', minHeight: '297mm', background: 'white', color: 'black', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', padding: '20mm', boxSizing: 'border-box', position: 'relative' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1f2937', paddingBottom: 24, marginBottom: 32 }}>
          {/* Logo & Company Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="print-exact" style={{ width: 60, height: 60, borderRadius: '50%', background: '#1e3a8a', color: 'white', fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              B
            </div>
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '0.05em', color: '#111827', lineHeight: 1, margin: '0 0 4px 0' }}>BRITIUM EXPRESS</h1>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px 0' }}>{t.serviceDesc}</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t.hotline}: 09 - 897 44 77 44</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t.location}</p>
            </div>
          </div>

          {/* Invoice Meta */}
          <div style={{ textAlign: 'right' }}>
            <h2 className="print-exact" style={{ fontSize: 36, fontWeight: 900, color: '#e5e7eb', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>{t.invoiceDoc}</h2>
            <div style={{ fontSize: 14 }}>
              <p style={{ margin: '0 0 4px 0' }}><span style={{ fontWeight: 600, color: '#4b5563' }}>{t.invNo}</span> <span style={{ fontWeight: 700 }}>{invoiceData.invoiceNumber}</span></p>
              <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#4b5563' }}>{t.date}</span> <span style={{ fontWeight: 700 }}>{invoiceData.date}</span></p>
            </div>
          </div>
        </div>

        {/* BILL TO */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>{t.billTo}</h3>
          <div className="print-exact" style={{ background: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#111827', margin: 0 }}>{invoiceData.merchant.name}</p>
            <p style={{ fontSize: 14, color: '#374151', margin: '4px 0 0 0' }}>{invoiceData.merchant.phone}</p>
            <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>{invoiceData.merchant.address}</p>
          </div>
        </div>

        {/* ITEMS TABLE */}
        <div style={{ flex: 1 }}>
          <table style={{ width: '100%', fontSize: 14, textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="print-exact" style={{ background: '#f3f4f6', borderTop: '2px solid #1f2937', borderBottom: '2px solid #1f2937' }}>
                <th style={{ padding: '12px 8px', fontWeight: 700, color: '#111827' }}>{t.thNo}</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, color: '#111827' }}>{t.thWaybill}</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, color: '#111827' }}>{t.thRecipient}</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{t.thCod}</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{t.thFee}</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item, index) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 8px', color: '#4b5563' }}>{index + 1}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 600, fontFamily: 'monospace' }}>{item.id}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{item.recipient}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{item.destination} ({item.weight})</div>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 500, color: '#111827' }}>{item.cod.toLocaleString()}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4b5563' }}>{item.deliFee.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TOTALS SECTION */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32, borderTop: '2px solid #1f2937', paddingTop: 24 }}>
          <div style={{ width: '50%', minWidth: 250 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontWeight: 600, color: '#4b5563' }}>{t.totalCod}</span>
              <span style={{ fontWeight: 700 }}>{totalCOD.toLocaleString()} MMK</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontWeight: 600, color: '#4b5563' }}>{t.totalFee}</span>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>- {totalDeliFee.toLocaleString()} MMK</span>
            </div>
            <div className="print-exact" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4 }}>
              <span style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 18 }}>{t.netSettlement}</span>
              <span style={{ fontWeight: 900, color: '#1e3a8a', fontSize: 18 }}>{netPayableToMerchant.toLocaleString()} MMK</span>
            </div>
          </div>
        </div>

        {/* FOOTER & SIGNATURES */}
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 14 }}>
          <div style={{ width: '33%', textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #1f2937', height: 32, marginBottom: 8 }}></div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 4px 0' }}>{t.prepBy}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t.finDept}</p>
          </div>
          <div style={{ width: '33%', textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #1f2937', height: 32, marginBottom: 8 }}></div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 4px 0' }}>{t.merchSig}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t.recvBy}</p>
          </div>
        </div>

        {/* FOOTNOTE */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
          <p style={{ margin: '0 0 4px 0' }}>{t.footerMsg}</p>
          <p style={{ margin: 0 }}>{t.generated} {new Date().toLocaleString()}</p>
        </div>

      </div>
    </div>
  );
}