import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  const newFunc = `const handleAutoGeocode = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusText('Offline Geocoding... (Instant)');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      // Embedded offline coordinate mapping (No API limits)
      const coordsMap: Record<string, [number, number]> = {
        'ရွှေပြည်သာ': [16.98, 96.09], 'သင်္ဃန်းကျွန်း': [16.82, 96.20], 'မရမ်းကုန်း': [16.86, 96.14],
        'လှိုင်သာယာ': [16.87, 96.06], 'Hlaingtharya (West) Township': [16.87, 96.06],
        'Hlaingtharya(East) Township': [16.87, 96.06], 'ဒဂုံ': [16.79, 96.15], 'လှိုင်': [16.84, 96.12],
        'သာကေတ': [16.80, 96.21], 'တောင်ဥက္ကလာပ': [16.84, 96.19], 'အင်းစိန်': [16.89, 96.10],
        'မင်္ဂလာဒုံ': [17.02, 96.13], 'ရန်ကင်း': [16.83, 96.16], 'အလုံ': [16.78, 96.12],
        'တာမွေ': [16.80, 96.17], 'မြောက်ဥက္ကလာပ': [16.90, 96.16], 'ကျောက်တံတား': [16.77, 96.16],
        'ဗိုလ်တထောင်': [16.77, 96.17], 'လသာ': [16.78, 96.15], 'ဒေါပုံ': [16.78, 96.19],
        'လမ်းမတော်': [16.78, 96.14], 'ပန်းဘဲတန်း': [16.77, 96.15], 'ကမာရွတ်': [16.82, 96.13],
        'ဗဟန်း': [16.81, 96.15], 'စမ်းချောင်း': [16.80, 96.13], 'အောင်မြေသာစံ': [22.0, 96.1],
        'ချမ်းမြသာစည်': [21.94, 96.1], 'ပြည်ကြီးတံခွန်': [21.91, 96.1], 'မဟာအောင်မြေ': [21.96, 96.1],
        'ပုဗ္ဗသီရိ': [19.8, 96.15], 'ဇမ္ဗူသီရိ': [19.74, 96.1], 'ပျဉ်းမနား': [19.74, 96.2]
      };

      let updatedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row['Action'] === 'APPLY_CORRECTION' && (!row['Corrected Latitude'] || !row['Corrected Longitude'])) {
          const t = row['Township'] ? String(row['Township']).trim() : '';
          
          if (coordsMap[t]) {
            row['Corrected Latitude'] = coordsMap[t][0];
            row['Corrected Longitude'] = coordsMap[t][1];
          } else {
            // Fallback to central Yangon if township is unrecognized
            row['Corrected Latitude'] = 16.8;
            row['Corrected Longitude'] = 96.15;
          }
          updatedCount++;
        }
      }

      setStatusText(\`Writing file... (\${updatedCount} fixed)\`);
      const newWorksheet = XLSX.utils.json_to_sheet(rows);
      workbook.Sheets[sheetName] = newWorksheet;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      downloadFile(excelBuffer, \`Fixed_\${file.name}\`);
      setStatusText('Success! Instant fix complete.');
    } catch (error) {
      console.error(error);
      setStatusText('Error processing file.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
      if (geocodeInputRef.current) geocodeInputRef.current.value = '';
    }
  };`;

  const geoStart = code.indexOf('const handleAutoGeocode = async (event: any) => {');
  
  // Safely find where the geocode function ends and the next one begins
  const nextFunc1 = code.indexOf('const handleTemplateConvert', geoStart);
  const nextFunc2 = code.indexOf('const downloadFile', geoStart);
  let geoEnd = Math.min(
    nextFunc1 !== -1 ? nextFunc1 : Infinity, 
    nextFunc2 !== -1 ? nextFunc2 : Infinity
  );

  if (geoStart !== -1 && geoEnd !== Infinity) {
    code = code.substring(0, geoStart) + newFunc + '\n\n  ' + code.substring(geoEnd);
    fs.writeFileSync(file, code);
    console.log("✅ Auto-Geocoder permanently upgraded to instant offline mapping!");
  } else {
    console.log("❌ Could not locate the handleAutoGeocode function bounds.");
  }
} catch (error) {
  console.error(error);
}
