import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { MapPin, Phone, CheckCircle, XCircle } from 'lucide-react';

export default function CSCommandCenter() {
  const [pendingExceptions, setPendingExceptions] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);

  // 1. Fetch shipments requiring CS Action
  const fetchCSExceptions = async () => {
    const { data, error } = await supabase
      .from('be_exception_audit')
      .select(`
        id, shipment_id, remarks, exception_datetime,
        exception_master:be_exception_master(exception_name_mm, next_action)
      `)
      .in('next_action', ['CS_ADDRESS_REVIEW', 'CS_REVIEW_OR_RTO', 'CS_RELEASE_REQUIRED'])
      .is('resolved_at', null)
      .order('exception_datetime', { ascending: false });

    if (!error && data) setPendingExceptions(data);
  };

  useEffect(() => {
    fetchCSExceptions();
    
    // Real-time listener for new exceptions
    const subscription = supabase.channel('cs_exceptions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'be_exception_audit' }, fetchCSExceptions)
      .subscribe();
      
    return () => supabase.removeChannel(subscription);
  }, []);

  // 2. Resolve Address Issue
  const handleAddressResolution = async (auditId, shipmentId, newAddress) => {
    setResolvingId(auditId);
    
    // Update shipment address and reset status to 'ADDRESS_RESOLVED'
    await supabase.rpc('resolve_shipment_address', {
      p_shipment_id: shipmentId,
      p_new_address: newAddress,
      p_audit_id: auditId
    });
    
    fetchCSExceptions();
    setResolvingId(null);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">CS Command Center - Issues to Resolve</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pendingExceptions.map((ex) => (
          <div key={ex.id} className="bg-white p-5 rounded-xl shadow-sm border border-red-100 border-l-4 border-l-red-500">
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-bold text-red-600 bg-red-50 px-2 py-1 rounded">
                {ex.exception_master.exception_name_mm}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(ex.exception_datetime).toLocaleTimeString()}
              </span>
            </div>
            
            <p className="font-mono text-sm text-slate-700 mb-1">ID: {ex.shipment_id}</p>
            <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-2 rounded">{ex.remarks}</p>

            {ex.exception_master.next_action === 'CS_ADDRESS_REVIEW' && (
              <div className="space-y-2">
                <input 
                  id={`addr_${ex.id}`}
                  type="text" 
                  placeholder="လိပ်စာအသစ် ရိုက်ထည့်ပါ..." 
                  className="w-full text-sm p-2 border rounded"
                />
                <button 
                  onClick={() => handleAddressResolution(ex.id, ex.shipment_id, document.getElementById(`addr_${ex.id}`).value)}
                  disabled={resolvingId === ex.id}
                  className="w-full bg-blue-600 text-white text-sm font-bold py-2 rounded flex justify-center items-center gap-2"
                >
                  <MapPin size={16} /> Update Address & Re-assign
                </button>
              </div>
            )}

            {ex.exception_master.next_action === 'CS_REVIEW_OR_RTO' && (
              <div className="flex gap-2">
                <button className="flex-1 bg-slate-200 text-slate-700 text-sm font-bold py-2 rounded flex justify-center items-center gap-1">
                  <Phone size={16} /> ဆက်သွယ်မည်
                </button>
                <button className="flex-1 bg-red-600 text-white text-sm font-bold py-2 rounded flex justify-center items-center gap-1">
                  <XCircle size={16} /> RTO ပြုလုပ်မည်
                </button>
              </div>
            )}
          </div>
        ))}
        {pendingExceptions.length === 0 && (
          <p className="text-slate-500 col-span-full flex items-center gap-2">
            <CheckCircle className="text-green-500" /> ဖြေရှင်းရန် Exception မရှိပါ။
          </p>
        )}
      </div>
    </div>
  );
}
