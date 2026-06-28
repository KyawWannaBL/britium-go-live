// pages/branch/BranchOfficeGoLivePage.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Building2, Package, AlertCircle } from 'lucide-react';

export default function BranchOfficeGoLivePage() {
  const [activeBranch, setActiveBranch] = useState<'MDY' | 'NPT'>('MDY');
  const [branchData, setBranchData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBranchSnapshot(activeBranch);
  }, [activeBranch]);

  const fetchBranchSnapshot = async (branchCode: string) => {
    setLoading(true);
    try {
      // 1. Fetch Pickups scoped purely to this branch
      const { data: pickups } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .eq('branch_code', branchCode)
        .order('created_at', { ascending: false });

      // 2. Fetch Notifications scoped to this branch
      const { data: notifs } = await supabase
        .from('be_app_notifications')
        .select('*')
        .eq('target_branch', branchCode)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      // Strict Null-Checks (SPEC Requirement)
      setBranchData(pickups || []);
      setNotifications(notifs || []);
    } catch (error) {
      console.error("Branch Snapshot Failed:", error);
      // Fail gracefully
      setBranchData([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status.includes('COMPLETED') || status.includes('DELIVERED')) return 'bg-green-100 text-green-800';
    if (status.includes('FAILED') || status.includes('EXCEPTION')) return 'bg-red-100 text-red-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-8 h-8 text-blue-800" />
        <h1 className="text-2xl font-bold">Regional Branch Office</h1>
      </div>

      <Tabs defaultValue="MDY" onValueChange={(v) => setActiveBranch(v as 'MDY' | 'NPT')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="MDY">Mandalay (MDY)</TabsTrigger>
          <TabsTrigger value="NPT">Naypyitaw (NPT)</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-12 text-center text-gray-500 animate-pulse">Loading Branch Snapshot...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Main Operational Registry */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Package className="w-5 h-5"/> Operational Registry ({activeBranch})
            </h2>
            <div className="bg-white border rounded-lg shadow-sm">
              {branchData.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No active operations recorded for {activeBranch} branch.
                </div>
              ) : (
                <div className="divide-y">
                  {branchData.map(req => (
                    <div key={req.pickup_id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{req.pickup_id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusColor(req.status)}`}>
                            {req.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{req.merchant_code} - {req.customer_name}</p>
                        <p className="text-xs text-gray-500 mt-1">{req.address}, {req.township}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{req.tier}</Badge>
                        <p className="text-xs text-gray-500 mt-1">{req.weight_kg} kg</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Branch Notifications Panel */}
          <div className="space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5"/> Branch Alerts
            </h2>
            <div className="bg-white border rounded-lg shadow-sm p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-4">No unread alerts.</div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className="p-3 bg-red-50 border border-red-100 rounded-md text-sm">
                    <p className="font-semibold text-red-800">{notif.pickup_id}</p>
                    <p className="text-red-600 mt-1">{notif.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}