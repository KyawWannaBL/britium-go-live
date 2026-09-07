import xlsx from 'xlsx';
import fs from 'fs';
import { getCoordinates } from './geocode_fixer.js';

async function processTemplate() {
    console.log("Reading Britium Registration Template...");
    
    // xlsx will parse the file successfully despite the .csv extension
    const workbook = xlsx.readFile('dispatch_data.csv');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Read as an array of arrays to bypass header formatting/newline issues
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    const outputStream = fs.createWriteStream('ready_for_dispatch.csv');
    outputStream.write('Way_ID,Township,Address,Lat,Lng,Status\n');

    // Skip the first 4 rows (Britium header graphics), start at index 4
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        const wayId = row[0]; // Column A
        
        if (!wayId) continue; // Stop if row is empty

        const rawTownship = row[4] || ''; // Column E
        // Extract exact township: "ရွှေပြည်သာ/Britium Express" -> "ရွှေပြည်သာ"
        const cleanTownship = rawTownship.split('/')[0].trim(); 
        
        const address = row[6] || ''; // Column G

        const coords = await getCoordinates(address, cleanTownship);
        
        // Escape quotes in the address string for safe CSV writing
        const safeAddress = address.replace(/"/g, '""');
        outputStream.write(`${wayId},${cleanTownship},"${safeAddress}",${coords.lat},${coords.lng},${coords.status}\n`);
    }
    
    console.log("Finished! Output saved to ready_for_dispatch.csv");
}

processTemplate();
