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
    setStatusText('Extracting Townships...');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

      const pickupId = customPickupId.trim();

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

      const knownTownships = ["ရွှေပြည်သာ", "သင်္ဃန်းကျွန်း", "မရမ်းကုန်း", "လှိုင်သာယာ", "အင်းစိန်", "မင်္ဂလာဒုံ", "မြောက်ဥက္ကလာပ", "တောင်ဥက္ကလာပ", "သာကေတ", "ဒေါပုံ", "ပုဇွန်တောင်", "ဗိုလ်တထောင်", "ကျောက်တံတား", "ပန်းဘဲတန်း", "လသာ", "လမ်းမတော်", "အလုံ", "ကြည့်မြင်တိုင်", "စမ်းချောင်း", "ဗဟန်း", "ဒဂုံ", "ကမာရွတ်", "လှိုင်", "တောင်ဒဂုံ", "မြောက်ဒဂုံ", "အရှေ့ဒဂုံ", "ဒဂုံဆိပ်ကမ်း", "မင်္ဂလာတောင်ညွန့်", "တာမွေ", "ရန်ကင်း", "ပုဗ္ဗသီရိ", "ဇမ္ဗူသီရိ", "အောင်မြေသာစံ", "ချမ်းမြသာစည်"];

      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || row["No"] || row["Row"] || index + 1;
        const finalWayId = (pickupId.toUpperCase() !== 'AUTO') 
          ? \`\${pickupId}-\${String(seq).padStart(3, '0')}\` 
          : fuzzyGet(row, ["way id", "tracking", "pickup id"]);

        let rawTownship = fuzzyGet(row, ["township", "မြို့နယ်", "provider"]);
        const rawAddress = fuzzyGet(row, ["address", "လိပ်စာ", "delivery"]);

        // Automatic Township Extractor
        if (!rawTownship || rawTownship === "-" || rawTownship.trim() === "") {
          for (const t of knownTownships) {
            if (rawAddress.includes(t)) {
              rawTownship = t;
              break;
            }
          }
          if (!rawTownship || rawTownship === "-") {
            const match = rawAddress.match(/([^\\s၊,]+)(?=\\s*မြို့နယ်)/);
            if (match) rawTownship = match[1].trim();
          }
        }

        return {
          "Way ID / Pickup ID": finalWayId,
          "Merchant Name": fuzzyGet(row, ["merchant", "sender", "ကုန်သည်"]),
          "Receiver Name": fuzzyGet(row, ["receiver", "customer", "အမည်", "name"]),
          "Receiver Phone": fuzzyGet(row, ["phone", "contact", "ဖုန်း"]),
          "City (Dropdown)": fuzzyGet(row, ["city", "region", "တိုင်း", "ပြည်နယ်"]) || "Yangon Region",
          "Township (Dropdown)": rawTownship,
          "Ward / Village Tract (Dropdown)": fuzzyGet(row, ["ward", "ရပ်ကွက်"]),
          "Postal Code (Auto)": fuzzyGet(row, ["postal", "zip", "စာတိုက်"]),
          "Receiver Address": rawAddress,
          "Actual Weight (KG)": fuzzyGet(row, ["weight", "kg", "အလေးချိန်"]) || "1",
          "Service Type": fuzzyGet(row, ["service", "ဝန်ဆောင်မှု"]) || "STANDARD",
          "Payment Type": fuzzyGet(row, ["payment", "ငွေပေးချေမှု"]) || "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          "Item Price": fuzzyGet(row, ["item", "cod", "တန်ဖိုး", "price"]),
          "OS Set Price": fuzzyGet(row, ["os set", "delivery charge", "deli", "ပို့ဆောင်ခ"]),
          "Merchant Tier": fuzzyGet(row, ["tier", "အဆင့်"]) || "STANDARD",
          "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\\n(Township / Service Provider)": rawTownship
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
    console.log("✅ Township Extractor injected! The widget will now pull missing townships straight from the address text.");
  } else {
    console.log("❌ Could not find handleTemplateConvert to replace.");
  }
} catch (error) {
  console.error(error);
}
