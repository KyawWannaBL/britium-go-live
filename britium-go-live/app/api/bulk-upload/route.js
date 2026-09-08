import { NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { processBulkUpload } from '@/lib/smartParser';
import prisma from '@/lib/prisma'; // Adjust path if your Prisma client is elsewhere

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    // Generate the Universal Batch ID (e.g., BATCH-0908-1029)
    const dateStr = new Date().toISOString().slice(5, 10).replace('-', '');
    const batchId = `BATCH-${dateStr}-${Date.now().toString().slice(-4)}`;

    // Read the uploaded file into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse the Excel workbook
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert the exact sheet into a JSON array
    const excelData = xlsx.utils.sheet_to_json(worksheet);

    if (excelData.length === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    // 1. Record the upload event independently using raw SQL
    await prisma.$executeRaw`
      INSERT INTO upload_batches (batch_id, file_name, uploaded_by, total_rows, processed_status)
      VALUES (${batchId}, ${file.name}, 'System_Admin', ${excelData.length}, 'PROCESSING')
    `;

    // 2. Feed the parsed JSON into your multi-merchant Smart Parser
    const processedCount = await processBulkUpload(excelData, batchId);

    // 3. Mark the batch as fully completed
    await prisma.$executeRaw`
      UPDATE upload_batches 
      SET processed_status = 'COMPLETED' 
      WHERE batch_id = ${batchId}
    `;

    return NextResponse.json({ 
      success: true, 
      batch_id: batchId,
      message: `Successfully routed ${processedCount} parcels across multiple merchants.` 
    }, { status: 200 });

  } catch (error) {
    console.error("Bulk upload processing error:", error);
    return NextResponse.json({ error: "Failed to process bulk upload file." }, { status: 500 });
  }
}
