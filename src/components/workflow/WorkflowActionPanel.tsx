import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle, CheckCircle2, RotateCcw, ShieldCheck, Loader2 } from 'lucide-react';

interface WorkflowActionPanelProps {
  pickupId: string;
  currentStatus: string;
  userRole: string;
  onSuccessSync: () => void; // Call your fetch function to refresh the table
}

export default function WorkflowActionPanel({ pickupId, currentStatus, userRole, onSuccessSync }: WorkflowActionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState('');

  // The Action Dispatcher connects to our Strict RPC
  const handleWorkflowTransition = async (newStatus: string, exceptionCode: string | null = null) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
        p_pickup_id: pickupId,
        p_new_status: newStatus,
        p_exception_code: exceptionCode,
        p_remarks: remarks || `Status advanced to ${newStatus} by ${userRole}`,
        p_user_role: userRole
      });

      if (error) throw error;

      toast({ title: "Workflow Updated", description: `${pickupId} successfully moved to ${newStatus}` });
      setRemarks('');
      onSuccessSync(); // Instantly update the UI
    } catch (err: any) {
      toast({ title: "Workflow Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- DYNAMIC ACTION RENDERER BASED ON EXCEPTION RULES ---
  const renderAvailableActions = () => {
    // 1. Customer Service Exception Resolutions
    if (userRole.includes('Customer Service') || userRole === 'Super Admin') {
      if (currentStatus === 'ADDRESS_CORRECTION_REQUIRED') {
        return (
          <Button onClick={() => handleWorkflowTransition('READY_FOR_DISPATCH')} className="w-full bg-blue-600">
            <CheckCircle2 className="w-4 h-4 mr-2"/> Address Corrected - Return to Dispatch
          </Button>
        );
      }
      if (['PICKUP_FAILED', 'DELIVERY_FAILED', 'CUSTOMER_REFUSED'].includes(currentStatus)) {
        return (
          <div className="flex gap-2 w-full">
            <Button onClick={() => handleWorkflowTransition('DELIVERY_RESCHEDULED')} className="flex-1 bg-amber-500 hover:bg-amber-600">
              <RotateCcw className="w-4 h-4 mr-2"/> Reschedule
            </Button>
            <Button onClick={() => handleWorkflowTransition('RTO_INITIATED')} variant="destructive" className="flex-1">
              <AlertCircle className="w-4 h-4 mr-2"/> Initiate RTO
            </Button>
          </div>
        );
      }
    }

    // 2. Finance / Hold Resolutions
    if (userRole === 'Finance' || userRole === 'Super Admin') {
      if (currentStatus === 'FINANCE_HOLD') {
        return (
          <Button onClick={() => handleWorkflowTransition('READY_FOR_DISPATCH')} className="w-full bg-emerald-600 hover:bg-emerald-700">
            <ShieldCheck className="w-4 h-4 mr-2"/> Release Finance Hold
          </Button>
        );
      }
    }

    // 3. Warehouse Next Steps
    if (userRole === 'Warehouse' || userRole === 'Super Admin') {
      if (currentStatus === 'RECEIVED_AT_ORIGIN') {
        return (
          <Button onClick={() => handleWorkflowTransition('SORTING')} className="w-full bg-indigo-600 hover:bg-indigo-700">
            Move to Sorting
          </Button>
        );
      }
      if (currentStatus === 'SORTING') {
        return (
          <Button onClick={() => handleWorkflowTransition('READY_FOR_DISPATCH')} className="w-full bg-blue-600 hover:bg-blue-700">
            Mark Ready for Dispatch
          </Button>
        );
      }
    }

    // Fallback if no specific actions are available for this status/role combo
    return (
      <div className="text-sm text-gray-500 text-center p-2 bg-gray-50 rounded border border-gray-200">
        No manual actions available for {userRole} at this stage ({currentStatus}).
      </div>
    );
  };

  return (
    <div className="mt-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Workflow Actions</h4>
      
      {/* Optional Remarks input for audit trail */}
      <input 
        type="text" 
        placeholder="Add optional remarks before taking action..." 
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="flex w-full">
        {loading ? (
          <Button disabled className="w-full"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Processing...</Button>
        ) : (
          renderAvailableActions()
        )}
      </div>
    </div>
  );
}