import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/lib/supabaseClient';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN; // .env တွင် Mapbox Token ထည့်ထားရန်

export default function BirdEyeTrackAndTracePage({ branchCode }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({}); // Rider ID ဖြင့် Marker များကို သိမ်းထားရန်
  const [activeRiders, setActiveRiders] = useState(0);

  useEffect(() => {
    if (map.current) return; // Initialize map only once
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1', // Dark Theme for Dispatch
      center: [96.1561, 16.8053], // Yangon Center (Default)
      zoom: 12
    });

    // 1. Initial Data Load
    loadInitialRiders();

    // 2. Subscribe to Supabase Realtime Updates
    const channel = supabase.channel('public:be_live_rider_locations')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'be_live_rider_locations',
        filter: `branch_code=eq.${branchCode}`
      }, (payload) => {
        updateRiderMarker(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branchCode]);

  const loadInitialRiders = async () => {
    const { data } = await supabase
      .from('be_live_rider_locations')
      .select('*, rider:auth.users(email)')
      .eq('branch_code', branchCode);
      
    if (data) {
      data.forEach(updateRiderMarker);
      setActiveRiders(data.length);
    }
  };

  const updateRiderMarker = (riderData) => {
    const { rider_id, current_lat, current_lng, heading } = riderData;
    
    // Existing Marker ကို Update လုပ်ခြင်း
    if (markersRef.current[rider_id]) {
      markersRef.current[rider_id].setLngLat([current_lng, current_lat]);
      markersRef.current[rider_id].setRotation(heading || 0);
    } else {
      // Marker အသစ်ဖန်တီးခြင်း
      const el = document.createElement('div');
      el.className = 'w-8 h-8 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white';
      el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 22l10-3 10 3L12 2z"/></svg>`;
      
      const marker = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([current_lng, current_lat])
        .setRotation(heading || 0)
        .addTo(map.current);
        
      markersRef.current[rider_id] = marker;
    }
  };

  return (
    <div className="relative w-full h-screen">
      {/* Mapbox Container */}
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Dispatch Overlay Panel */}
      <div className="absolute top-4 left-4 bg-[#0b2236]/90 backdrop-blur-md border border-[#1a3a5c] p-4 rounded-2xl shadow-2xl text-white w-80 z-10">
        <h2 className="text-xl font-black mb-1">HQ Command Center</h2>
        <p className="text-xs text-[#4d7a9b] font-bold uppercase tracking-widest mb-4">Live Tracking ({branchCode})</p>
        
        <div className="flex justify-between items-center bg-[#061524] p-3 rounded-xl border border-[#1a3a5c]">
          <span className="text-sm font-bold">Active Riders on Field</span>
          <span className="text-2xl font-black text-[#22c55e]">{activeRiders}</span>
        </div>
      </div>
    </div>
  );
}
