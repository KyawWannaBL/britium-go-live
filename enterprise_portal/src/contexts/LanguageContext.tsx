// @ts-nocheck
import { createContext, useContext, useState, ReactNode } from 'react';

export type Lang = 'en' | 'my';

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; toggle: () => void; }

const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => {}, toggle: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState(p => p === 'en' ? 'my' : 'en');
  return <LangContext.Provider value={{ lang, setLang, toggle }}>{children}</LangContext.Provider>;
}

export function useLanguage() { return useContext(LangContext); }

export { LangContext };
