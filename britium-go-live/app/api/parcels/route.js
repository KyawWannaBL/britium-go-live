import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Adjust path to your Prisma client if needed

export async function GET() {
  try {
    // Fetch all active parcels needing dispatch review
    const parcels = await prisma.parcel.findMany({
      where: { 
        status: { in: ['PENDING_REVIEW', 'ROUTED', 'SKIPPED'] } 
      },
      orderBy: { batch_id: 'desc' }
    });
    
    return NextResponse.json({ success: true, parcels }, { status: 200 });
  } catch (error) {
    console.error("Fetch parcels error:", error);
    return NextResponse.json({ error: "Failed to fetch parcels" }, { status: 500 });
  }
}
