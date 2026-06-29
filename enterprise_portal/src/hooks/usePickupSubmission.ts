import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateTariffFallback, resolveBranchCode } from '@/lib/constants';

export function usePickupSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitCanonicalPickup = async (formData: any, source: 'merchant' | 'customer' | 'cs') => {
    setIsSubmitting(true);
    try {
      // 1. Resolve Branch Rules (YGN, MDY, NPT)
      const targetBranch = resolveBranchCode({
        city: formData.city,
        township: formData.township,
        address: formData.address_line_1
      });

      // 2. Apply the unified tariff rule
      const tariff = calculateTariffFallback({
        tier: formData.customer_tier || 'Standard',
        actualWeightKg: formData.weight_kg,
        baseFee: formData.base_fee,
        highwayDropoff: formData.highway_dropoff
      });

      // 3. Submit to the centralized RPC to generate the P-format ID and trigger notifications
      // Note: Sai will need to ensure this RPC handles the transaction block safely
      const { data: pickupId, error } = await supabase.rpc('be_submit_unified_pickup_request', {
        p_source: source,
        p_merchant_id: formData.merchant_id,
        p_branch_code: targetBranch,
        p_weight_kg: tariff.actual_weight_kg,
        p_total_tariff: tariff.total_tariff,
        p_township: formData.township,
        p_payload: formData 
      });

      if (error) throw error;
      
      return { success: true, pickupId, targetBranch, tariff };

    } catch (error) {
      console.error('Failed to submit pickup request:', error);
      return { success: false, error };
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitCanonicalPickup, isSubmitting };
}