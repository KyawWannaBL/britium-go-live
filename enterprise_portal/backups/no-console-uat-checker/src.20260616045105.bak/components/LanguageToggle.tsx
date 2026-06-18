import React, { useEffect, useState } from "react";

export type BritiumLang = "en" | "mm";

export function getBritiumLang(): BritiumLang {
  const stored = localStorage.getItem("be_lang");
  return stored === "mm" ? "mm" : "en";
}

export function translate(lang: BritiumLang, en: string, mm?: string) {
  return lang === "mm" ? mm || en : en;
}

export default function LanguageToggle() {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());

  useEffect(() => {
    localStorage.setItem("be_lang", lang);
    window.dispatchEvent(new CustomEvent("be-language-change", { detail: { lang } }));
  }, [lang]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
      <button type="button" onClick={() => setLang("en")} style={{ padding: "7px 10px", opacity: lang === "en" ? 1 : 0.55 }}>EN</button>
      <button type="button" onClick={() => setLang("mm")} style={{ padding: "7px 10px", opacity: lang === "mm" ? 1 : 0.55 }}>MM</button>
    </div>
  );
}
