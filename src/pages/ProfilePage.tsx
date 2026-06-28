import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/auth';

export default function ProfilePage() {
  const { t } = useLanguage();
  const auth = useAuth() as any;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('PROFILE', 'ကိုယ်ရေးအချက်အလက်')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('User identity, contact details, and credential management.', 'ကိုယ်ရေးအချက်အလက်များနှင့် စကားဝှက်များကို ပြင်ဆင်ပါ။')}</p>
        </div>
        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-full text-[11px] uppercase tracking-widest font-bold">
          {t('AUTHENTICATED USER', 'အတည်ပြုပြီး အကောင့်')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 rounded-full border-2 border-[#f6b84b] flex items-center justify-center text-3xl text-[#f6b84b] mb-4 bg-[#1a3a5c]">S</div>
          <h2 className="text-[#eef8ff] text-[18px] mb-1">sai</h2>
          <p className="text-[#4d7a9b] text-[13px] mb-4">{auth?.user?.email || 'sai@britiumexpress.com'}</p>
          <span className="bg-[#1a3a5c] text-[#4ea8de] px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest">SUPER ADMIN</span>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-6 border-b border-[#1a3a5c] pb-4">{t('Profile Information', 'ကိုယ်ရေးအချက်အလက်')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('DISPLAY NAME', 'အမည်')}</label><input defaultValue="sai" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none" /></div>
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('EMAIL ADDRESS', 'အီးမေးလ်')}</label><input readOnly value={auth?.user?.email || 'sai@britiumexpress.com'} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#4d7a9b] p-3 rounded-xl outline-none cursor-not-allowed" /></div>
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('PHONE', 'ဖုန်း')}</label><input defaultValue="+95-9-..." className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none" /></div>
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('DEPARTMENT', 'ဌာန')}</label><input className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none" /></div>
            </div>
            <button className="bg-[#f6b84b] text-[#061524] px-6 py-2.5 rounded-xl text-[13px] uppercase tracking-wider hover:bg-[#e5a93a] transition-colors font-medium">{t('Save Changes', 'သိမ်းဆည်းမည်')}</button>
          </div>

          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-6 border-b border-[#1a3a5c] pb-4">{t('Change Password', 'စကားဝှက် ပြောင်းရန်')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('CURRENT PASSWORD', 'လက်ရှိစကားဝှက်')}</label><input type="password" placeholder="••••••••" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b]" /></div>
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('NEW PASSWORD', 'စကားဝှက်သစ်')}</label><input type="password" placeholder="••••••••" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b]" /></div>
               <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('CONFIRM PASSWORD', 'အတည်ပြုရန်')}</label><input type="password" placeholder="••••••••" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b]" /></div>
            </div>
            <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-6 py-2.5 rounded-xl text-[13px] uppercase tracking-wider transition-colors">{t('Change Password', 'ပြောင်းလဲမည်')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}