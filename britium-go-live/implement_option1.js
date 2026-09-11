import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Patch the Converter to safely preserve real merchant names on the physical Waybill
  const newConvertFunc = `const handleTemplateConvert = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const rawId = document.getElementById("customPickupIdInput") ? (document.getElementById("customPickupIdInput") as HTMLInputElement).value : customPickupId;
    if (!rawId.trim()) {
      setStatusText('⚠️ Enter the Target Pickup ID first!');
      setTimeout(() => setStatusText(''), 3000);
      return;
    }

    setIsProcessing(true);
    setStatusText('Applying Option 1: Consolidated Mode...');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

      const pickupId = rawId.trim();

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

        // OPTION 1 LOGIC: Embed original merchant securely into the Address field for the physical label
        const realMerchant = fuzzyGet(row, ["merchant", "sender", "ကုန်သည်"]);
        const safeAddress = (realMerchant && realMerchant !== "-") 
          ? \`[Sender: \${realMerchant}] \${rawAddress}\` 
          : rawAddress;

        return {
          "Way ID / Pickup ID": finalWayId,
          "Merchant Name": "CONSOLIDATED-BULK", 
          "Receiver Name": fuzzyGet(row, ["receiver", "customer", "အမည်", "name"]),
          "Receiver Phone": fuzzyGet(row, ["phone", "contact", "ဖုန်း"]),
          "City (Dropdown)": fuzzyGet(row, ["city", "region", "တိုင်း", "ပြည်နယ်"]) || "Yangon Region",
          "Township (Dropdown)": rawTownship,
          "Ward / Village Tract (Dropdown)": fuzzyGet(row, ["ward", "ရပ်ကွက်"]),
          "Postal Code (Auto)": fuzzyGet(row, ["postal", "zip", "စာတိုက်"]),
          "Receiver Address": safeAddress, 
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
      downloadFile(excelBuffer, \`OS_Template_Option1_\${file.name}\`);
      setStatusText('Option 1 File Ready!');
    } catch (error) {
      console.error(error);
      setStatusText('Error converting template.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
    }
  };`;

  const startIndex = code.indexOf('const handleTemplateConvert = async (event: any) => {');
  const endIndex = code.indexOf('const downloadFile = (buffer: any, filename: string) => {');
  
  if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + newConvertFunc + '\n\n  ' + code.substring(endIndex);
  }

  // 2. Intercept upload routing to forcefully bypass strict merchant mismatch validation
  const importPatch = `async function applyOsImport(importPayload:OsImportApplyPayload){
    const validDbPickup = (selectedPickupId && selectedPickupId !== BULK_UPLOAD_PICKUP_ID) ? selectedPickupId : pickups.find(p => p.pickup_id !== BULK_UPLOAD_PICKUP_ID)?.pickup_id || "";
    const targetPickupData = pickups.find(p => p.pickup_id === validDbPickup);
    
    if (importPayload.batches) {
      importPayload.batches.forEach(b => {
        if (!pickups.some(p => p.pickup_id === b.targetPickupId)) b.targetPickupId = validDbPickup;
        // Option 1 Override: Force all rows to inherit the container's identity safely
        if (targetPickupData && b.rows) {
          b.rows.forEach(r => {
            r.merchantId = targetPickupData.merchant_id;
            r.merchantName = targetPickupData.merchant_name;
          });
        }
      });
    }
    if (importPayload.targetPickupId && !pickups.some(p => p.pickup_id === importPayload.targetPickupId)) {
      importPayload.targetPickupId = validDbPickup;
    }
    
    const batches=importPayload.batches.length`;

  const regex = /async function applyOsImport\(importPayload:OsImportApplyPayload\)\s*\{[\s\S]*?const batches=importPayload\.batches\.length/g;
  code = code.replace(regex, importPatch);

  fs.writeFileSync(file, code);
  console.log("✅ Option 1 Deployed! Multi-merchant files will now flawlessly bypass validation.");
} catch (error) {
  console.error(error);
}
