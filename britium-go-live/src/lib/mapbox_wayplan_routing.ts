// lib/mapbox_wayplan_routing.ts

export interface Waypoint {
  id: string;
  lng: number;
  lat: number;
}

export async function generateOptimizedWayplan(startPoint: Waypoint, stops: Waypoint[]): Promise<any> {
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
  
  // Coordinate များကို Mapbox format အတိုင်း ပြင်ဆင်ခြင်း: "lng,lat;lng,lat"
  const allPoints = [startPoint, ...stops];
  const coordinatesString = allPoints.map(p => `${p.lng},${p.lat}`).join(';');

  try {
    // Mapbox Optimization API (Traveling Salesperson Problem ဖြေရှင်းရန်)
    // source=first ဆိုသည်မှာ Start Point (ဥပမာ - Warehouse) မှ စတင်ရန်ဖြစ်သည်
    const response = await fetch(
      `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinatesString}?source=first&roundtrip=false&access_token=${MAPBOX_TOKEN}`
    );

    if (!response.ok) throw new Error("Failed to generate optimized route");

    const data = await response.json();
    
    // 1. Optimized Route Line (Polyline) ကိုဆွဲထုတ်ခြင်း (Map တွင်ပြရန်)
    const routeGeometry = data.trips[0].geometry; 
    
    // 2. သွားရမည့် အစီအစဉ်အသစ် (Optimized Stop Order) ကို ပြန်စီခြင်း
    const optimizedOrder = data.waypoints.sort((a, b) => a.waypoint_index - b.waypoint_index);
    const sortedStops = optimizedOrder.map(opt => allPoints[opt.waypoint_index]);

    return {
      success: true,
      geometry: routeGeometry,
      distanceKm: (data.trips[0].distance / 1000).toFixed(2),
      durationMins: (data.trips[0].duration / 60).toFixed(0),
      sortedStops: sortedStops // <--- ဤအစီအစဉ်အတိုင်း Rider App တွင် ပြပေးမည်
    };

  } catch (error) {
    console.error("Routing Error:", error);
    return { success: false, error: error.message };
  }
}