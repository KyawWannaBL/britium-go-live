import { generateOptimizedWayplan } from '@/lib/mapbox_wayplan_routing';
import { supabase } from '@/lib/supabaseClient';

export const handleCreateWayplan = async (selectedPickups, riderId) => {
    // 1. Coordinates များကို ပြင်ဆင်ခြင်း
    const warehouseStart = { id: 'WH', lng: 96.15, lat: 16.80 };
    const stops = selectedPickups.map(p => ({ id: p.pickup_id, lng: p.lng, lat: p.lat }));

    // 2. Mapbox API ဖြင့် အနီးဆုံးလမ်းကြောင်း ရှာဖွေခြင်း
    const routeData = await generateOptimizedWayplan(warehouseStart, stops);

    if(routeData.success) {
       // 3. Supabase RPC ကိုခေါ်၍ Route Save လုပ်ခြင်း
       await supabase.rpc('generate_dispatch_route_with_geometry', {
          p_branch_code: 'YGN',
          p_rider_id: riderId,
          p_ordered_pickup_ids: routeData.sortedStops.map(s => s.id), // စီထားသော Order အတိုင်း
          p_route_geometry: routeData.geometry,
          p_total_km: routeData.distanceKm
       });
       alert(`Route Generated Successfully: ${routeData.distanceKm} km, ~${routeData.durationMins} mins`);
    }
}
