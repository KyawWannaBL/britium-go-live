import React, { useState, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function PickupFormPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    merchant_code: '',
    expected_parcels: 1,
    pickup_address: '',
    township: '',
    city: 'Yangon',
    vehicle_required: 'Any',
    payment_type: 'Prepaid',
    remark: ''
  });

  // Load merchants for the dropdown
  useEffect(() => {
    async function loadMerchants() {
      // Assuming you have a master table or view for merchants
      const { data } = await supabase.from('be_master_data_options').select('*').eq('dropdown_name', 'merchant_code');
      if (data) setMerchants(data);
    }
    loadMerchants();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    // 1. Call the backend RPC using all the data from your complex form
    const { data, error } = await supabase.rpc('be_create_pickup_request_from_master', {
      p_merchant_code: selectedMerchantCode,       // From your form state
      p_expected_parcels: Number(parcelCount),    // From your form state
      p_pickup_date: selectedDate,                // From your form state
      p_vehicle_required: selectedVehicle,        // From your form state (e.g., 'Bike')
      p_payment_type: selectedPaymentType,        // From your form state (e.g., 'COD')
      p_actor_email: currentUserEmail,            
      p_pickup_address_override: address,         // From your form state
      p_township_override: township,              // From your form state
      p_city_override: city,                      // From your form state
      p_region_state_override: region,            // From your form state
      p_pickup_remark: remarks,                   // From your form state
      p_duplicate_confirmed: false
    });

    if (error) throw error;

    // 2. The RPC returns the newly generated Canonical ID
    const generatedId = data.pickup_id;

    // 3. Log the initial creation event to Cargo Tracking
    await supabase.from('be_portal_cargo_events').insert({
      pickup_id: generatedId,
      event_type: 'PICKUP_REQUESTED',
      status_code: 'PICKUP_REQUESTED',
      description: `Pickup requested for ${selectedMerchantCode}. Vehicle required: ${selectedVehicle}`,
      actor_role: 'customer_service',
    });

    alert(`Success! Pickup created with ID: ${generatedId}`);
    // Clear your form states here...

  } catch (err: any) {
    alert(err.message || 'Failed to submit pickup request.');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="p-8 max-w-3xl mx-auto bg-[#061524] min-h-screen text-[#eef8ff] font-['Poppins']">
      <div className="bg-gradient-to-b from-[#0b2236] to-[#081b2e] border border-[#1a3a5c] rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-black mb-2 text-[#f6b84b] uppercase tracking-wide">CS / Data Entry</h1>
        <p className="text-[#c8dff0] mb-8 text-sm">Submit a new pickup request. This will route immediately to the Supervisor queue.</p>

        {message && (
          <div className={`p-4 mb-6 rounded-lg flex items-center gap-3 font-semibold ${message.type === 'success' ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30' : 'bg-[#ff4f86]/10 text-[#ff4f86] border border-[#ff4f86]/30'}`}>
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider">Merchant Code</label>
              <input required name="merchant_code" value={formData.merchant_code} onChange={handleChange} placeholder="e.g. BBG" className="w-full h-11 bg-[#081b2e] border border-[#1a3a5c] rounded-xl px-4 text-[#eef8ff] focus:outline-none focus:border-[#f6b84b]" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider">Expected Parcels</label>
              <input required type="number" min="1" name="expected_parcels" value={formData.expected_parcels} onChange={handleChange} className="w-full h-11 bg-[#081b2e] border border-[#1a3a5c] rounded-xl px-4 text-[#eef8ff] focus:outline-none focus:border-[#f6b84b]" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider">Pickup Address</label>
            <input required name="pickup_address" value={formData.pickup_address} onChange={handleChange} placeholder="Full street address..." className="w-full h-11 bg-[#081b2e] border border-[#1a3a5c] rounded-xl px-4 text-[#eef8ff] focus:outline-none focus:border-[#f6b84b]" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider">Township</label>
              <input required name="township" value={formData.township} onChange={handleChange} placeholder="e.g. Bahan" className="w-full h-11 bg-[#081b2e] border border-[#1a3a5c] rounded-xl px-4 text-[#eef8ff] focus:outline-none focus:border-[#f6b84b]" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider">City</label>
              <select name="city" value={formData.city} onChange={handleChange} className="w-full h-11 bg-[#081b2e] border border-[#1a3a5c] rounded-xl px-4 text-[#eef8ff] focus:outline-none focus:border-[#f6b84b]">
                <option value="Yangon">Yangon</option>
                <option value="Mandalay">Mandalay</option>
                <option value="Naypyitaw">Naypyitaw</option>
              </select>
            </div>
          </div>

          <button disabled={loading} type="submit" className="w-full h-12 mt-4 bg-[#f6b84b]/10 text-[#f6b84b] border border-[#f6b84b] rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#f6b84b]/20 transition-colors">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {loading ? 'Submitting to Supervisor...' : 'Submit Pickup Request'}
          </button>
        </form>
      </div>
    </div>
  );
}