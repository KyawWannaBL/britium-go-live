import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type LanguageCode = "en" | "my";

type LanguageSetter =
  | LanguageCode
  | "EN"
  | "MY"
  | "MM"
  | ((previous: LanguageCode) => unknown);

export type LanguageContextValue = {
  lang: LanguageCode;
  language: LanguageCode;
  currentLanguage: LanguageCode;
  setLang: (value: LanguageSetter) => void;
  setLanguage: (value: LanguageSetter) => void;
  setCurrentLanguage: (value: LanguageSetter) => void;
  toggleLang: () => void;
  toggleLanguage: () => void;
  t: <T = React.ReactNode>(english: T, myanmar?: T) => T;
};

function normalizeLanguage(value: unknown): LanguageCode {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "my" ||
    normalized === "mm" ||
    normalized === "burmese" ||
    normalized === "myanmar"
  ) {
    return "my";
  }

  return "en";
}

const fallbackValue: LanguageContextValue = {
  lang: "en",
  language: "en",
  currentLanguage: "en",
  setLang: () => undefined,
  setLanguage: () => undefined,
  setCurrentLanguage: () => undefined,
  toggleLang: () => undefined,
  toggleLanguage: () => undefined,
  t: (english) => english,
};

export const LanguageContext =
  createContext<LanguageContextValue>(fallbackValue);

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [languageState, setLanguageState] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") return "en";

    return normalizeLanguage(
      window.localStorage.getItem("britium_language") ||
        window.localStorage.getItem("be_language") ||
        "en",
    );
  });

  const setAnyLanguage = useCallback((next: LanguageSetter) => {
    setLanguageState((previous) => {
      const resolved =
        typeof next === "function" ? next(previous) : next;

      return normalizeLanguage(resolved);
    });
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((previous) =>
      previous === "en" ? "my" : "en",
    );
  }, []);

  const t = useCallback(
    <T,>(english: T, myanmar?: T): T =>
      languageState === "my" && myanmar !== undefined
        ? myanmar
        : english,
    [languageState],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "britium_language",
        languageState,
      );
      window.localStorage.setItem("be_language", languageState);
    } catch {
      // Storage may be unavailable in private browser sessions.
    }
  }, [languageState]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang: languageState,
      language: languageState,
      currentLanguage: languageState,
      setLang: setAnyLanguage,
      setLanguage: setAnyLanguage,
      setCurrentLanguage: setAnyLanguage,
      toggleLang: toggleLanguage,
      toggleLanguage,
      t,
    }),
    [languageState, setAnyLanguage, toggleLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) || fallbackValue;
}

export default LanguageContext;
