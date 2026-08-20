import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Ensure this points to your Supabase client

export default function PickupRequests() {
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<string[]>([]);

  useEffect(() => {
    const fetchMasterData = async () => {
      // Calling the production backend RPC
      const { data, error } = await supabase.rpc('be_get_operational_masterdata');
      
      if (error) {
        console.error("Backend Error:", error);
        return;
      }

      if (data) {
        // Wiring the production data to your dropdowns
        setBusinessTypes(data.business_type || []);
        setPaymentTerms(data.payment_terms || []);
      }
    };
    fetchMasterData();
  }, []);

  return (
    <div className="p-4">
      <label>Business Type</label>
      <select>
        {businessTypes.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      <label>Payment Terms</label>
      <select>
        {paymentTerms.map((term) => (
          <option key={term} value={term}>{term}</option>
        ))}
      </select>
    </div>
  );
}