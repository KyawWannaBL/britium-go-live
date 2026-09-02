import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { supabase } from '@/integrations/supabase/client';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN';

interface RiderLocation {
  id: string;
  rider_name: string;
  lat: number;
  lng: number;
  status: string;
}

export const LiveDispatchBoard: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const [riders, setRiders] = useState<RiderLocation[]>([]);

  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [96.1561, 16.8409], 
      zoom: 12
    });

    const channel = supabase
      .channel('public:be_live_rider_locations')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'be_live_rider_locations' },
        (payload) => {
          const updatedRider = payload.new as RiderLocation;
          setRiders((prev) => prev.map(r => r.id === updatedRider.id ? updatedRider : r));

          if (markersRef.current[updatedRider.id]) {
            markersRef.current[updatedRider.id].setLngLat([updatedRider.lng, updatedRider.lat]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (map.current) map.current.remove();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-full relative">
      <div className="absolute top-0 left-0 z-10 p-4 bg-white m-4 rounded shadow-lg">
        <h2 className="text-xl font-bold">Yangon Dispatch Board</h2>
        <p className="text-sm text-gray-500">Live Rider Tracking</p>
      </div>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};
