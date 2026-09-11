// pages/finance/FinanceSettlementGoLivePage.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle, FileText } from 'lucide-react';

export default function FinanceSettlementGoLivePage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettlementQueue();
  }, []);

  const fetchSettlementQueue = async () => {
    setLoading(true);
    // Fetch items that are DELIVERED and need financial reconciliation
    const { data } = await supabase
      .from('be_portal_pickup_requests')
      .select('*')
      .eq('status', 'DELIVERED') // Assuming operational completion sets status to DELIVERED
      .order('created_at', { ascending: false });
      
    // Filter purely for frontend display purposes (in production, use a 'is_settled' boolean flag in the schema)
    setDeliveries(data || []);
    setLoading(false);
  };

  const markAsSettled = async (pickupId: string) => {
    try {
      // 1. Mark Financial Flag in Request Table (requires `cod_settled` boolean in DB)
      await supabase
        .from('be_portal_pickup_requests')
        .update({ status: 'FINANCE_SETTLED' }) // Or simply updating a flag
        .eq('pickup_id', pickupId);

      // 2. Log immutable financial event
      await supabase.from('be_portal_cargo_events').insert([{
        pickup_id: pickupId,
        event_status: 'FINANCE_SETTLED',
        updated_by_role: 'Finance'
      }]);

      toast({ title: 'Reconciliation Success', description: `${pickupId} COD has been settled.` });
      setDeliveries(prev => prev.filter(d => d.pickup_id !== pickupId));
    } catch (error) {
      toast({ title: 'Error', description: 'Could not settle transaction.', variant: 'destructive' });
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Finance Ledgers...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Banknote className="w-8 h-8 text-green-700" />
        <h1 className="text-2xl font-bold">COD Reconciliation Desk</h1>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        {deliveries.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-3">
            <CheckCircle className="w-12 h-12 text-green-300" />
            <p>All ledgers are balanced. No pending COD settlements.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4 text-left">Tracking ID</th>
                <th className="p-4 text-left">Merchant</th>
                <th className="p-4 text-left">Branch</th>
                <th className="p-4 text-left">Delivered Date</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deliveries.map(d => (
                <tr key={d.pickup_id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    {d.pickup_id}
                  </td>
                  <td className="p-4">{d.merchant_code}</td>
                  <td className="p-4"><Badge variant="secondary">{d.branch_code}</Badge></td>
                  <td className="p-4 text-gray-500">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-right">
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => markAsSettled(d.pickup_id)}
                    >
                      Settle COD
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}