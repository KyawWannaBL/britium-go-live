import { NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { processBulkUpload } from '@/lib/smartParser';
import { standardizeToWaybillTemplate } from '@/lib/templateConverter';
import prisma from '@/lib/prisma'; 

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const dateStr = new Date().toISOString().slice(5, 10).replace('-', '');
    const batchId = `BATCH-${dateStr}-${Date.now().toString().slice(-4)}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawExcelData = xlsx.utils.sheet_to_json(worksheet);

    if (rawExcelData.length === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    // --- TEMPLATE CONVERSION ENGINE ---
    // Instantly transforms Inbound Manifests into Waybill Templates
    const standardizedData = standardizeToWaybillTemplate(rawExcelData);

    await prisma.$executeRaw`
      INSERT INTO upload_batches (batch_id, file_name, uploaded_by, total_rows, processed_status)
      VALUES (${batchId}, ${file.name}, 'System_Admin', ${standardizedData.length}, 'PROCESSING')
    `;

    // Feed the converted data into the Smart Parser
    const processedCount = await processBulkUpload(standardizedData, batchId);

    await prisma.$executeRaw`
      UPDATE upload_batches SET processed_status = 'COMPLETED' WHERE batch_id = ${batchId}
    `;

    return NextResponse.json({ 
      success: true, 
      batch_id: batchId,
      message: `Successfully translated and routed ${processedCount} parcels.` 
    }, { status: 200 });

  } catch (error) {
    console.error("Bulk upload error:", error);
    return NextResponse.json({ error: "Failed to process bulk upload file." }, { status: 500 });
  }
}
