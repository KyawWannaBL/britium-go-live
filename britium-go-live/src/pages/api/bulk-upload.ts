import { PrismaClient } from '@prisma/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rows, merchantName, regionCode = 'YANGON', branchCode = 'YGN-MAIN' } = req.body;

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'No waybills provided.' });
    }

    // 1. Auto-detect or create the Pickup Container
    let targetPickup = await prisma.pickup.findFirst({
      where: {
        merchantName: merchantName,
        status: { in: ['PENDING', 'RECEIVED_AT_HUB', 'IN_PROGRESS'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!targetPickup) {
      const generatedPickupId = `PKP-AUTO-${Date.now().toString().slice(-6)}-${merchantName.substring(0,3).toUpperCase()}`;
      
      targetPickup = await prisma.pickup.create({
        data: {
          pickupId: generatedPickupId,
          merchantName: merchantName,
          status: 'RECEIVED_AT_HUB', // Instantly ready for dispatch
          regionCode: regionCode,
          branchCode: branchCode,
        }
      });
      console.log(`Auto-generated new pickup container: ${generatedPickupId}`);
    }

    // 2. Map the valid pickup ID to all incoming waybills
    const waybillsToInsert = rows.map((row: any) => ({
      ...row,
      pickupId: targetPickup.pickupId,
      status: 'WAREHOUSE_RECEIVED',
    }));

    // 3. Execute the bulk insert
    const result = await prisma.waybill.createMany({
      data: waybillsToInsert,
      skipDuplicates: true, 
    });

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${result.count} waybills into container ${targetPickup.pickupId}`,
      pickupId: targetPickup.pickupId
    });

  } catch (error) {
    console.error("Bulk Upload Error:", error);
    return res.status(500).json({ error: "Bulk import failed" });
  }
}