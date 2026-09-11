import { createContext, useContext, useState, ReactNode } from 'react'

// ─── Language types ────────────────────────────────────────────────────────────
export type LangCode = 'en' | 'mm'

// ─── Translation dictionary ───────────────────────────────────────────────────
const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
  en: {
    // ── Navigation groups
    'nav.dashboard': 'Dashboard',
    'nav.group.ops': 'Operations',
    'nav.group.portals': 'Portals',
    'nav.group.finance': 'Finance',
    'nav.group.data': 'Data',
    'nav.group.data_entry': 'Data Entry',
    'nav.group.field': 'Field',
    'nav.group.commerce': 'Commerce',
    'nav.group.admin': 'Admin / HR',
    'nav.group.command': 'Command',
    // ── Navigation items
    'nav.supervisor': 'Supervisor',
    'nav.ops_manager': 'Ops Manager',
    'nav.dispatch': 'Dispatch',
    'nav.delivery_dispatch': 'Delivery Dispatch',
    'nav.warehouse': 'Warehouse',
    'nav.branch_office': 'Branch Office',
    'nav.merchant': 'Merchant',
    'nav.customer': 'Customer',
    'nav.customer_service': 'Customer Service',
    'nav.finance': 'Finance',
    'nav.invoice_studio': 'Invoice Studio',
    'nav.workforce_commission': 'Workforce Commission',
    'nav.cod_settlement': 'COD Settlement',
    'nav.master_data': 'Master Data',
    'nav.analytics': 'Analytics',
    'nav.delivery_workflow': 'Delivery Workflow',
    'nav.data_entry': 'Data Entry',
    'nav.waybill_studio': 'Waybill Studio',
    'nav.wayplan_zone': 'Wayplan Zone',
    'nav.pickup_form': 'Pickup Form',
    'nav.exceptions': 'Exceptions',
    'nav.rider': 'Rider',
    'nav.driver': 'Driver',
    'nav.marketing': 'Marketing',
    'nav.biz_dev': 'Business Development',
    'nav.tariff': 'Tariff',
    'nav.admin_hr': 'HR Portal',
    'nav.audit_logs': 'Audit Logs',
    'nav.accounts': 'Accounts',
    'nav.profile': 'Profile',
    'nav.ops_command': 'Ops Command',
    'nav.executive_ops': 'Executive Ops',
    'nav.branch_admin': 'Branch Admin',
    'nav.settings': 'Settings',
    'nav.collapse': 'Collapse',
    'nav.sign_out': 'Sign Out',
    // ── Commission page
    'commission.title': 'Workforce Commission',
    'commission.subtitle': 'Commission budget for all operational activities.',
    'commission.total': 'Total Commission',
    'commission.records': 'Commission Records',
    'commission.rate_ref': 'Commission Rate Reference',
    'commission.activity': 'Activity',
    'commission.rider': 'Rider',
    'commission.driver': 'Driver',
    'commission.helper': 'Helper',
    'commission.date': 'Date',
    'commission.staff': 'Staff',
    'commission.role': 'Role',
    'commission.amount': 'Commission (MMK)',
    'commission.no_records': 'No commission records found.',
    'commission.filter.all': 'All',
    // ── Pickup form
    'pickup.title': 'Pickup Request Form',
    'pickup.subtitle': 'Create a new pickup order.',
    'pickup.merchant': 'Merchant',
    'pickup.sender_phone': 'Sender Phone',
    'pickup.pickup_address': 'Pickup Address',
    'pickup.pickup_township': 'Pickup Township',
    'pickup.recipient_name': 'Recipient Name',
    'pickup.recipient_phone': 'Recipient Phone',
    'pickup.delivery_township': 'Delivery Township',
    'pickup.delivery_address': 'Delivery Address',
    'pickup.payment_method': 'Payment Method',
    'pickup.cod_amount': 'COD Amount (MMK)',
    'pickup.service_type': 'Service Type',
    'pickup.priority': 'Priority',
    'pickup.submit': 'Submit Pickup Request',
    // ── Common
    'common.loading': 'Loading…',
    'common.refresh': 'Refresh',
    'common.search': 'Search...',
    'common.super_admin': 'Super Admin',
    'common.all': 'All',
    'common.filter': 'Filter',
    'common.no_data': 'No data available.',
    'common.records': 'records',
    'common.active': 'Active',
    'common.inactive': 'Inactive',
    'common.status': 'Status',
    'common.actions': 'Actions',
  },

  mm: {
    // ── Navigation groups
    'nav.dashboard': 'ဒက်ရှ်ဘုတ်',
    'nav.group.ops': 'လုပ်ငန်းဆောင်ရွက်မှု',
    'nav.group.portals': 'ဝင်ပေါက်များ',
    'nav.group.finance': 'ငွေကြေး',
    'nav.group.data': 'ဒေတာ',
    'nav.group.data_entry': 'ဒေတာထည့်သွင်းမှု',
    'nav.group.field': 'လယ်မြေ',
    'nav.group.commerce': 'ကူးသန်းရောင်းဝယ်',
    'nav.group.admin': 'စီမံခန့်ခွဲမှု / HR',
    'nav.group.command': 'ထိန်းချုပ်ရေး',
    // ── Navigation items
    'nav.supervisor': 'ကြီးကြပ်ရေးမှူး',
    'nav.ops_manager': 'လုပ်ငန်းမန်နေဂျာ',
    'nav.dispatch': 'ပေးပို့ချက်',
    'nav.delivery_dispatch': 'ပို့ဆောင်ပေးပို့မှု',
    'nav.warehouse': 'ကုန်သိုလှောင်ရုံ',
    'nav.branch_office': 'ဌာနခွဲ',
    'nav.merchant': 'ကုန်သည်',
    'nav.customer': 'ဖောက်သည်',
    'nav.customer_service': 'ဖောက်သည်ဝန်ဆောင်မှု',
    'nav.finance': 'ငွေကြေး',
    'nav.invoice_studio': 'မေတ္တာရပ်ခံလွှာ',
    'nav.workforce_commission': 'လုပ်သားကော်မရှင်',
    'nav.cod_settlement': 'COD ရှင်းလင်းမှု',
    'nav.master_data': 'မာစတာဒေတာ',
    'nav.analytics': 'ခွဲခြမ်းစိတ်ဖြာမှု',
    'nav.delivery_workflow': 'ပို့ဆောင်ရေးလုပ်ငန်းစဉ်',
    'nav.data_entry': 'ဒေတာထည့်သွင်းမှု',
    'nav.waybill_studio': 'လမ်းပြချိတ်',
    'nav.wayplan_zone': 'လမ်းကြောင်းစီစဉ်မှု',
    'nav.pickup_form': 'ကုန်ကောက်ယူမှုဖောင်',
    'nav.exceptions': 'ခြွင်းချက်များ',
    'nav.rider': 'ဆိုင်ကယ်စီး',
    'nav.driver': 'ယာဉ်မောင်း',
    'nav.marketing': 'စျေးကွက်ရှာဖွေမှု',
    'nav.biz_dev': 'စီးပွားဖွံ့ဖြိုးတိုးတက်ရေး',
    'nav.tariff': 'ကုန်ခနှုန်း',
    'nav.admin_hr': 'HR ပေါ်တယ်',
    'nav.audit_logs': 'စစ်ဆေးမှတ်တမ်း',
    'nav.accounts': 'အကောင့်များ',
    'nav.profile': 'ပရိုဖိုင်',
    'nav.ops_command': 'လုပ်ငန်းထိန်းချုပ်ရေး',
    'nav.executive_ops': 'အမှုဆောင်ဆောင်ရွက်မှု',
    'nav.branch_admin': 'ဌာနခွဲစီမံခန့်ခွဲမှု',
    'nav.settings': 'ဆက်တင်များ',
    'nav.collapse': 'ချုံ့မည်',
    'nav.sign_out': 'ထွက်မည်',
    // ── Commission page
    'commission.title': 'လုပ်သားကော်မရှင်',
    'commission.subtitle': 'လုပ်ငန်းဆောင်ရွက်မှုများအတွက် ကော်မရှင်ကြွေးမြီ။',
    'commission.total': 'စုစုပေါင်းကော်မရှင်',
    'commission.records': 'ကော်မရှင်မှတ်တမ်းများ',
    'commission.rate_ref': 'ကော်မရှင်နှုန်းထားကိုးကားချက်',
    'commission.activity': 'လုပ်ဆောင်မှု',
    'commission.rider': 'ဆိုင်ကယ်စီး',
    'commission.driver': 'ယာဉ်မောင်း',
    'commission.helper': 'အကူ',
    'commission.date': 'နေ့စွဲ',
    'commission.staff': 'ဝန်ထမ်း',
    'commission.role': 'နေရာ',
    'commission.amount': 'ကော်မရှင် (ကျပ်)',
    'commission.no_records': 'ကော်မရှင်မှတ်တမ်းမတွေ့ပါ။',
    'commission.filter.all': 'အားလုံး',
    // ── Pickup form
    'pickup.title': 'ကုန်ကောက်ယူမှုတောင်းဆိုလွှာ',
    'pickup.subtitle': 'ကုန်ကောက်ယူမှုအမိန့်သစ်တစ်ခုဖန်တီးပါ။',
    'pickup.merchant': 'ကုန်သည်',
    'pickup.sender_phone': 'ပို့သူဖုန်းနံပါတ်',
    'pickup.pickup_address': 'ကောက်ယူမည့်လိပ်စာ',
    'pickup.pickup_township': 'ကောက်ယူမည့်မြို့နယ်',
    'pickup.recipient_name': 'လက်ခံသူအမည်',
    'pickup.recipient_phone': 'လက်ခံသူဖုန်းနံပါတ်',
    'pickup.delivery_township': 'ပို့ဆောင်မည့်မြို့နယ်',
    'pickup.delivery_address': 'ပို့ဆောင်မည့်လိပ်စာ',
    'pickup.payment_method': 'ငွေပေးချေမှုနည်းလမ်း',
    'pickup.cod_amount': 'COD ပမာဏ (ကျပ်)',
    'pickup.service_type': 'ဝန်ဆောင်မှုအမျိုးအစား',
    'pickup.priority': 'ဦးစားပေးမှုအဆင့်',
    'pickup.submit': 'ကုန်ကောက်ယူမှုတင်ပြမည်',
    // ── Common
    'common.loading': 'ဖတ်ရှုနေသည်...',
    'common.refresh': 'ပြန်လည်ဆွဲထုတ်မည်',
    'common.search': 'ရှာဖွေမည်...',
    'common.super_admin': 'ထိပ်တန်းစီမံ',
    'common.all': 'အားလုံး',
    'common.filter': 'စစ်ထုတ်မည်',
    'common.no_data': 'ဒေတာမရှိပါ။',
    'common.records': 'မှတ်တမ်း',
    'common.active': 'တက်ကြွ',
    'common.inactive': 'ရပ်ဆိုင်း',
    'common.status': 'အခြေအနေ',
    'common.actions': 'လုပ်ဆောင်ချက်',
  },
}

// ─── Context ───────────────────────────────────────────────────────────────────
interface I18nContext {
  lang: LangCode
  toggleLang: () => void
  t: (key: string, fallback?: string) => string
}

const Context = createContext<I18nContext>({
  lang: 'en',
  toggleLang: () => {},
  t: (key) => key,
})

// ─── Provider ──────────────────────────────────────────────────────────────────
export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('be_lang') : null) as LangCode | null
  const [lang, setLang] = useState<LangCode>(stored === 'mm' ? 'mm' : 'en')

  const toggleLang = () => {
    setLang(prev => {
      const next: LangCode = prev === 'en' ? 'mm' : 'en'
      try { localStorage.setItem('be_lang', next) } catch { /* ignore */ }
      return next
    })
  }

  const t = (key: string, fallback?: string): string => {
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS['en'][key] ?? fallback ?? key
  }

  return <Context.Provider value={{ lang, toggleLang, t }}>{children}</Context.Provider>
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useLanguage() {
  return useContext(Context)
}
