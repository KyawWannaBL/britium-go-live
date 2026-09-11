// lib/britiumGoLiveEngine.ts
import { supabase } from './supabaseClient';

export function resolveBranchCode(city?: string, township?: string, address?: string): 'YGN' | 'MDY' | 'NPT' {
  const text = `${city || ''} ${township || ''} ${address || ''}`.toLowerCase();
  if (text.includes('mandalay')) return 'MDY';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('npt')) return 'NPT';
  return 'YGN';
}

export function calculateBritiumTariff(tier: 'Standard' | 'Royal', actualWeightKg: number, highwayDropoff: boolean = false) {
  const allowance = tier === 'Royal' ? 5 : 3;
  const chargeableWeight = Math.ceil(Math.max(0, actualWeightKg));
  const extraWeight = Math.max(0, chargeableWeight - allowance);
  const weightSurcharge = extraWeight * 500;
  const highwayFee = highwayDropoff ? 3000 : 0;
  const baseFee = 2000; // Assuming standard base fee, adjust against master data if dynamic

  return {
    tier,
    chargeableWeight,
    baseFee,
    weightSurcharge,
    highwayFee,
    totalTariff: baseFee + weightSurcharge + highwayFee,
  };
}

export function validateFleetAssignment(branchCode: string, vehicleType: string): { valid: boolean; reason?: string } {
  const restrictedVehicles = ['Bike', 'Motorbike', 'Tricycle'];
  
  if (branchCode === 'YGN' && restrictedVehicles.includes(vehicleType)) {
    return { 
      valid: false, 
      reason: "Motorbikes and tricycles are strictly prohibited for delivery services within the Yangon region." 
    };
  }
  
  return { valid: true };
}