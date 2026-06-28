import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function ExceptionHandlerForm({ shipmentId, processType, currentBranch }) {
  const [exceptions, setExceptions] = useState([]);
  const [selectedException, setSelectedException] = useState(null);
  
  // State variables for form fields
  const [remarks, setRemarks] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [callCount, setCallCount] = useState(0);

  useEffect(() => {
    // 1. Load active exception rules based on process type (PICKUP, DELIVERY, WAREHOUSE)
    async function loadRules() {
      const { data } = await supabase
        .from('be_exception_master')
        .select('*')
        .eq('process_type', processType);
      if (data) setExceptions(data);
    }
    loadRules();
  }, [processType]);

  const handleExceptionSubmit = async () => {
    if (!selectedException) return;

    // 2. Validate against the dynamically loaded exception rules
    if (selectedException.require_remark === 'YES' && !remarks) {
      alert('မှတ်ချက် (Remark) ထည့်သွင်းရန် လိုအပ်ပါသည်။');
      return;
    }
    if (selectedException.require_photo === 'YES' && !photoUrl) {
      alert('အထောက်အထား ဓာတ်ပုံ ထည့်သွင်းရန် လိုအပ်ပါသည်။');
      return;
    }
    if (selectedException.require_call_log === 'YES' && callCount < 1) {
      alert('Customer ထံ ဖုန်းခေါ်ဆိုမှု အကြိမ်ရေ ထည့်သွင်းပေးပါ။');
      return;
    }

    // 3. Insert into Audit Table & Trigger next actions
    const { error } = await supabase.from('be_exception_audit').insert({
      shipment_id: shipmentId,
      branch_id: currentBranch,
      exception_code: selectedException.exception_code,
      new_status: selectedException.mapped_status,
      remarks,
      photo_url: photoUrl,
      call_attempt_count: callCount,
      next_action: selectedException.next_action
    });

    if (!error) {
      alert('Exception အောင်မြင်စွာ မှတ်တမ်းတင်ပြီးပါပြီ။');
      // Update local state or redirect
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h3 className="text-lg font-bold">ပြဿနာ အစီရင်ခံရန် (Exception Report)</h3>
      
      <select 
        className="w-full mt-4 p-2 border"
        onChange={(e) => setSelectedException(exceptions.find(ex => ex.exception_code === e.target.value))}
      >
        <option value="">အကြောင်းပြချက် ရွေးချယ်ပါ</option>
        {exceptions.map(ex => (
          <option key={ex.exception_code} value={ex.exception_code}>
            {ex.exception_name_mm}
          </option>
        ))}
      </select>

      {selectedException && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-500">
            {selectedException.customer_message_mm}
          </p>

          {/* Conditional Rendering Based on Rules */}
          {selectedException.require_remark !== 'No' && (
             <textarea 
               placeholder="မှတ်ချက်ရေးရန်..." 
               className="w-full p-2 border"
               onChange={(e) => setRemarks(e.target.value)} 
             />
          )}

          {selectedException.require_photo !== 'No' && (
             <input 
               type="file" 
               accept="image/*" 
               onChange={(e) => setPhotoUrl('UPLOADED_URL')} // Replace with actual Supabase Storage upload
             />
          )}

          {selectedException.require_call_log === 'YES' && (
             <input 
               type="number" 
               placeholder="ဖုန်းခေါ်ဆိုသည့် အကြိမ်ရေ" 
               className="w-full p-2 border"
               onChange={(e) => setCallCount(Number(e.target.value))} 
             />
          )}

          <button 
            onClick={handleExceptionSubmit}
            className="w-full bg-blue-600 text-white p-2 rounded mt-4"
          >
            အတည်ပြုမည်
          </button>
        </div>
      )}
    </div>
  );
}
