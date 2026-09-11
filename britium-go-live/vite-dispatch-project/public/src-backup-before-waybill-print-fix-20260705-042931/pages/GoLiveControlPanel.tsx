import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AlertTriangle, DatabaseZap, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function GoLiveControlPanel({ currentUser }) {
  const [isResetting, setIsResetting] = useState(false);
  const [resetLogs, setResetLogs] = useState([]);
  const [status, setStatus] = useState('IDLE');

  useEffect(() => {
    fetchResetLogs();
  }, []);

  const fetchResetLogs = async () => {
    const { data } = await supabase
      .from('be_go_live_runtime_reset_log')
      .select('action_name, records_affected, executed_at, executor:be_user_account_registry(full_name)')
      .order('executed_at', { ascending: false });
    if (data) setResetLogs(data);
  };

  const handleSystemReset = async () => {
    const confirmReset = window.confirm(
      "သတိပေးချက်: ယခုလုပ်ဆောင်ချက်သည် စမ်းသပ်ထားသော Operational Data များအားလုံးကို Archive သို့ ရွှေ့ပြောင်းသွားမည်ဖြစ်ပြီး၊ System တစ်ခုလုံး Zero-state သို့ ရောက်ရှိသွားပါမည်။ ဆက်လက်လုပ်ဆောင်လိုပါသလား?"
    );
    if (!confirmReset) return;

    setIsResetting(true);
    setStatus('PROCESSING');

    try {
      const { data, error } = await supabase.rpc('execute_golive_runtime_cleanup', {
        p_admin_id: currentUser.id
      });

      if (error) throw error;
      if (data === 'SYSTEM_READY_FOR_GOLIVE') {
        setStatus('SUCCESS');
        fetchResetLogs();
      }
    } catch (error) {
      console.error(error);
      setStatus('ERROR');
      alert("Error occurred during Go-Live reset.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 mb-8">
        <div className="flex items-start gap-4">
          <div className="bg-red-100 p-3 rounded-full text-red-600">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-red-900 mb-2">Super Admin: Go-Live System Reset</h2>
            <p className="text-red-700 font-medium mb-6">
              Master Data, User Accounts နှင့် Branch Nodes များကိုချန်လှပ်ထားခဲ့ပြီး Test Shipment များ၊ Dispatch Route များအားလုံးကို Archive သို့ ပြောင်းရွှေ့ပေးမည့် One-click Action ဖြစ်ပါသည်။
            </p>
            <button
              onClick={handleSystemReset}
              disabled={isResetting || status === 'SUCCESS'}
              className="bg-red-600 hover:bg-red-700 text-white font-black px-8 py-4 rounded-xl flex items-center gap-3 transition-all disabled:opacity-50"
            >
              {isResetting ? 'Processing Go-Live Sequence...' : 'Execute Go-Live Cleanup'}
              <DatabaseZap size={20} />
            </button>
            {status === 'SUCCESS' && (
              <div className="mt-4 flex items-center gap-2 text-green-600 font-bold bg-green-50 p-3 rounded-lg w-fit">
                <CheckCircle2 /> System is clean and ready for Go-Live.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Runtime Reset Logs */}
      <h3 className="text-lg font-bold text-[#0b2236] mb-4">Reset Evidence Logs</h3>
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Action</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Records Affected</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Executed By</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {resetLogs.map((log, i) => (
              <tr key={i} className="hover:bg-slate-50 text-sm">
                <td className="p-4 font-mono font-bold text-blue-600">{log.action_name}</td>
                <td className="p-4 font-bold">{log.records_affected} rows archived</td>
                <td className="p-4">{log.executor?.full_name || 'Super Admin'}</td>
                <td className="p-4 text-slate-500">{new Date(log.executed_at).toLocaleString()}</td>
              </tr>
            ))}
            {resetLogs.length === 0 && (
              <tr><td colSpan="4" className="p-8 text-center text-slate-400">No reset logs found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
