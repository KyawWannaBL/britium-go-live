import prisma from '@/lib/prisma'; // Adjust this import based on your actual Prisma client location

export async function processBulkUpload(excelData, currentBatchId) {
  // 1. Fetch all existing merchants into memory for fast lookup
  const existingMerchants = await prisma.merchant.findMany({
    select: { merchant_code: true, name: true, aliases: true, phone_number: true }
  });

  // 2. The Smart Detection Function
  async function autoDetectMerchant(excelRow) {
    const rawOrderId = excelRow['Order ID'] || '';
    const rawSenderName = excelRow['Sender Name'] || '';
    const rawSenderPhone = excelRow['Sender Phone'] || '';

    // Tier 1: Regex Prefix Matching (e.g., matches "GRS" from "GRS-10293")
    const prefixMatch = rawOrderId.match(/^([A-Z]+)-/i);
    if (prefixMatch) {
      const code = prefixMatch[1].toUpperCase();
      const found = existingMerchants.find(m => m.merchant_code === code);
      if (found) return found.merchant_code;
    }

    // Tier 2: Fuzzy matching by Phone Number or Name/Alias
    const matchedMerchant = existingMerchants.find(m => 
      m.phone_number === rawSenderPhone || 
      m.name.toLowerCase() === rawSenderName.toLowerCase() ||
      (m.aliases && m.aliases.includes(rawSenderName))
    );

    if (matchedMerchant) return matchedMerchant.merchant_code;

    // Tier 3: Auto-Generate a Provisional Merchant
    const newMerchantCode = `AUTO-${rawSenderName.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    
    await prisma.merchant.create({
      data: {
        merchant_code: newMerchantCode,
        name: rawSenderName || 'Unknown Sender',
        phone_number: rawSenderPhone,
        status: 'PROVISIONAL' // Flags it for admin review later
      }
    });

    // Push the new merchant into memory so subsequent rows in the same file match Tier 2
    existingMerchants.push({ merchant_code: newMerchantCode, name: rawSenderName });

    return newMerchantCode;
  }

  // 3. Process the Bulk Upload Array
  const processedParcels = [];
  for (const row of excelData) {
    const detectedCode = await autoDetectMerchant(row);
    
    processedParcels.push({
      merchant_code: detectedCode,
      recipient_name: row['Recipient Name'],
      delivery_address: row['Address'],
      batch_id: currentBatchId, // Ties it back to the Universal Batch ID
      status: 'PENDING_REVIEW'
    });
  }

  // 4. Bulk Insert to Database
  await prisma.parcel.createMany({ data: processedParcels });
  
  return processedParcels.length;
}
