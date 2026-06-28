import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Activity, Banknote, PackageX, Package } from 'lucide-react';

export default function DashboardPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ active_orders: 0, pending_cod: 0, returns: 0, recent_pickups: [] });

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('be_dashboard_snapshot');
      if (!error && res) setData(res);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1">{t('Enterprise Dashboard', 'လုပ်ငန်းစီမံခန့်ခွဲမှု မျက်နှာစာ')}</h1>
          <p className="text-[#4d7a9b]">{t('Welcome to Britium Ops command center.', 'Britium Ops စနစ်မှ ကြိုဆိုပါသည်။')}</p>
        </div>
        <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2 rounded-xl cursor-pointer hover:border-[#f6b84b] transition-colors flex items-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} />
          <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-blue-500/10 p-4 rounded-xl"><Activity className="text-blue-400" size={24} /></div>
          <div>
            <p className="text-[#4d7a9b] uppercase">{t('Active Orders', 'ပို့ဆောင်ဆဲ ပစ္စည်းများ')}</p>
            <p className="text-2xl text-[#eef8ff] mt-1">{loading ? '...' : data.active_orders}</p>
          </div>
        </div>
        
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-green-500/10 p-4 rounded-xl"><Banknote className="text-green-400" size={24} /></div>
          <div>
            <p className="text-[#4d7a9b] uppercase">{t('Pending COD', 'ကောက်ခံရန်ကျန်သော COD')}</p>
            <p className="text-2xl text-[#eef8ff] mt-1">{loading ? '...' : `${data.pending_cod.toLocaleString()} MMK`}</p>
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-red-500/10 p-4 rounded-xl"><PackageX className="text-red-400" size={24} /></div>
          <div>
            <p className="text-[#4d7a9b] uppercase">{t('Total Returns', 'ပြန်အမ်းပစ္စည်းများ')}</p>
            <p className="text-2xl text-[#eef8ff] mt-1">{loading ? '...' : data.returns}</p>
          </div>
        </div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
        <div className="p-4 border-b border-[#1a3a5c] flex items-center gap-2">
          <Package size={16} className="text-[#f6b84b]" />
          <h3 className="text-[#eef8ff] uppercase">{t('Recent Pickup Requests', 'လတ်တလော Pickup တောင်းဆိုမှုများ')}</h3>
        </div>
        
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-[#0b2236] sticky top-0 border-b border-[#1a3a5c] z-10">
              <tr className="text-[#4d7a9b] uppercase">
                <th className="p-4">{t('PICKUP ID', 'Pickup နံပါတ်')}</th>
                <th className="p-4">{t('MERCHANT', 'ကုန်သည်')}</th>
                <th className="p-4">{t('STATUS', 'အခြေအနေ')}</th>
                <th className="p-4">{t('DATE', 'နေ့စွဲ')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>
              ) : data.recent_pickups?.length === 0 ? (
                <tr><td colSpan={4} className="text-center p-8 text-[#4d7a9b]">{t('No recent pickups found.', 'Pickup တောင်းဆိုမှု မရှိပါ။')}</td></tr>
              ) : (
                data.recent_pickups.map((p: any) => (
                  <tr key={p.pickup_id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                    <td className="p-4">{p.pickup_id}</td>
                    <td className="p-4">{p.merchant_name}</td>
                    <td className="p-4">
                      <span className="bg-[#1a3a5c] text-[#90b4ce] px-2 py-1 rounded uppercase">
                        {p.status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-4">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}