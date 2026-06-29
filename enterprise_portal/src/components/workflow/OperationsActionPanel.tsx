import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BRITIUM_PROCESS_STATUS } from '@/lib/constants';
import { useGoLiveMasterData } from '@/hooks/useGoLiveMasterData';

interface OperationsActionPanelProps {
  pickupId: string;
  currentStatus: string;
  processType: 'pickup' | 'warehouse' | 'delivery' | 'return';
  onActionSuccess: () => void;
}

export const OperationsActionPanel: React.FC<OperationsActionPanelProps> = ({ 
  pickupId, 
  currentStatus, 
  processType,
  onActionSuccess 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedAction, setSelectedAction] = useState('');
  const [exceptionCode, setExceptionCode] = useState('');
  const [remarks, setRemarks] = useState('');
  const { masterData } = useGoLiveMasterData();

  // Filter allowed next statuses based on BRITIUM_PROCESS_STATUS workflow rules
  const allowedStatuses = BRITIUM_PROCESS_STATUS[processType];

  const handleApplyWorkflow = async () => {
    if (!selectedAction) return;
    setIsProcessing(true);

    try {
      // Wireup to the strict workflow RPC required for Go-Live
      const { data, error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
        p_pickup_id: pickupId,
        p_new_status: selectedAction,
        p_exception_code: exceptionCode || null,
        p_remarks: remarks || null
      });

      if (error) throw error;
      
      onActionSuccess();
      setSelectedAction('');
      setExceptionCode('');
      setRemarks('');
    } catch (err) {
      console.error('Workflow transition failed:', err);
      alert('Failed to update workflow. Check exception rules and mandatory fields.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-4 border rounded-md shadow-sm space-y-4">
      <h3 className="font-semibold text-lg">Action Hub</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Update Status</label>
          <select 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
          >
            <option value="">-- Select Action --</option>
            {allowedStatuses.map(status => (
              <option key={status} value={status} disabled={status === currentStatus}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Show exception code dropdown only if a failed/exception status is selected */}
        {selectedAction.includes('FAILED') || selectedAction.includes('HOLD') || selectedAction.includes('DELAYED') ? (
          <div>
            <label className="block text-sm font-medium text-gray-700">Exception Reason</label>
            <select 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              value={exceptionCode}
              onChange={(e) => setExceptionCode(e.target.value)}
              required
            >
              <option value="">-- Select Exception --</option>
              {/* This should map from the master exception rules JSON you provided */}
              <option value="CUSTOMER_NOT_AVAILABLE">Customer not available</option>
              <option value="MERCHANT_CLOSED">Merchant closed</option>
              <option value="WRONG_ADDRESS">Wrong Address</option>
              <option value="WEATHER_TRAFFIC_ISSUE">Weather / Traffic</option>
            </select>
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Remarks (Required for Exceptions)</label>
        <textarea 
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleApplyWorkflow}
          disabled={!selectedAction || isProcessing || (selectedAction.includes('FAILED') && !exceptionCode)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Apply Action'}
        </button>
      </div>
    </div>
  );
};