import prisma from '@/lib/prisma'; 
import { autoAssignWayplan } from '@/lib/zoneMapper'; // Import the new routing engine

export async function processBulkUpload(excelData, currentBatchId) {
  const existingMerchants = await prisma.merchant.findMany({
    select: { merchant_code: true, name: true, aliases: true, phone_number: true }
  });

  async function autoDetectMerchant(excelRow) {
    const rawOrderId = excelRow['Order ID'] || excelRow['Way ID / Pickup ID'] || '';
    const rawSenderName = excelRow['Sender Name'] || excelRow['Merchant Name'] || '';
    const rawSenderPhone = excelRow['Sender Phone'] || excelRow['Merchant Phone'] || '';

    const prefixMatch = rawOrderId.match(/^([A-Z]+)-/i);
    if (prefixMatch) {
      const code = prefixMatch[1].toUpperCase();
      const found = existingMerchants.find(m => m.merchant_code === code);
      if (found) return found.merchant_code;
    }

    const matchedMerchant = existingMerchants.find(m => 
      (m.phone_number && m.phone_number === rawSenderPhone) || 
      (m.name && m.name.toLowerCase() === rawSenderName.toLowerCase()) ||
      (m.aliases && m.aliases.includes(rawSenderName))
    );

    if (matchedMerchant) return matchedMerchant.merchant_code;

    const newMerchantCode = `AUTO-${rawSenderName.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    
    await prisma.merchant.create({
      data: {
        merchant_code: newMerchantCode,
        name: rawSenderName || 'Unknown Sender',
        phone_number: rawSenderPhone,
        status: 'PROVISIONAL'
      }
    });

    existingMerchants.push({ merchant_code: newMerchantCode, name: rawSenderName });
    return newMerchantCode;
  }

  const processedParcels = [];
  for (const row of excelData) {
    const detectedCode = await autoDetectMerchant(row);
    
    // --- WAYPLAN AUTO-ASSIGNMENT ---
    // Extract the township from either the Waybill or Inbound Manifest template format
    const dropOffTownship = row['Township (Dropdown)'] || row['Township / Service Provider'] || row['Recipient Town'] || '';
    const assignedZone = autoAssignWayplan(dropOffTownship);
    
    processedParcels.push({
      merchant_code: detectedCode,
      recipient_name: row['Recipient Name'] || row['Receiver Name'] || 'Unknown',
      delivery_address: row['Address'] || row['Receiver Address'] || 'Unknown Address',
      batch_id: currentBatchId, 
      delivery_zone: assignedZone, // Saves the automatically calculated zone
      wayplan_id: `WP-${assignedZone}-${new Date().toISOString().slice(0, 10)}`, // Generates a daily route ID
      status: 'PENDING_REVIEW'
    });
  }

  await prisma.parcel.createMany({ data: processedParcels });
  return processedParcels.length;
}
