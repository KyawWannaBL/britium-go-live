import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  const newWidget = `function BritiumQuickTools() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [customPickupId, setCustomPickupId] = useState('');
  
  const geocodeInputRef = useRef<HTMLInputElement>(null);
  const convertInputRef = useRef<HTMLInputElement>(null);

  const handleAutoGeocode = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusText('Reading Location Review Excel...');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      setStatusText('Geocoding missing addresses...');
      let updatedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row['Action'] === 'APPLY_CORRECTION' && (!row['Corrected Latitude'] || !row['Corrected Longitude'])) {
          const address = \`\${row['Delivery Address'] || ''}, \${row['Township'] || ''}, Yangon, Myanmar\`;
          
          const res = await fetch(\`https://nominatim.openstreetmap.org/search?q=\${encodeURIComponent(address)}&format=json&limit=1\`);
          const geoData = await res.json();

          if (geoData && geoData.length > 0) {
            row['Corrected Latitude'] = parseFloat(geoData[0].lat);
            row['Corrected Longitude'] = parseFloat(geoData[0].lon);
            updatedCount++;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setStatusText(\`Writing file... (\${updatedCount} fixed)\`);
      
      const newWorksheet = XLSX.utils.json_to_sheet(rows);
      workbook.Sheets[sheetName] = newWorksheet;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      downloadFile(excelBuffer, \`Fixed_\${file.name}\`);
      setStatusText(\`Success! Fixed \${updatedCount} locations.\`);
    } catch (error) {
      console.error(error);
      setStatusText('Error processing file.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
      if (geocodeInputRef.current) geocodeInputRef.current.value = '';
    }
  };

  const handleTemplateConvert = async (event: any) => {
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

      // This dynamically creates the correct ID-001 sequential numbering you requested!
      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || index + 1;
        return {
          "Seq": seq,
          "Way ID": \`\${pickupId}-\${String(seq).padStart(3, '0')}\`,
          "Merchant": row["Merchant"] || row["Sender"] || "",
          "Matched pickup": pickupId,
          "Receiver": row["Receiver"] || row["Customer Name"] || "",
          "Phone": row["Phone"] || "",
          "City": row["City"] || "Yangon Region",
          "Township / Provider": row["Township/ Provider"] || row["Township"] || "",
          "Weight": row["Weight"] || "-",
          "Address": row["Address"] || "",
          "Service": row["Service"] || "STANDARD",
          "Payment": row["Payment"] || "EXACT"
        };
      });

      const newWorkbook = XLSX.utils.book_new();
      const newWorksheet = XLSX.utils.json_to_sheet(waybillRows);
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Converted Data");
      
      const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
      downloadFile(excelBuffer, \`Waybill_\${pickupId}_\${file.name}\`);
      setStatusText('Template converted successfully!');
    } catch (error) {
      console.error(error);
      setStatusText('Error converting template.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
      if (convertInputRef.current) convertInputRef.current.value = '';
    }
  };

  const downloadFile = (buffer: any, filename: string) => {
    const data = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 rounded-xl border border-[#2b6388] bg-[#0c1e2c] p-4 shadow-2xl w-72">
      <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-[#f6b84b]">
        Data Processing Tools
      </div>
      
      <div className="flex flex-col gap-1 mb-2">
        <label className="text-[10px] font-bold text-[#8db4ce]">Remarkable Name (Bulk Container ID)</label>
        <input 
          type="text" 
          value={customPickupId} 
          onChange={e => setCustomPickupId(e.target.value)} 
          placeholder="e.g. INBOUND-0609"
          className="w-full rounded border border-[#1a3a5c] bg-[#061524] px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#f6b84b]"
        />
      </div>
      
      <input type="file" accept=".xlsx, .xls" ref={convertInputRef} onChange={handleTemplateConvert} className="hidden" />
      <button 
        onClick={() => convertInputRef.current?.click()}
        disabled={isProcessing}
        className="rounded bg-[#1a3a53] px-4 py-2 text-xs font-bold text-white hover:bg-[#2b6388] disabled:opacity-50"
      >
        📄 Convert Manifest to Waybill
      </button>

      <input type="file" accept=".xlsx, .xls" ref={geocodeInputRef} onChange={handleAutoGeocode} className="hidden" />
      <button 
        onClick={() => geocodeInputRef.current?.click()}
        disabled={isProcessing}
        className="rounded bg-[#1a3a53] px-4 py-2 text-xs font-bold text-white hover:bg-[#2b6388] disabled:opacity-50"
      >
        🎯 Auto-Geocode Review File
      </button>

      {statusText && (
        <div className="mt-2 text-center text-[10px] font-bold text-[#f6b84b] animate-pulse">
          {statusText}
        </div>
      )}
    </div>
  );
}`;

  const updatedCode = code.replace(/function BritiumQuickTools\(\) \{[\s\S]*?export default function DataEntryFinancialV2Page/m, newWidget + '\n\nexport default function DataEntryFinancialV2Page');
  
  if (updatedCode !== code) {
    fs.writeFileSync(file, updatedCode);
    console.log("✅ Widget updated successfully with Remarkable Name field!");
  } else {
    console.log("❌ Could not find the widget to replace.");
  }
} catch (error) {
  console.error("Error:", error);
}
