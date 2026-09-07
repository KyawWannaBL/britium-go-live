import { PrismaClient } from '@prisma/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { waybills, riderId, hubLocation } = req.body;

    const intermediates = waybills.map((wb: any) => ({
      location: { latLng: { latitude: wb.latitude, longitude: wb.longitude } }
    }));

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex'
      },
      body: JSON.stringify({
        origin: { location: { latLng: hubLocation } },
        destination: { location: { latLng: hubLocation } },
        intermediates: intermediates,
        travelMode: 'TWO_WHEELER',
        optimizeWaypointOrder: true,
      })
    });

    const googleData = await response.json();

    if (!googleData.routes || googleData.routes.length === 0) {
      return res.status(400).json({ error: 'Could not calculate a route.' });
    }

    const optimizedIndices = googleData.routes[0].optimizedIntermediateWaypointIndex;

    const optimizedWayplan = optimizedIndices.map((originalIndex: number, newSequenceIndex: number) => {
      const waybill = waybills[originalIndex];
      return {
        wayId: waybill.wayId,
        riderId: riderId,
        sequence: newSequenceIndex + 1,
        status: 'DISPATCHED'
      };
    });

    await prisma.$transaction(
      optimizedWayplan.map((routeData: any) =>
        prisma.waybill.update({
          where: { wayId: routeData.wayId },
          data: {
            riderId: routeData.riderId,
            sequence: routeData.sequence,
            status: routeData.status
          }
        })
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Wayplan optimized and assigned successfully.',
      totalStops: optimizedWayplan.length
    });

  } catch (error) {
    console.error("Optimization Error:", error);
    return res.status(500).json({ error: "Routing engine failed" });
  }
}
