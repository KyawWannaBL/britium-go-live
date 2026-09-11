// @ts-nocheck
export type Lang = 'en' | 'my';
export const LANG: Record<string, Lang> = { EN: 'en', MY: 'my' };

const dict: Record<string, Record<Lang, string>> = {};

export function t(key: string, lang: Lang = 'en'): string {
  return dict[key]?.[lang] ?? dict[key]?.['en'] ?? key;
}
