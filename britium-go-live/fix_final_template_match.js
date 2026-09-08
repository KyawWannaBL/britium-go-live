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
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

      const pickupId = customPickupId.trim();

      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || row["No"] || row["Row"] || index + 1;
        const finalWayId = (pickupId.toUpperCase() !== 'AUTO') 
          ? \`\${pickupId}-\${String(seq).padStart(3, '0')}\` 
          : (row["Way ID"] || row["Way ID / Pickup ID"] || row["Tracking Number"] || "");

        return {
          "Way ID / Pickup ID": finalWayId,
          "Merchant Name": row["Merchant"] || row["Merchant Name"] || row["Sender"] || "",
          "Receiver Name": row["Receiver"] || row["Receiver Name"] || row["Customer Name"] || row["လက်ခံသူအမည် (Receiver Name)"] || "",
          "Receiver Phone": row["Phone"] || row["Receiver Phone"] || row["လက်ခံသူဖုန်း (Receiver Phone)"] || "",
          "City (Dropdown)": row["City"] || row["City (Dropdown)"] || "Yangon Region",
          "Township (Dropdown)": row["Township"] || row["Township (Dropdown)"] || "",
          "Ward / Village Tract (Dropdown)": row["Ward"] || row["Ward / Village Tract (Dropdown)"] || "",
          "Postal Code (Auto)": row["Postal Code"] || row["Postal Code (Auto)"] || "",
          "Receiver Address": row["Address"] || row["Receiver Address"] || row["Delivery Address"] || row["လက်ခံသူလိပ်စာ (Receiver Address)"] || "",
          "Actual Weight (KG)": row["Weight"] || row["Actual Weight (KG)"] || row["Actual Weight (kg)"] || "1",
          "Service Type": row["Service"] || row["Service Type"] || "STANDARD",
          "Payment Type": row["Payment"] || row["Payment Type"] || "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          "Item Price": row["Item Price"] || row["Item"] || "",
          "OS Set Price": row["OS Price"] || row["OS Set Price"] || row["Delivery Charges"] || "",
          "Merchant Tier": row["Tier"] || row["Merchant Tier"] || "STANDARD",
          "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\\n(Township / Service Provider)": row["Township/ Provider"] || row["Township / Provider"] || row["မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\\n(Township / Service Provider)"] || ""
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
    console.log("✅ Widget successfully aligned with the exact 16-column Waybillgeneratetemplate layout!");
  } else {
    console.log("❌ Could not find handleTemplateConvert to replace.");
  }
} catch (error) {
  console.error(error);
}
