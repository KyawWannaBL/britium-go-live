import React, { createContext, useContext, useState, useEffect } from 'react';

type Lang = "en" | "my";

interface LanguageContextType {
  language: Lang;
  setLanguage: (lang: Lang) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage or default to 'en'
  const [language, setLanguageState] = useState<Lang>(() => {
    const savedLang = localStorage.getItem('app_language');
    return (savedLang === 'my' || savedLang === 'en') ? savedLang : 'en';
  });

  const setLanguage = (lang: Lang) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "my" : "en");
  };

  // Keep localStorage in sync if it changes in another tab
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'app_language' && (e.newValue === 'en' || e.newValue === 'my')) {
        setLanguageState(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
