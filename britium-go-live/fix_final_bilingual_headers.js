import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  const newFunc = `const handleTemplateConvert = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!customPickupId.trim()) {
      setStatusText('⚠️ Enter the Remarkable Name / Pickup ID first!');
      setTimeout(() => setStatusText(''), 3000);
      if (convertInputRef.current) convertInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setStatusText('Converting template formatting...');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

      const pickupId = customPickupId.trim();

      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || index + 1;
        const finalWayId = (pickupId.toUpperCase() !== 'AUTO') 
          ? \`\${pickupId}-\${String(seq).padStart(3, '0')}\` 
          : (row["Way ID"] || row["Tracking Number"] || "");

        return {
          "Way ID": finalWayId,
          "Merchant Name / Merchant ID": row["Merchant"] || row["Sender"] || row["Merchant Name / Merchant ID"] || "",
          "လက်ခံသူအမည် (Receiver Name)": row["Receiver"] || row["Customer Name"] || row["လက်ခံသူအမည် (Receiver Name)"] || row["Receiver Name"] || "",
          "လက်ခံသူဖုန်း (Receiver Phone)": row["Phone"] || row["လက်ခံသူဖုန်း (Receiver Phone)"] || row["Receiver Phone"] || "",
          "City / Region": row["City"] || row["City / Region"] || "Yangon Region",
          "Township / Service Provider": row["Township/ Provider"] || row["Township"] || row["Township / Service Provider"] || "",
          "Weight": row["Weight"] || row["Actual Weight (kg)"] || "1",
          "လက်ခံသူလိပ်စာ (Receiver Address)": row["Address"] || row["Delivery Address"] || row["လက်ခံသူလိပ်စာ (Receiver Address)"] || row["Receiver Address"] || "",
          "Service Type": row["Service"] || row["Service Type"] || "STANDARD",
          "Payment Type": row["Payment"] || row["Payment Type"] || "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          "Item Price": row["Item Price"] || row["Item"] || "",
          "OS Set Price": row["OS Set Price"] || row["Delivery Charges"] || "",
          "Merchant Tier": row["Merchant Tier"] || "STANDARD"
        };
      });

      const newWorkbook = XLSX.utils.book_new();
      const newWorksheet = XLSX.utils.json_to_sheet(waybillRows);
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Converted Data");
      
      const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
      downloadFile(excelBuffer, \`OS_Template_\${pickupId}_\${file.name}\`);
      setStatusText('Template converted successfully!');
    } catch (error) {
      console.error(error);
      setStatusText('Error converting template.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
      if (convertInputRef.current) convertInputRef.current.value = '';
    }
  };`;

  const startIndex = code.indexOf('const handleTemplateConvert = async (event: any) => {');
  const endIndex = code.indexOf('const downloadFile = (buffer: any, filename: string) => {');
  
  if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + newFunc + '\n\n  ' + code.substring(endIndex);
    fs.writeFileSync(file, code);
    console.log("✅ Widget updated with exact bilingual receiver headers!");
  } else {
    console.log("❌ Could not find handleTemplateConvert to replace.");
  }
} catch (error) {
  console.error(error);
}
