const fs = require('fs');
const csv = require('csv-parser');
const mysql = require('mysql2/promise');

async function syncDatabase() {
    // Replace with your aaPanel database credentials
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: 'db_user',
        password: 'db_password',
        database: 'britium_express_db'
    });

    const records = [];
    
    // Read the corrected CSV
    fs.createReadStream('corrected_dispatch_data.csv')
      .pipe(csv())
      .on('data', (data) => records.push(data))
      .on('end', async () => {
          console.log(`Syncing ${records.length} corrected coordinates to the database...`);
          
          for (const row of records) {
              // Only update if we successfully generated a fallback or exact coordinate
              if (row.New_Lat !== 'null' && row.New_Lng !== 'null') {
                  const query = `
                      UPDATE delivery_parcels 
                      SET corrected_latitude = ?, 
                          corrected_longitude = ?, 
                          action = ?,
                          reason = 'PROGRAMMATIC_CORRECTION'
                      WHERE delivery_way_id = ?
                  `;
                  
                  try {
                      await connection.execute(query, [
                          row.New_Lat, 
                          row.New_Lng, 
                          row.Action, 
                          row.Delivery_Way_ID
                      ]);
                      console.log(`✅ Updated ${row.Delivery_Way_ID}`);
                  } catch (err) {
                      console.error(`❌ Failed to update ${row.Delivery_Way_ID}:`, err.message);
                  }
              }
          }
          
          console.log('Database sync complete. App endpoints ready.');
          await connection.end();
      });
}

syncDatabase();
