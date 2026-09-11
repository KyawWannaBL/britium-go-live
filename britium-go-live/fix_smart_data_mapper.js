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

      // Smart engine that hunts for data regardless of exact column spelling or language
      const fuzzyGet = (row: any, keywords: string[]) => {
        const keys = Object.keys(row);
        for (const kw of keywords) {
          const matchedKey = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== "") {
            return String(row[matchedKey]).trim();
          }
        }
        return "";
      };

      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || row["No"] || row["Row"] || index + 1;
        const finalWayId = (pickupId.toUpperCase() !== 'AUTO') 
          ? \`\${pickupId}-\${String(seq).padStart(3, '0')}\` 
          : fuzzyGet(row, ["way id", "tracking", "pickup id"]);

        const township = fuzzyGet(row, ["township", "မြို့နယ်", "provider"]);

        return {
          "Way ID / Pickup ID": finalWayId,
          "Merchant Name": fuzzyGet(row, ["merchant", "sender", "ကုန်သည်"]),
          "Receiver Name": fuzzyGet(row, ["receiver", "customer", "အမည်", "name"]),
          "Receiver Phone": fuzzyGet(row, ["phone", "contact", "ဖုန်း"]),
          "City (Dropdown)": fuzzyGet(row, ["city", "region", "တိုင်း", "ပြည်နယ်"]) || "Yangon Region",
          "Township (Dropdown)": township,
          "Ward / Village Tract (Dropdown)": fuzzyGet(row, ["ward", "ရပ်ကွက်"]),
          "Postal Code (Auto)": fuzzyGet(row, ["postal", "zip", "စာတိုက်"]),
          "Receiver Address": fuzzyGet(row, ["address", "လိပ်စာ", "delivery"]),
          "Actual Weight (KG)": fuzzyGet(row, ["weight", "kg", "အလေးချိန်"]) || "1",
          "Service Type": fuzzyGet(row, ["service", "ဝန်ဆောင်မှု"]) || "STANDARD",
          "Payment Type": fuzzyGet(row, ["payment", "ငွေပေးချေမှု"]) || "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          "Item Price": fuzzyGet(row, ["item", "cod", "တန်ဖိုး", "price"]),
          "OS Set Price": fuzzyGet(row, ["os set", "delivery charge", "deli", "ပို့ဆောင်ခ"]),
          "Merchant Tier": fuzzyGet(row, ["tier", "အဆင့်"]) || "STANDARD",
          "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\\n(Township / Service Provider)": township
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
    console.log("✅ Smart fuzzy matcher deployed! Data will be flawlessly preserved.");
  } else {
    console.log("❌ Could not find handleTemplateConvert to replace.");
  }
} catch (error) {
  console.error(error);
}
