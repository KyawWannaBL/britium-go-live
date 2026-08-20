import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Download, TrendingUp, AlertTriangle, CheckCircle, Package } from 'lucide-react';

export default function AnalyticsReportingPage() {
  const [stats, setStats] = useState({
    totalPickups: 0,
    deliveredCount: 0,
    exceptionCount: 0,
    pendingCod: 0
  });
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchGoLiveStats();
  }, []);

  const fetchGoLiveStats = async () => {
    // နေ့စဉ်မှတ်တမ်းများကို Backend မှ ဆွဲယူခြင်း
    const { data: pickups, count: pickupCount } = await supabase
      .from('be_portal_pickup_requests')
      .select('status, cod_amount, cod_settled_at', { count: 'exact' });

    const { count: exceptionCount } = await supabase
      .from('be_exception_audit')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null);

    if (pickups) {
      let delivered = 0;
      let codPending = 0;
      pickups.forEach(p => {
        if (p.status === 'DELIVERED') delivered++;
        if (p.status === 'DELIVERED' && !p.cod_settled_at) codPending += (p.cod_amount || 0);
      });

      setStats({
        totalPickups: pickupCount || 0,
        deliveredCount: delivered,
        exceptionCount: exceptionCount || 0,
        pendingCod: codPending
      });
    }
  };

  // CSV Data Export Function
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const { data } = await supabase
        .from('be_portal_pickup_requests')
        .select(`pickup_id, branch_code, status, weight, payment_terms, cod_amount, updated_at`)
        .order('updated_at', { ascending: false });

      if (!data) return;

      const headers = ['Pickup ID', 'Branch', 'Status', 'Weight (Kg)', 'Payment Terms', 'COD Amount', 'Last Updated'];
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          `${row.pickup_id},${row.branch_code},${row.status},${row.weight},${row.payment_terms},${row.cod_amount || 0},${new Date(row.updated_at).toLocaleDateString()}`
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Britium_Daily_Operations_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert("Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-8 bg-[#061524] min-h-screen text-[#eef8ff]">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-black mb-2 tracking-tight">Operations Analytics</h1>
            <p className="text-[#4d7a9b] font-medium text-sm">Real-time overview of post Go-Live metrics and reporting.</p>
          </div>
          <button 
            onClick={handleExportCSV}
            disabled={isExporting}
            className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#0b2236] px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg"
          >
            {isExporting ? <TrendingUp className="animate-pulse" /> : <Download size={18} />}
            {isExporting ? 'Exporting...' : 'Export CSV Report'}
          </button>
        </header>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Package size={64}/></div>
            <h3 className="text-[#4d7a9b] text-xs font-bold uppercase tracking-wider mb-2">Total Pickups</h3>
            <p className="text-3xl font-black text-white">{stats.totalPickups}</p>
          </div>
          
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle size={64}/></div>
            <h3 className="text-[#4d7a9b] text-xs font-bold uppercase tracking-wider mb-2">Delivered</h3>
            <p className="text-3xl font-black text-[#22c55e]">{stats.deliveredCount}</p>
          </div>

          <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle size={64}/></div>
            <h3 className="text-[#4d7a9b] text-xs font-bold uppercase tracking-wider mb-2">Pending Exceptions</h3>
            <p className="text-3xl font-black text-[#ff4f86]">{stats.exceptionCount}</p>
          </div>

          <div className="bg-gradient-to-br from-[#1a3a5c] to-[#0b2236] border border-[#f6b84b]/30 p-6 rounded-2xl shadow-xl relative overflow-hidden">
            <h3 className="text-[#f6b84b] text-xs font-bold uppercase tracking-wider mb-2">Unsettled COD</h3>
            <p className="text-3xl font-black text-white">{stats.pendingCod.toLocaleString()} Ks</p>
          </div>
        </div>

      </div>
    </div>
  );
}
