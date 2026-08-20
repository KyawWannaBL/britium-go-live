import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Save, Send } from 'lucide-react';

export default function SupervisorWayplanReviewPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ drafts: [], confirmed: [], stats: {} });

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('be_supervisor_wayplan_snapshot');
      if (error) throw error;
      if (res) setData(res);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('signal')) return;
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);
  const stats = data?.stats || { draft_wayplans: 0, confirmed: 0, rows_in_plan: 0, included: 0 };

  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h2 className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('SUPERVISOR', 'ကြီးကြပ်ရေးမှူး')}</h2>
          <h1 className="text-[#eef8ff] text-[16px]">{t('Wayplan Review & Delivery Assignment', 'လမ်းကြောင်း စစ်ဆေးခြင်းနှင့် တာဝန်ချထားခြင်း')}</h1>
          <p className="text-[#4d7a9b] text-[13px] mt-2">{t('Review generated wayplans, adjust route sequence, and assign delivery worker.', 'ရေးဆွဲထားသော လမ်းကြောင်းများကို စစ်ဆေး၍ ခွဲဝေပါ။')}</p>
        </div>
        <button onClick={loadData} className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2 rounded-xl flex items-center gap-2 hover:border-[#f6b84b] transition-colors text-[13px] cursor-pointer">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {t('Refresh', 'ပြန်လည်စတင်ရန်')}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl border-t-2 border-t-[#f6b84b]"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{t('DRAFT WAYPLANS', 'အကြမ်းဖျင်း လမ်းကြောင်းများ')}</div><div className="text-[20px] text-[#f6b84b]">{stats.draft_wayplans || 0}</div><div className="text-[#4d7a9b] text-[11px] mt-1">{t('Needs supervisor review', 'စစ်ဆေးရန် လိုအပ်သည်')}</div></div>
        <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl border-t-2 border-t-emerald-400"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{t('CONFIRMED', 'အတည်ပြုပြီး')}</div><div className="text-[20px] text-emerald-400">{stats.confirmed || 0}</div><div className="text-[#4d7a9b] text-[11px] mt-1">{t('Delivery assigned', 'ခွဲဝေချထားပြီး')}</div></div>
        <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl border-t-2 border-t-[#4ea8de]"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{t('ROWS IN PLAN', 'ပါဝင်သော စာရင်းများ')}</div><div className="text-[20px] text-[#4ea8de]">{stats.rows_in_plan || 0}</div><div className="text-[#4d7a9b] text-[11px] mt-1">{t('Selected wayplan', 'ရွေးချယ်ထားသည်')}</div></div>
        <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl border-t-2 border-t-purple-400"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{t('INCLUDED', 'ထည့်သွင်းပြီး')}</div><div className="text-[20px] text-purple-400">{stats.included || 0}</div><div className="text-[#4d7a9b] text-[11px] mt-1">{t('Will be assigned', 'တာဝန်ပေးမည်')}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-[#1a3a5c]">
            <h3 className="text-[#eef8ff] text-[14px]">{t('Wayplans', 'လမ်းကြောင်းများ')}</h3>
            <p className="text-[#4d7a9b] text-[12px]">{t('Select a draft or confirmed plan.', 'စစ်ဆေးရန် လမ်းကြောင်းတစ်ခုကို ရွေးပါ။')}</p>
          </div>
          <div className="flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">
            {t('No wayplans generated yet.', 'ရေးဆွဲထားသော လမ်းကြောင်းမရှိသေးပါ။')}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#061524] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-start">
            <div>
              <h3 className="text-[#eef8ff] text-[14px]">{t('Review Items', 'စစ်ဆေးရန် အချက်များ')}</h3>
              <p className="text-[#4d7a9b] text-[12px]">{t('Supervisor can change worker, sequence, and notes.', 'Rider နှင့် အစဉ်လိုက်ချထားမှုကို ပြောင်းလဲနိုင်သည်။')}</p>
            </div>
            <div className="flex gap-2">
              <button className="bg-[#0b2236] text-[#eef8ff] px-4 py-2 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center gap-2 text-[12px]">
                <Save size={14}/> {t('Save Draft', 'အကြမ်းသိမ်းမည်')}
              </button>
              <button className="bg-[#f6b84b] text-[#061524] px-4 py-2 rounded-xl hover:bg-[#e5a93a] flex items-center gap-2 text-[12px]">
                <Send size={14}/> {t('Confirm Wayplan', 'အတည်ပြုမည်')}
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">
            {t('No items in selected wayplan.', 'ရွေးချယ်ထားသော လမ်းကြောင်းမရှိပါ။')}
          </div>
        </div>
      </div>
    </div>
  );
}