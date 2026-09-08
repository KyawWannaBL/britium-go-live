export function standardizeToWaybillTemplate(parsedJson) {
  if (!parsedJson || parsedJson.length === 0) return [];
  
  const headers = Object.keys(parsedJson[0]);
  
  // 1. Detect if the uploaded file is the Inbound Manifest format
  const isInboundManifest = headers.includes('Way ID') && headers.includes('Recipient name');
  
  if (isInboundManifest) {
    return parsedJson.map(row => {
      // Intelligently determine Payment Type
      const codAmount = parseFloat(row['COD (OS)'] || row['Final COD'] || 0);
      const paymentType = codAmount > 0 ? 'COD' : 'Prepaid';

      return {
        'Way ID / Pickup ID': row['Way ID'] || '',
        'Merchant Name': row['Merchant'] || '',
        'Receiver Name': row['Recipient name'] || '',
        'Receiver Phone': row['Recipient Phone'] || '',
        'City (Dropdown)': 'Yangon', // Default operation city
        'Township (Dropdown)': row['Recipient Town'] || '',
        'Ward / Village Tract (Dropdown)': '', 
        'Postal Code (Auto)': '',
        'Receiver Address': row['Recipient address'] || row['Destination'] || '',
        'Actual Weight (KG)': row['Weight'] || 1,
        'Service Type': 'Standard', 
        'Payment Type': paymentType,
        'Item Price': row['Item price'] || 0,
        'OS Set Price': row['Deli Fee (OS)'] || 0,
        'Merchant Tier': '',
        'Township / Service Provider': row['Recipient Town'] || ''
      };
    });
  }
  
  // 2. If it is already in the Waybill Template format, return it untouched
  return parsedJson;
}
