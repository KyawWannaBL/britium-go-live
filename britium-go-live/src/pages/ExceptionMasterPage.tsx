import React, { useState, useEffect } from "react";
import { ShieldAlert, AlertTriangle, RefreshCw, Globe2, FileEdit } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const T = {
  en: { title: "Exception Master", subtitle: "Global view of failed deliveries, RTOs, and operational blocks." },
  my: { title: "Exception ဗဟိုထိန်းချုပ်မှု", subtitle: "မအောင်မြင်သော ပို့ဆောင်မှုများနှင့် ပြဿနာများကို စီမံရန်။" }
};

export default function ExceptionMasterPage() {
  const { language } = useLanguage() as { language?: string };
  const [activeLang, setActiveLang] = useState<"en" | "my">((language === "my" || language === "mm") ? "my" : "en");
  
  useEffect(() => {
    const handleLangChange = (e: any) => setActiveLang(e.detail === "my" || e.detail === "mm" ? "my" : "en");
    window.addEventListener('app-lang-change', handleLangChange);
    return () => window.removeEventListener('app-lang-change', handleLangChange);
  }, []);

  const t = T[activeLang];

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif] p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <header className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl flex justify-between items-center shadow-xl">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-3 text-white"><ShieldAlert className="text-rose-500"/> {t.title}</h1>
            <p className="text-[#4d7a9b] text-sm mt-1 font-bold">{t.subtitle}</p>
          </div>
          <button className="bg-[#123456] hover:bg-[#1a3a5c] text-[#f6b84b] px-4 py-2 rounded-xl text-xs font-black border border-[#254b73]" onClick={() => setActiveLang(activeLang === "en" ? "my" : "en")}>
             <Globe2 size={16} className="inline mr-1"/> {activeLang === "en" ? "MM" : "EN"}
          </button>
        </header>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white">Resolution Board</h2>
            <button className="bg-[#0b2236] border-2 border-[#1a3a5c] text-[#4ea8de] font-black uppercase px-4 py-2 rounded-xl text-[12px] hover:border-[#f6b84b] hover:text-[#f6b84b] transition-all flex items-center gap-2">
              <RefreshCw size={14}/> Sync Data
            </button>
          </div>
          <div className="border-2 border-rose-900/30 bg-[#061524] rounded-2xl p-10 flex flex-col items-center justify-center text-center h-[350px]">
             <AlertTriangle size={48} className="text-rose-900 mb-4"/>
             <div className="text-rose-400 font-bold text-lg">No Pending Exceptions</div>
             <p className="text-[#4d7a9b] text-sm mt-2 max-w-sm">All operations are currently running smoothly with no reported blocks or RTOs.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
