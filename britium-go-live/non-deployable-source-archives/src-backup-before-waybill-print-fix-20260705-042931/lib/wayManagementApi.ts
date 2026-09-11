import { supabase } from '@/integrations/supabase/client';

export const fetchWayList = async () => {
  return await supabase.from('ways').select('*');
};

export const fetchWayDetail = async (id: string) => {
  return await supabase.from('ways').select('*').eq('id', id).single();
};

export const updateWayStatus = async (id: string, status: string) => {
  return await supabase.from('ways').update({ status }).eq('id', id);
};

export const initiateReturn = async (id: string) => {
  return await supabase.from('ways').update({ status: 'returned' }).eq('id', id);
};

export const assignWay = async (wayId: string, riderId: string) => {
  return await supabase.from('ways').update({ rider_id: riderId }).eq('id', wayId);
};

export const exportWaysCsv = (data: any[]) => {
  console.log("Exporting CSV", data);
  // Add your CSV generation logic here
};

export const fetchWayManagementLookups = async () => {
  // Replace with your actual lookup queries
  return { riders: [], vehicles: [] };
};

export const fetchWayManagementPlan = async () => {
  return await supabase.from('ways').select('*');
};