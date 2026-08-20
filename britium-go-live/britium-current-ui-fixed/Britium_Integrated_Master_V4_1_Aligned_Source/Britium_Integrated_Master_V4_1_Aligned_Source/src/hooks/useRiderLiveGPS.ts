import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useRiderLiveGPS(riderId: string, isActiveRoute: boolean, branchCode: string) {
  useEffect(() => {
    if (!isActiveRoute || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, heading, speed } = position.coords;

        // Backend သို့ Update ပေးပို့ခြင်း
        await supabase.rpc('update_live_gps', {
          p_rider_id: riderId,
          p_lat: latitude,
          p_lng: longitude,
          p_heading: heading || 0,
          p_speed: speed ? (speed * 3.6) : 0, // Convert m/s to km/h
          p_branch: branchCode
        });
      },
      (error) => console.error("GPS Error:", error),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isActiveRoute, riderId, branchCode]);
}
