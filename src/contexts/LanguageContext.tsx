import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Language = 'en' | 'my';

type LanguageContextValue = {
  lang: Language;
  setLanguage: (lang: Language) => void;
  toggleLang: () => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return saved === 'my' ? 'my' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('app-language', lang);
  }, [lang]);

  const setLanguage = (next: Language) => {
    setLang(next);
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'my' : 'en'));
  };

  const value = useMemo(
    () => ({
      lang,
      setLanguage,
      toggleLang,
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}