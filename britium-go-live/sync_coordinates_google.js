import pg from 'pg';
import fetch from 'node-fetch';

const { Client } = pg;
const GOOGLE_API_KEY = 'process.env.GOOGLE_MAPS_API_KEY'; 
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

        const res = await client.query(`
            SELECT id, delivery_address 
            FROM ${TARGET_TABLE} 
            WHERE (corrected_latitude IS NULL OR corrected_longitude IS NULL) 
            AND delivery_address IS NOT NULL 
            AND delivery_address != ''
        `);
        const records = res.rows;
        console.log(`🔍 Found ${records.length} delivery addresses to geocode via Google Maps.`);

        for (const record of records) {
            const aliasCheck = await client.query(
              `SELECT resolved_latitude, resolved_longitude FROM be_location_aliases WHERE merchant_input = $1`,
              [record.delivery_address]
            );

            if (aliasCheck.rowCount > 0) {
              const { resolved_latitude, resolved_longitude } = aliasCheck.rows[0];
              await client.query(
                `UPDATE ${TARGET_TABLE} SET corrected_latitude = $1, corrected_longitude = $2, updated_at = NOW() WHERE id = $3`,
                [resolved_latitude, resolved_longitude, record.id]
              );
              console.log(`✅ Auto-resolved alias for: ${record.delivery_address}`);
              continue; 
            }

            const queryAddress = `${record.delivery_address}, Yangon, Myanmar`;
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryAddress)}&region=MM&key=${GOOGLE_API_KEY}`;

            const googleRes = await fetch(geocodeUrl);
            const googleData = await googleRes.json();

            if (googleData.status === 'OK' && googleData.results.length > 0) {
                const lat = googleData.results[0].geometry.location.lat;
                const lng = googleData.results[0].geometry.location.lng;

                await client.query(
                    `UPDATE ${TARGET_TABLE} SET corrected_latitude = $1, corrected_longitude = $2 WHERE id = $3`,
                    [lat, lng, record.id]
                );
                console.log(`📍 Google found ID ${record.id}: ${lat}, ${lng}`);
            } else {
                console.log(`⚠️ Google could not find: ${record.delivery_address} (Status: ${googleData.status})`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.log("🎉 All coordinates synced via Google Maps!");
    } catch (err) {
        console.error("❌ Sync failed:", err.message);
    } finally {
        await client.end();
    }
}
syncCoordinates();
