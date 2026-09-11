import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Adjust to your Prisma client location

// --- CONFIGURATION ---
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN; 
// Set your Yangon Hub Coordinates (Longitude, Latitude)
const BRITIUM_HUB_LNG = 96.1561; 
const BRITIUM_HUB_LAT = 16.8053; 

export async function POST(req) {
  try {
    const { parcel_ids } = await req.json();

    if (!parcel_ids || !Array.isArray(parcel_ids)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!MAPBOX_TOKEN) {
      console.error("Mapbox token missing in environment variables.");
      return NextResponse.json({ error: "Mapbox token missing" }, { status: 500 });
    }

    // Process each parcel
    for (const id of parcel_ids) {
      const parcel = await prisma.parcel.findUnique({ where: { parcel_id: id } });
      
      // Ensure we have the exact GPS coordinates from your earlier location review
      if (parcel && parcel.corrected_latitude && parcel.corrected_longitude) {
        
        const destLng = parcel.corrected_longitude;
        const destLat = parcel.corrected_latitude;

        // Mapbox Directions API URL (Format: lng,lat;lng,lat)
        const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${BRITIUM_HUB_LNG},${BRITIUM_HUB_LAT};${destLng},${destLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
        
        try {
          const mapboxRes = await fetch(mapboxUrl);
          const data = await mapboxRes.json();

          if (data.routes && data.routes.length > 0) {
            // Distance is returned in meters, convert to kilometers
            const distanceKm = +(data.routes[0].distance / 1000).toFixed(2);
            // Duration is returned in seconds, convert to minutes
            const estimatedMins = Math.round(data.routes[0].duration / 60);

            // --- TARIFF CALCULATION (Example) ---
            // Base rate of 1500 MMK, plus 300 MMK per kilometer
            const calculatedFee = 1500 + Math.round(distanceKm * 300);

            // Save the exact routing metrics back to the database
            await prisma.parcel.update({
              where: { parcel_id: id },
              data: { 
                status: 'ROUTED',
                distance_km: distanceKm,
                estimated_minutes: estimatedMins,
                delivery_fee: calculatedFee
              }
            });
          } else {
             console.log(`Mapbox found no route for parcel ${id}`);
          }
        } catch (fetchErr) {
          console.error(`Mapbox API failed for parcel ${id}:`, fetchErr);
        }
      }
    }

    return NextResponse.json({ success: true, processed: parcel_ids.length }, { status: 200 });

  } catch (error) {
    console.error("Mapbox Background Worker Error:", error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
