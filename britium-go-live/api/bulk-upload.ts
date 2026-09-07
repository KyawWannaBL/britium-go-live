import { PrismaClient } from '@prisma/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const manifestRows = req.body; 
    const uniqueMerchants = [...new Set(manifestRows.map((row: any) => row.merchantName))];
    const pickupMap = new Map();

    for (const merchantName of uniqueMerchants) {
      let activePickup = await prisma.pickup.findFirst({
        where: { merchant: merchantName, status: 'OPEN' }
      });

      if (!activePickup) {
        activePickup = await prisma.pickup.create({
          data: {
            merchant: merchantName as string,
            status: 'OPEN',
          }
        });
      }
      pickupMap.set(merchantName, activePickup.id);
    }

    const waybillsToInsert = manifestRows.map((row: any) => ({
      wayId: row.wayId,
      pickupId: pickupMap.get(row.merchantName),
      merchant: row.merchantName,
      receiverName: row.receiverName,
      // Map any remaining fields required by your schema here
    }));

    const result = await prisma.waybill.createMany({
      data: waybillsToInsert,
      skipDuplicates: true, 
    });

    return res.status(200).json({ success: true, insertedCount: result.count });

  } catch (error) {
    console.error("Bulk Upload Error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
}
