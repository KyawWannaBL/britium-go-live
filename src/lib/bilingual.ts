import { useLanguage } from '@/hooks/useLanguage';

export function useBilingual() {
  const { language, setLanguage, t } = useLanguage();

  const bt = (en: string, mm: string) => {
    return language === 'mm' ? mm : en;
  };

  return {
    language,
    setLanguage,
    t,
    bt,
  };
}
