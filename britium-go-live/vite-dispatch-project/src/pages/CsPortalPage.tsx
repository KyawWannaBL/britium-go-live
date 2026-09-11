import React, { useState, useEffect } from "react";
import { Headphones, Search, MessageSquare, Globe2, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const T = {
  en: { title: "Customer Service Portal", subtitle: "Manage tickets, inquiries, and customer communications." },
  my: { title: "ဖောက်သည်ဝန်ဆောင်မှု Portal", subtitle: "စုံစမ်းမေးမြန်းမှုများနှင့် တိုင်ကြားစာများကို စီမံရန်။" }
};

export default function CsPortalPage() {
  const { language } = useLanguage() as { language?: string };
  const [activeLang, setActiveLang] = useState<"en" | "my">((language === "my" || language === "mm") ? "my" : "en");
  
  useEffect(() => {
    const handleLangChange = (e: any) => setActiveLang(e.detail === "my" || e.detail === "mm" ? "my" : "en");
    window.addEventListener('app-lang-change', handleLangChange);
    return () => window.removeEventListener('app-lang-change', handleLangChange);
  }, []);

  const t = T[activeLang];
  const [search, setSearch] = useState(""); // Ensures safe onChange handler

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif] p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <header className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl flex justify-between items-center shadow-xl">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-3 text-white"><Headphones className="text-[#f6b84b]"/> {t.title}</h1>
            <p className="text-[#4d7a9b] text-sm mt-1 font-bold">{t.subtitle}</p>
          </div>
          <button className="bg-[#123456] hover:bg-[#1a3a5c] text-[#f6b84b] px-4 py-2 rounded-xl text-xs font-black border border-[#254b73]" onClick={() => setActiveLang(activeLang === "en" ? "my" : "en")}>
             <Globe2 size={16} className="inline mr-1"/> {activeLang === "en" ? "MM" : "EN"}
          </button>
        </header>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
          <div className="relative max-w-md mb-8">
            <Search className="absolute left-4 top-3.5 text-[#4d7a9b] h-5 w-5" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)} // Safe handler to prevent "e is not a function"
              placeholder="Search by Tracking No or Customer Phone..."
              className="bg-white !text-[#061524] border-2 border-[#1a3a5c] rounded-xl px-12 py-3 text-[14px] font-black w-full outline-none focus:border-[#f6b84b] focus:ring-2 focus:ring-[#f6b84b]/30 transition-all placeholder:text-gray-400"
            />
          </div>

          <div className="border-2 border-[#1a3a5c] bg-[#061524] rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
             <MessageSquare size={48} className="text-[#1a3a5c] mb-4"/>
             <div className="text-[#4ea8de] font-bold text-lg">No Active Tickets</div>
             <p className="text-[#4d7a9b] text-sm mt-2 max-w-md">Search for a tracking number to open a new ticket or view past communications.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
