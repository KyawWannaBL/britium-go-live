import React, { useState } from 'react';
import { 
  Printer, 
  FileText, 
  ClipboardList, 
  Receipt, 
  Languages, 
  ChevronRight, 
  MonitorPrinter
} from 'lucide-react';

// --- BILINGUAL DICTIONARY ---
const dict = {
  en: {
    title: "Document Print Room",
    subtitle: "Select a document type to open its respective print studio and configure printer settings.",
    waybillTitle: "Waybill Studio",
    waybillDesc: "Standard shipping labels and barcodes for package routing.",
    invoiceTitle: "Merchant Invoice",
    invoiceDesc: "Financial settlement records for COD disbursement.",
    manifestTitle: "Route Manifest",
    manifestDesc: "Daily dispatch lists and handover sheets for Riders.",
    receiptTitle: "Cash Receipt",
    receiptDesc: "Transaction confirmations for walk-in customers.",
    openBtn: "Open Studio",
    printerReq: "Printer Spec",
    spec4x6: "4x6 (100x150mm) Thermal",
    specA4: "A4 Portrait (Default)",
    spec80mm: "80mm POS Thermal",
    langToggle: "မြန်မာဘာသာသို့ ပြောင်းမည်"
  },
  mm: {
    title: "စာရွက်စာတမ်း ပုံနှိပ်ခန်း",
    subtitle: "ပုံနှိပ်လိုသော စာရွက်စာတမ်း အမျိုးအစားကို ရွေးချယ်ပါ။ သက်ဆိုင်ရာ ပရင်တာဆက်တင်များကို ချိန်ညှိနိုင်ပါသည်။",
    waybillTitle: "ကုန်စည်ပို့ဆောင်လွှာ (Waybill)",
    waybillDesc: "ပါဆယ်ထုပ်များ ပို့ဆောင်ရန်အတွက် ဘားကုဒ်ပါရှိသော ပို့ဆောင်လွှာများ။",
    invoiceTitle: "ငွေတောင်းခံလွှာ (Invoice)",
    invoiceDesc: "ကုန်သည်များနှင့် ငွေရှင်းရန်အတွက် ဘဏ္ဍာရေး မှတ်တမ်းများ။",
    manifestTitle: "ပို့ဆောင်ရေး ခရီးစဉ်စာရင်း",
    manifestDesc: "Rider များအတွက် နေ့စဉ် ခရီးစဉ်စာရင်းနှင့် ပစ္စည်းလွှဲပြောင်းစာရွက်များ။",
    receiptTitle: "ငွေရပြေစာ (Receipt)",
    receiptDesc: "Walk-in Customer များအတွက် ငွေပေးချေမှု အတည်ပြုပြေစာ။",
    openBtn: "စတင်မည်",
    printerReq: "ပရင်တာ အမျိုးအစား",
    spec4x6: "၄x၆ လက်မ Thermal စက်",
    specA4: "A4 အရွယ်အစား (ပုံမှန်)",
    spec80mm: "80mm POS Thermal စက်",
    langToggle: "Switch to English"
  }
};

export default function DocumentPrintRoomPage({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const [lang, setLang] = useState<'en' | 'mm'>('en');
  const t = dict[lang];

  const handleNavigation = (tabId: string) => {
    if (setActiveTab) {
      setActiveTab(tabId);
    } else {
      console.log(`Navigating to ${tabId}`);
    }
  };

  const printModules = [
    {
      id: 'waybills',
      title: t.waybillTitle,
      desc: t.waybillDesc,
      icon: Printer,
      spec: t.spec4x6,
      color: "bg-blue-600",
      lightColor: "bg-blue-50 text-blue-700 border-blue-200"
    },
    {
      id: 'invoices',
      title: t.invoiceTitle,
      desc: t.invoiceDesc,
      icon: FileText,
      spec: t.specA4,
      color: "bg-emerald-600",
      lightColor: "bg-emerald-50 text-emerald-700 border-emerald-200"
    },
    {
      id: 'manifests',
      title: t.manifestTitle,
      desc: t.manifestDesc,
      icon: ClipboardList,
      spec: t.specA4,
      color: "bg-indigo-600",
      lightColor: "bg-indigo-50 text-indigo-700 border-indigo-200"
    },
    {
      id: 'receipts',
      title: t.receiptTitle,
      desc: t.receiptDesc,
      icon: Receipt,
      spec: t.spec80mm,
      color: "bg-orange-500",
      lightColor: "bg-orange-50 text-orange-700 border-orange-200"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      
      {/* Header & Language Toggle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-800 rounded-lg">
            <MonitorPrinter className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">
              {t.title}
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-lg">
              {t.subtitle}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setLang(lang === 'en' ? 'mm' : 'en')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors border border-gray-300 text-sm whitespace-nowrap"
        >
          <Languages className="w-4 h-4" />
          {t.langToggle}
        </button>
      </div>

      {/* Grid of Print Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {printModules.map((module) => {
          const Icon = module.icon;
          return (
            <div 
              key={module.id} 
              className="group bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${module.color} text-white shadow-sm`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className={`px-3 py-1 rounded-full border text-xs font-bold ${module.lightColor} flex items-center gap-1.5`}>
                    <Printer className="w-3.5 h-3.5" />
                    {t.printerReq}: {module.spec}
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {module.title}
                </h3>
                <p className="text-sm text-gray-600 min-h-[40px]">
                  {module.desc}
                </p>
              </div>

              <div className="border-t border-gray-100 p-4 bg-gray-50">
                <button 
                  onClick={() => handleNavigation(module.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-300 text-gray-800 font-bold rounded-lg group-hover:border-blue-500 group-hover:text-blue-700 transition-colors"
                >
                  {t.openBtn}
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}