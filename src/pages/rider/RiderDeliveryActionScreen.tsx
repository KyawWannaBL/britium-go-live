import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Camera, CheckCircle2, AlertTriangle, PhoneOff, MapPinOff } from 'lucide-react';

export default function RiderDeliveryActionScreen({ pickupId, onComplete }: { pickupId: string, onComplete: () => void }) {
  const [loading, setLoading] = useState(false);

  // Directly leverages the same strict RPC, simulating mobile GPS & Camera logic
  const handleRiderAction = async (status: string, exceptionCode: string | null = null, requirePhoto: boolean = false) => {
    setLoading(true);
    
    // Simulate capturing photo and GPS for compliance
    let photoUrl = requirePhoto ? 'https://storage.britium.com/mock-proof-of-delivery.jpg' : null;
    let lat = 16.8053; // Mock Yangon GPS
    let lng = 96.1561;

    try {
      const { error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
        p_pickup_id: pickupId,
        p_new_status: status,
        p_exception_code: exceptionCode,
        p_remarks: exceptionCode ? `Rider reported: ${exceptionCode}` : 'Delivered successfully via App',
        p_user_role: 'Rider',
        p_photo_url: photoUrl,
        p_lat: lat,
        p_lng: lng
      });

      if (error) throw error;
      toast({ title: "Success", description: "Route updated successfully." });
      onComplete(); // Remove job from active screen
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-100 min-h-full p-4 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
        <h3 className="text-xl font-black text-gray-900 mb-4 tracking-tight">Active Delivery: {pickupId}</h3>
        
        {/* SUCCESS ACTION */}
        <Button 
          onClick={() => handleRiderAction('DELIVERED', null, true)} 
          disabled={loading}
          className="w-full h-16 text-lg bg-emerald-600 hover:bg-emerald-700 shadow-md mb-6"
        >
          <CheckCircle2 className="w-6 h-6 mr-3"/> Mark as Delivered (POD)
        </Button>

        <div className="relative border-t border-gray-200 mb-6">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 text-xs font-bold text-gray-400">OR REPORT EXCEPTION</span>
        </div>

        {/* EXCEPTION ACTIONS (Pulled directly from your JSON rules) */}
        <div className="space-y-3">
          <Button 
            variant="outline" 
            disabled={loading}
            onClick={() => handleRiderAction('DELIVERY_ATTEMPTED', 'CUSTOMER_NOT_AVAILABLE', false)}
            className="w-full h-14 justify-start text-gray-700 border-gray-300"
          >
            <PhoneOff className="w-5 h-5 mr-3 text-amber-500"/> Customer Unreachable (Log Call)
          </Button>

          <Button 
            variant="outline" 
            disabled={loading}
            onClick={() => handleRiderAction('ADDRESS_ISSUE', 'WRONG_ADDRESS', false)}
            className="w-full h-14 justify-start text-gray-700 border-gray-300"
          >
            <MapPinOff className="w-5 h-5 mr-3 text-red-500"/> Wrong / Bad Address
          </Button>

          <Button 
            variant="outline" 
            disabled={loading}
            onClick={() => handleRiderAction('CUSTOMER_REFUSED', 'CUSTOMER_REFUSED', true)}
            className="w-full h-14 justify-start text-gray-700 border-gray-300"
          >
            <AlertTriangle className="w-5 h-5 mr-3 text-red-600"/> Customer Refused Parcel
          </Button>
        </div>
      </div>
    </div>
  );
}