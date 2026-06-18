import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Package, Truck, AlertTriangle, FileText, Building2, Headset } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const auth = useAuth() as any;
  const user = auth?.user;
  const role = auth?.role || 'SUPER_ADMIN';
  const branch = auth?.branch || 'HQ';
  
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState({ pickups: 0, waybills: 0, alerts: 0 });

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const [pRes, wRes, aRes] = await Promise.all([
          supabase.from('be_portal_pickup_requests').select('*', { count: 'exact', head: true }),
          supabase.from('be_portal_pickup_request_items').select('*', { count: 'exact', head: true }),
          supabase.from('be_app_notifications').select('*', { count: 'exact', head: true })
        ]);
        if (isMounted) {
          setStats({
            pickups: pRes.count || 0,
            waybills: wRes.count || 0,
            alerts: aRes.count || 0
          });
        }
      } catch (e) {
        console.error("Dashboard stat load error:", e);
      }
    }
    loadStats();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 notranslate" translate="no">
      
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-block px-4 py-1.5 rounded-full bg-[#1a3a5c] border border-[#f6b84b]/30 text-[#f6b84b] text-[11px] font-bold uppercase tracking-widest mb-4">
            <span>{t('Enterprise Command Center', 'လုပ်ငန်းစီမံကွပ်ကဲမှု ဗဟိုဌာန')}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight flex flex-wrap gap-2">
            <span>{t('Welcome,', 'ကြိုဆိုပါသည်၊')}</span> <span>{user?.email?.split('@')[0] || t('Operator', 'တာဝန်ခံ')}</span>
          </h1>
          <div className="text-[#c8dff0] text-[13px] md:text-sm font-bold mt-4 flex items-center gap-2 uppercase tracking-wider flex-wrap">
            <span>{t('Access Level:', 'လုပ်ပိုင်ခွင့်အဆင့် -')}</span> <span className="text-[#f6b84b] bg-[#1a3a5c] px-3 py-1 rounded-md">{role}</span>
            <span className="mx-2 text-[#4d7a9b] hidden sm:inline">|</span>
            <span>{t('Branch:', 'တာဝန်ကျရုံးခွဲ -')}</span> <span className="text-white bg-[#1a3a5c] px-3 py-1 rounded-md">{branch}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 flex flex-col justify-between shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Package className="text-blue-400" size={24} />
            </div>
            <div className="text-blue-400 text-[11px] font-bold uppercase tracking-wider">
              <span>{t('Pickups', 'ကုန်ပစ္စည်းသွားယူရန် တောင်းဆိုမှုများ')}</span>
            </div>
          </div>
          <div>
            <div className="text-4xl font-bold text-white mb-1"><span>{stats.pickups}</span></div>
            <div className="text-[#4d7a9b] text-sm font-bold tracking-wide">
              <span>{t('Active Requests', 'လက်ရှိဆောင်ရွက်ဆဲ')}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 flex flex-col justify-between shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FileText className="text-emerald-400" size={24} />
            </div>
            <div className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
              <span>{t('Waybills', 'လမ်းညွှန်စာရွက်များ')}</span>
            </div>
          </div>
          <div>
            <div className="text-4xl font-bold text-white mb-1"><span>{stats.waybills}</span></div>
            <div className="text-[#4d7a9b] text-sm font-bold tracking-wide">
              <span>{t('Generated Items', 'ထုတ်လုပ်ပြီးစီးမှု')}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 flex flex-col justify-between shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
              <AlertTriangle className="text-fuchsia-400" size={24} />
            </div>
            <div className="text-fuchsia-400 text-[11px] font-bold uppercase tracking-wider">
              <span>{t('System', 'စနစ်သတိပေးချက်')}</span>
            </div>
          </div>
          <div>
            <div className="text-4xl font-bold text-white mb-1"><span>{stats.alerts}</span></div>
            <div className="text-[#4d7a9b] text-sm font-bold tracking-wide">
              <span>{t('Notifications', 'အသိပေး အကြောင်းကြားစာများ')}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[#4d7a9b] text-[12px] font-bold uppercase tracking-widest mb-4 px-2">
          <span>{t('Core Workflows', 'အဓိက လုပ်ငန်းစဉ်များ')}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div onClick={() => navigate('/cs-portal')} className="bg-[#081b2e] border border-[#1a3a5c] rounded-2xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer block">
            <div className="flex items-center gap-3 mb-2">
              <Headset className="text-blue-400" size={20} />
              <h3 className="text-white font-bold text-[15px] m-0"><span>{t('CS Portal', 'ဖောက်သည်ဝန်ဆောင်မှုဌာန')}</span></h3>
            </div>
            <div className="text-[#4d7a9b] text-[12px] font-bold leading-relaxed m-0">
              <span>{t('Create and validate Merchant Pickups.', 'ကုန်သည်များထံမှ ပစ္စည်းသွားယူရန် စာရင်းသွင်းခြင်း')}</span>
            </div>
          </div>

          <div onClick={() => navigate('/data-entry')} className="bg-[#081b2e] border border-[#1a3a5c] rounded-2xl p-5 hover:border-emerald-500/50 transition-colors cursor-pointer block">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="text-emerald-400" size={20} />
              <h3 className="text-white font-bold text-[15px] m-0"><span>{t('Data Entry', 'အချက်အလက် စာရင်းသွင်းဌာန')}</span></h3>
            </div>
            <div className="text-[#4d7a9b] text-[12px] font-bold leading-relaxed m-0">
              <span>{t('Expand pickups into live Waybills.', 'ပစ္စည်းသွားယူမှုများကို လမ်းညွှန်စာရွက်များအဖြစ်သို့ ပြောင်းလဲပါ။')}</span>
            </div>
          </div>

          <div onClick={() => navigate('/dispatch')} className="bg-[#081b2e] border border-[#1a3a5c] rounded-2xl p-5 hover:border-amber-500/50 transition-colors cursor-pointer block">
            <div className="flex items-center gap-3 mb-2">
              <Truck className="text-amber-400" size={20} />
              <h3 className="text-white font-bold text-[15px] m-0"><span>{t('Dispatch', 'ပို့ဆောင်ရေး ကွပ်ကဲမှုဌာန')}</span></h3>
            </div>
            <div className="text-[#4d7a9b] text-[12px] font-bold leading-relaxed m-0">
              <span>{t('Assign riders and manage routing.', 'ပို့ဆောင်သူများကို တာဝန်ချထား၍ ခရီးစဉ်များကို စီမံခန့်ခွဲပါ။')}</span>
            </div>
          </div>

          <div onClick={() => navigate('/warehouse-operations')} className="bg-[#081b2e] border border-[#1a3a5c] rounded-2xl p-5 hover:border-purple-500/50 transition-colors cursor-pointer block">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="text-purple-400" size={20} />
              <h3 className="text-white font-bold text-[15px] m-0"><span>{t('Warehouse', 'ကုန်လှောင်ရုံ လုပ်ငန်းစဉ်များ')}</span></h3>
            </div>
            <div className="text-[#4d7a9b] text-[12px] font-bold leading-relaxed m-0">
              <span>{t('Process physical sorting scans.', 'ကုန်ပစ္စည်းများကို စကင်န်ဖတ်၍ ခွဲခြားမှုများ ဆောင်ရွက်ပါ။')}</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}