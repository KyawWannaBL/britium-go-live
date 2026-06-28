import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { DollarSign, CheckCircle } from 'lucide-react';

export default function CODSettlementDashboard() {
  const [pendingSettlements, setPendingSettlements] = useState([]);

  useEffect(() => {
    fetchPendingCOD();
  }, []);

  const fetchPendingCOD = async () => {
    // Fetch 'DELIVERED' shipments where payment_terms is 'COD' and not yet settled
    const { data, error } = await supabase
      .from('be_portal_pickup_requests')
      .select(`pickup_id, cod_amount, assigned_rider_id, updated_at, rider:be_user_account_registry(full_name)`)
      .eq('status', 'DELIVERED')
      .eq('payment_terms', 'COD')
      .is('cod_settled_at', null)
      .order('updated_at', { ascending: false });

    if (!error && data) setPendingSettlements(data);
  };

  const handleSettle = async (pickupId) => {
    const { error } = await supabase
      .from('be_portal_pickup_requests')
      .update({ cod_settled_at: new Date() })
      .eq('pickup_id', pickupId);

    if (!error) {
      setPendingSettlements(prev => prev.filter(p => p.pickup_id !== pickupId));
    }
  };

  const totalPendingAmount = pendingSettlements.reduce((sum, item) => sum + (item.cod_amount || 0), 0);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Finance - COD Settlement</h2>
        <div className="bg-white px-4 py-2 rounded-lg border shadow-sm flex items-center gap-2">
          <span className="text-slate-500 text-sm font-bold uppercase">Total Pending</span>
          <span className="text-xl font-black text-green-600">{totalPendingAmount.toLocaleString()} MMK</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-4 text-xs text-slate-500 font-bold uppercase">Pickup ID</th>
              <th className="p-4 text-xs text-slate-500 font-bold uppercase">Rider / Driver</th>
              <th className="p-4 text-xs text-slate-500 font-bold uppercase">Delivered At</th>
              <th className="p-4 text-xs text-slate-500 font-bold uppercase">COD Amount</th>
              <th className="p-4 text-xs text-slate-500 font-bold uppercase text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pendingSettlements.map(item => (
              <tr key={item.pickup_id} className="hover:bg-slate-50">
                <td className="p-4 font-mono text-sm font-bold">{item.pickup_id}</td>
                <td className="p-4 text-sm">{item.rider?.full_name || 'Unknown Rider'}</td>
                <td className="p-4 text-sm text-slate-500">{new Date(item.updated_at).toLocaleString()}</td>
                <td className="p-4 font-bold text-slate-800">{item.cod_amount?.toLocaleString()} Ks</td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => handleSettle(item.pickup_id)}
                    className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 ml-auto transition-colors"
                  >
                    <CheckCircle size={16} /> Mark Settled
                  </button>
                </td>
              </tr>
            ))}
            {pendingSettlements.length === 0 && (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500">No pending COD settlements found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
