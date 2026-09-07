import fs from 'fs';
import csv from 'csv-parser';
import mysql from 'mysql2/promise';

async function syncDatabase() {
    const connection = await mysql.createConnection({
        host: '150.95.26.174', 
        user: 'delivery_db',
        password: 'jHS3JBtieSDGxTye',
        database: 'delivery_db'
    });

    const records = [];
    
    fs.createReadStream('ready_for_dispatch.csv')
      .pipe(csv())
      .on('data', (data) => records.push(data))
      .on('end', async () => {
          console.log(`Syncing ${records.length} registered parcels to the database...`);
          
          for (const row of records) {
              if (row.Lat !== 'null' && row.Lng !== 'null') {
                  const query = `
                      UPDATE delivery_parcels 
                      SET suggested_latitude = ?, 
                          suggested_longitude = ?, 
                          routing_status = ?,
                          township = ?
                      WHERE delivery_way_id = ?
                  `;
                  
                  try {
                      await connection.execute(query, [
                          row.Lat, 
                          row.Lng, 
                          row.Status,
                          row.Township, 
                          row.Way_ID
                      ]);
                      console.log(`✅ Synced: ${row.Way_ID}`);
                  } catch (err) {
                      console.error(`❌ DB Error on ${row.Way_ID}:`, err.message);
                  }
              }
          }
          
          console.log('Database sync complete. Route planning ready.');
          await connection.end();
      });
}

syncDatabase();
