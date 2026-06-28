import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'mm';

interface LanguageContextType {
  lang: Language;
  toggleLang: () => void;
  t: (en: string, mm: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'mm',
  toggleLang: () => {},
  t: (en, mm) => mm
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('mm');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('be_sys_lang') as Language;
      if (saved === 'en' || saved === 'mm') setLang(saved);
    } catch(e) {}
  }, []);

  const toggleLang = () => {
    const next = lang === 'en' ? 'mm' : 'en';
    setLang(next);
    try { localStorage.setItem('be_sys_lang', next); } catch (e) {}
  };

  const t = (en: string, mm: string) => (lang === 'en' ? en : mm);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);