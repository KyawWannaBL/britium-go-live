import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function updateCoordinatesHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { pickup_id, latitude, longitude } = req.body;

  if (!pickup_id || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing required location data.' });
  }

  try {
    const query = `
      UPDATE public.be_portal_pickup_requests 
      SET corrected_latitude = $1, 
          corrected_longitude = $2,
          updated_at = NOW()
      WHERE pickup_id = $3 OR deliver_id = $3 OR waybill_no = $3
      RETURNING id, pickup_id;
    `;
    
    const values = [latitude, longitude, pickup_id];
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Parcel not found.' });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Map pin saved successfully.',
      updated_record: result.rows[0] 
    });

  } catch (error) {
    console.error('Database Update Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
