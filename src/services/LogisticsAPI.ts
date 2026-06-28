import { supabase } from '@/lib/supabaseClient';

export const LogisticsAPI = {
  // 1. Fetch Dynamic Dropdowns (Townships, Fleet, Merchants)
  getDropdowns: async () => {
    const { data, error } = await supabase.rpc('be_get_operational_masterdata');
    if (error) throw error;
    return data;
  },

  // 2. Fetch Live Dispatch Board
  getDispatchBoard: async (branchCode?: string) => {
    const { data, error } = await supabase.rpc('be_get_live_dispatch_wayplan_board', { 
      p_branch_code: branchCode || null 
    });
    if (error) throw error;
    return data;
  },

  // 3. Dispatch Action: Assign parcels to Rider
  assignRoute: async (pickupIds: string[], workerId: string, routeLabel: string) => {
    const { data, error } = await supabase.rpc('be_assign_live_dispatch_wayplan', {
      p_pickup_ids: pickupIds, 
      p_worker_id: workerId, 
      p_route_label: routeLabel
    });
    if (error) throw error;
    return data;
  },

  // 4. Strict Workflow Action (Rider / CS / Warehouse)
  updateStatusStrict: async (params: { pickupId: string, status?: string, exceptionCode?: string, remarks?: string, photoUrl?: string }) => {
    const { data, error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
      p_pickup_id: params.pickupId,
      p_new_status: params.status || null,
      p_exception_code: params.exceptionCode || null,
      p_remarks: params.remarks || null,
      p_photo_url: params.photoUrl || null,
      p_gps_lat: null, 
      p_gps_lng: null
    });
    
    // The backend will automatically throw an error if an exception rule is violated (e.g., missing photo)
    if (error) throw new Error(error.message); 
    return data;
  }
};