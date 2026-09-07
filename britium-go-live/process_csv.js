import fs from 'fs';
import csv from 'csv-parser';
import { getCoordinates } from './geocode_fixer.js';

const results = [];
const outputStream = fs.createWriteStream('corrected_dispatch_data.csv');

// Write CSV Headers
outputStream.write('Delivery_Way_ID,Township,Original_Address,New_Lat,New_Lng,Action\n');

fs.createReadStream('dispatch_data.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', async () => {
    console.log(`Processing ${results.length} records...`);
    
    for (const row of results) {
        if (row['Action'] !== 'APPLY_CORRECTION') continue;

        const id = row['Delivery Way ID'];
        const township = row['Township'];
        const address = row['Delivery Address'];

        const coords = await getCoordinates(address, township);
        
        outputStream.write(`${id},${township},"${address}",${coords.lat},${coords.lng},${coords.status}\n`);
    }
    console.log('Finished! Check corrected_dispatch_data.csv');
  });
