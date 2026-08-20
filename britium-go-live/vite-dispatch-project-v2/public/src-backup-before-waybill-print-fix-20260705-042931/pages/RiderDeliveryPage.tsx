import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { MapPin, Phone, CheckCircle2, AlertTriangle, PenTool } from 'lucide-react';
import SignaturePad from 'react-signature-canvas'; // ePOD အတွက်

export default function RiderDeliveryPage({ currentJob, riderId, onExceptionTrigger }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPodModal, setShowPodModal] = useState(false);
  const [signatureRef, setSignatureRef] = useState(null);

  // Status အဆင့်ဆင့်ပြောင်းလဲခြင်း
  const handleStatusUpdate = async (newStatus) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase.rpc('update_rider_job_status', {
        p_pickup_id: currentJob.pickup_id,
        p_rider_id: riderId,
        p_new_status: newStatus
      });
      if (error) throw error;
      alert(`Status updated to: ${newStatus}`);
      // Refresh Job List...
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // e-Signature ဖြင့် အောင်မြင်စွာ ပို့ဆောင်ပြီးကြောင်း အတည်ပြုခြင်း
  const handleCompleteDelivery = async () => {
    if (signatureRef.isEmpty()) {
      alert("ကျေးဇူးပြု၍ လက်ခံသူ၏ လက်မှတ် (Signature) ရယူပါ။");
      return;
    }
    
    setIsUpdating(true);
    // 1. Signature ကို Data URL အဖြစ်ပြောင်းခြင်း (တကယ့်အပြင်တွင် Supabase Storage သို့ Upload လုပ်ပါ)
    const signatureDataUrl = signatureRef.getTrimmedCanvas().toDataURL('image/png');

    try {
      const { error } = await supabase.rpc('update_rider_job_status', {
        p_pickup_id: currentJob.pickup_id,
        p_rider_id: riderId,
        p_new_status: 'DELIVERED',
        p_pod_signature_url: signatureDataUrl,
        p_collected_cod: currentJob.payment_terms === 'COD' ? currentJob.cod_amount : 0
      });

      if (error) throw error;
      setShowPodModal(false);
      alert("ပို့ဆောင်ခြင်း အောင်မြင်စွာ ပြီးမြောက်ပါပြီ။");
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Waybill ID</p>
            <h3 className="text-xl font-black text-slate-800">{currentJob.pickup_id}</h3>
          </div>
          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-bold">
            {currentJob.status}
          </span>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <MapPin className="text-slate-400 mt-1" size={18} />
            <div>
              <p className="text-sm font-bold text-slate-700">{currentJob.receiver_name}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{currentJob.delivery_address}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border">
            <Phone className="text-green-500" size={18} />
            <span className="text-sm font-bold text-slate-700">{currentJob.receiver_phone}</span>
          </div>
        </div>

        {/* COD Requirement Badge */}
        {currentJob.payment_terms === 'COD' && (
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl mb-6 flex justify-between items-center">
            <span className="text-orange-800 font-bold text-sm">ကောက်ခံရန် COD ငွေ</span>
            <span className="text-orange-600 font-black text-lg">{currentJob.cod_amount.toLocaleString()} Ks</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {currentJob.status === 'DELIVERY_ASSIGNED' && (
            <button 
              onClick={() => handleStatusUpdate('OUT_FOR_DELIVERY')}
              className="col-span-2 bg-[#0b2236] text-white py-4 rounded-xl font-bold"
            >
              ထွက်ခွာမည် (Start Route)
            </button>
          )}

          {currentJob.status === 'OUT_FOR_DELIVERY' && (
            <>
              <button 
                onClick={() => onExceptionTrigger(currentJob.pickup_id, 'DELIVERY')}
                className="bg-red-50 text-red-600 py-4 rounded-xl font-bold flex flex-col items-center gap-1 border border-red-100"
              >
                <AlertTriangle size={20} /> Exception တင်မည်
              </button>
              <button 
                onClick={() => setShowPodModal(true)}
                className="bg-[#ff4f86] text-white py-4 rounded-xl font-bold flex flex-col items-center gap-1 shadow-lg shadow-pink-200"
              >
                <CheckCircle2 size={20} /> ပို့ဆောင်ပြီး
              </button>
            </>
          )}
        </div>
      </div>

      {/* Proof of Delivery (ePOD) Modal */}
      {showPodModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl p-6 h-[70vh] flex flex-col">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
              <PenTool /> လက်ခံသူ၏ လက်မှတ် (e-Signature)
            </h3>
            <div className="flex-1 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl mb-4 relative">
              <SignaturePad 
                ref={(ref) => setSignatureRef(ref)}
                canvasProps={{ className: 'w-full h-full absolute inset-0' }}
              />
            </div>
            <div className="flex gap-3 mt-auto">
              <button onClick={() => signatureRef.clear()} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 rounded-xl">
                Clear
              </button>
              <button onClick={handleCompleteDelivery} disabled={isUpdating} className="flex-[2] py-3 text-white font-black bg-[#ff4f86] rounded-xl">
                {isUpdating ? 'Saving...' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}