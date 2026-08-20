// pages/rider/RiderAppPage.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { MapPin, Phone, Package, CheckCircle2 } from 'lucide-react';

export default function RiderAppPage({ currentUserId }: { currentUserId: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUserId) fetchMyJobs();
  }, [currentUserId]);

  const fetchMyJobs = async () => {
    const { data } = await supabase
      .from('be_portal_pickup_requests')
      .select('*')
      .eq('assigned_rider', currentUserId)
      .in('status', ['PICKUP_ASSIGNED', 'RIDER_EN_ROUTE_PICKUP', 'ARRIVED_AT_PICKUP'])
      .order('created_at', { ascending: true });
    
    setJobs(data || []);
    setLoading(false);
  };

  const advanceStatus = async (pickupId: string, currentStatus: string) => {
    let nextStatus = '';
    if (currentStatus === 'PICKUP_ASSIGNED') nextStatus = 'RIDER_EN_ROUTE_PICKUP';
    if (currentStatus === 'RIDER_EN_ROUTE_PICKUP') nextStatus = 'ARRIVED_AT_PICKUP';
    if (currentStatus === 'ARRIVED_AT_PICKUP') nextStatus = 'PICKUP_COMPLETED';

    try {
      await supabase.from('be_portal_pickup_requests')
        .update({ status: nextStatus })
        .eq('pickup_id', pickupId);

      await supabase.from('be_portal_cargo_events').insert([{
        pickup_id: pickupId,
        event_status: nextStatus,
        updated_by_role: 'Rider'
      }]);

      toast({ title: 'Status Updated', description: `Job advanced to ${nextStatus.replace(/_/g, ' ')}` });
      fetchMyJobs(); 
    } catch (error) {
      toast({ title: 'Update Failed', variant: 'destructive' });
    }
  };

  if (loading) return <div className="p-4 text-center">Syncing operations...</div>;

  return (
    <div className="bg-gray-100 min-h-screen pb-20">
      <div className="bg-blue-900 text-white p-4 sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold">Britium Rider</h1>
        <p className="text-sm opacity-80">Active Route Counter: {jobs.length}</p>
      </div>

      <div className="p-4 space-y-4">
        {jobs.length === 0 && (
          <div className="bg-white p-8 rounded-xl text-center shadow-sm text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
            <p>No active assignments.</p>
            <p className="text-xs mt-1">Waiting for dispatch...</p>
          </div>
        )}

        {jobs.map(job => (
          <div key={job.pickup_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <span className="font-bold text-lg">{job.pickup_id}</span>
              <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {job.status.replace(/_/g, ' ')}
              </span>
            </div>
            
            <div className="p-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">{job.customer_name}</p>
                  <p className="text-gray-600">{job.address}, {job.township}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400 shrink-0" />
                <p className="text-gray-900 font-medium">{job.phone}</p>
              </div>
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-gray-400 shrink-0" />
                <p className="text-gray-600">Weight: {job.weight_kg}kg • {job.tier}</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 flex gap-2">
              {job.status === 'PICKUP_ASSIGNED' && (
                <Button className="w-full" onClick={() => advanceStatus(job.pickup_id, job.status)}>
                  Start Route
                </Button>
              )}
              {job.status === 'RIDER_EN_ROUTE_PICKUP' && (
                <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => advanceStatus(job.pickup_id, job.status)}>
                  Arrived at Location
                </Button>
              )}
              {job.status === 'ARRIVED_AT_PICKUP' && (
                <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => advanceStatus(job.pickup_id, job.status)}>
                  Confirm Pickup
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}