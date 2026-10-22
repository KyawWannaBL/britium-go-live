import { UserCog } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import AccountAccessPanel from '@/components/accounts/AccountAccessPanel';
export default function AccountsPage(){
 const {t}=useLanguage();
 return <main className="space-y-5 text-[#eef8ff]">
  <header className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h1 className="flex items-center gap-3 text-lg font-bold text-[#f6b84b]"><UserCog size={22}/>{t('Account Management','အကောင့် စီမံခန့်ခွဲမှု')}</h1><p className="mt-2 text-sm text-[#9cc2d9]">Create linked sign-in accounts, edit contact details, reset passwords and manage login access.</p></header>
  <AccountAccessPanel defaultOpen/>
 </main>;
}
