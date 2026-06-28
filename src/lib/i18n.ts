// src/i18n.ts
export type Lang = 'en' | 'my';
export const LANG: Record<string, Lang> = { EN: 'en', MY: 'my' };

const dict: Record<string, Record<Lang, string>> = {
  // Navigation
  "Dashboard": { en: "Dashboard", my: "စီမံခန့်ခွဲမှု ဗဟိုစနစ်" },
  "Analytics": { en: "Analytics", my: "စာရင်းအင်းဆိုင်ရာ အချက်အလက်များ" },
  "Exceptions": { en: "Exceptions", my: "လုပ်ငန်းလည်ပတ်မှု ပုံမှန်မဟုတ်ခြင်းများ" },
  "Dispatch Command": { en: "Dispatch Command", my: "ယာဉ်/ဝန်ထမ်း စေလွှတ်မှု ဌာန" },
  "COD Settlement": { en: "COD Settlement", my: "ငွေသားကောက်ခံမှု ရှင်းတမ်း" },
  
  // UI Actions & Buttons
  "Submit Order Picking Request": { en: "Submit Order Picking Request", my: "ပစ္စည်းကောက်ယူရန် တင်သွင်းမည်" },
  "Bulk Upload": { en: "Bulk Upload", my: "အချက်အလက် အစုလိုက် တင်သွင်းမည်" },
  "Download Report": { en: "Download Report", my: "အစီရင်ခံစာ ရယူမည်" },
  "Secure Sign In": { en: "Secure Sign In", my: "လုံခြုံစွာ ဝင်ရောက်မည်" },
  "Sign Out": { en: "Sign Out", my: "ထွက်ခွာမည်" },
  
  // Form Labels
  "Merchant / Customer": { en: "Merchant / Customer", my: "ကုန်သည် / ဝယ်ယူသူ" },
  "Pickup Address": { en: "Pickup Address", my: "ပစ္စည်းကောက်ယူမည့် လိပ်စာ" },
  "Expected Parcels": { en: "Expected Parcels", my: "မျှော်မှန်း ပစ္စည်းအရေအတွက်" },
  "Vehicle Required": { en: "Vehicle Required", my: "လိုအပ်သော သယ်ယူပို့ဆောင်ရေးယာဉ်" },
  "Remark / Special Instruction": { en: "Remark / Special Instruction", my: "မှတ်ချက် / အထူးညွှန်ကြားချက်" },
  
  // Statuses
  "Submitting...": { en: "Submitting...", my: "အချက်အလက်များ ပေးပို့နေသည်..." },
  "Loading...": { en: "Loading...", my: "အချက်အလက်များ ရယူနေသည်..." },
  "Pickup request failed.": { en: "Pickup request failed.", my: "ပစ္စည်းကောက်ယူရန် တောင်းဆိုမှု မအောင်မြင်ပါ။" },
};

export function t(key: string, lang: Lang = 'en'): string {
  return dict[key]?.[lang] ?? dict[key]?.['en'] ?? key;
}