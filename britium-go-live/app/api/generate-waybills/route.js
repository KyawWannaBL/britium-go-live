import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import prisma from '@/lib/prisma'; // Adjust this import to your actual Prisma client location

export async function POST(req) {
  try {
    const body = await req.json();
    const { parcel_ids } = body;

    if (!parcel_ids || !Array.isArray(parcel_ids) || parcel_ids.length === 0) {
      return NextResponse.json({ error: "No parcels selected." }, { status: 400 });
    }

    // 1. Fetch parcel routing data from the database
    const parcels = await prisma.parcel.findMany({
      where: { parcel_id: { in: parcel_ids } }
    });

    if (parcels.length === 0) {
      return NextResponse.json({ error: "Parcels not found in database." }, { status: 404 });
    }

    // 2. Initialize an A6 formatted PDF document (Standard Shipping Label Size)
    const doc = new PDFDocument({ size: 'A6', margin: 20 });
    const buffers = [];

    // Capture the PDF stream into memory buffers
    doc.on('data', buffers.push.bind(buffers));

    // 3. Draw the Waybills
    parcels.forEach((parcel, index) => {
      // Outer Boundary Box
      doc.rect(10, 10, 277, 400).stroke();

      // Header Section
      doc.font('Helvetica-Bold').fontSize(16).text('BRITIUM EXPRESS', 20, 25, { align: 'center' });
      doc.moveTo(10, 50).lineTo(287, 50).stroke();

      // Routing Info
      doc.font('Helvetica').fontSize(10).text(`Waybill ID: ${parcel.parcel_id}`, 20, 65);
      doc.text(`Merchant Code: ${parcel.merchant_code}`, 20, 80);
      doc.moveTo(10, 100).lineTo(287, 100).stroke();

      // Recipient Block
      doc.font('Helvetica-Bold').fontSize(12).text('DELIVER TO:', 20, 115);
      doc.fontSize(14).text(parcel.recipient_name || 'N/A', 20, 135);
      
      doc.font('Helvetica').fontSize(11).text(parcel.delivery_address || 'No Address Provided', 20, 155, { 
        width: 257, 
        align: 'left' 
      });

      // Footer / Barcode Placeholder Area
      doc.moveTo(10, 350).lineTo(287, 350).stroke();
      doc.fontSize(8).text('Britium Logistics Core Routing Engine', 20, 365, { align: 'center', color: 'gray' });

      // Add a page break if there are more parcels to process
      if (index < parcels.length - 1) {
        doc.addPage();
      }
    });

    // 4. Finalize the document
    doc.end();

    // 5. Wait for the stream to fully convert to a buffer
    const pdfBuffer = await new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
    });

    // 6. Return the binary PDF payload
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Britium_Waybills_${Date.now()}.pdf"`,
      },
    });

  } catch (error) {
    console.error("PDF Engine Error:", error);
    return NextResponse.json({ error: "Internal server error during PDF generation." }, { status: 500 });
  }
}
