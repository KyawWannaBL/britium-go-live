import pg from 'pg';
import fetch from 'node-fetch';

const { Client } = pg;
const MAPBOX_TOKEN = 'process.env.MAPBOX_TOKEN'; 
const TARGET_TABLE = 'be_portal_pickup_requests';

async function syncCoordinates() {
    const client = new Client({
        host: '127.0.0.1',
        user: 'delivery_db',
        password: 'jHS3JBtieSDGxTye',
        database: 'delivery_db',
        port: 5432
    });

    try {
        await client.connect();
        console.log("✅ Connected to PostgreSQL.");

        // 1. Fetch records missing coordinates (ignoring empty addresses)
        const res = await client.query(`
            SELECT id, delivery_address 
            FROM ${TARGET_TABLE} 
            WHERE (corrected_latitude IS NULL OR corrected_longitude IS NULL) 
            AND delivery_address IS NOT NULL 
            AND delivery_address != ''
        `);
        const records = res.rows;
        console.log(`🔍 Found ${records.length} delivery addresses to geocode.`);

        for (const record of records) {
            
            // --- 2. CHECK ALIAS DICTIONARY FIRST ---
            const aliasCheck = await client.query(
              `SELECT resolved_latitude, resolved_longitude FROM be_location_aliases WHERE merchant_input = $1`,
              [record.delivery_address]
            );

            if (aliasCheck.rowCount > 0) {
              const { resolved_latitude, resolved_longitude } = aliasCheck.rows[0];
              
              await client.query(
                `UPDATE ${TARGET_TABLE} 
                 SET corrected_latitude = $1, corrected_longitude = $2, updated_at = NOW() 
                 WHERE id = $3`,
                [resolved_latitude, resolved_longitude, record.id]
              );
              
              console.log(`✅ Auto-resolved alias for: ${record.delivery_address}`);
              continue; // Skip Mapbox API call and move to the next parcel
            }

            // --- 3. PROCEED TO MAPBOX IF NO ALIAS FOUND ---
            const queryAddress = `${record.delivery_address}, Yangon, Myanmar`;
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryAddress)}.json?access_token=${MAPBOX_TOKEN}`;

            const mapRes = await fetch(geocodeUrl);
            const mapData = await mapRes.json();

            if (mapData.features && mapData.features.length > 0) {
                const [lng, lat] = mapData.features[0].center;

                await client.query(
                    `UPDATE ${TARGET_TABLE} SET corrected_latitude = $1, corrected_longitude = $2 WHERE id = $3`,
                    [lat, lng, record.id]
                );
                console.log(`📍 Updated ID ${record.id}: ${lat}, ${lng}`);
            } else {
                console.log(`⚠️ Could not find coordinates for: ${record.delivery_address}`);
            }
            
            // Brief pause to respect Mapbox API rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log("🎉 All coordinates synced successfully!");
    } catch (err) {
        console.error("❌ Sync failed:", err.message);
    } finally {
        await client.end();
    }
}

syncCoordinates();
