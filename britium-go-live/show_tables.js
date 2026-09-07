import pg from 'pg';
const { Client } = pg;

async function run() {
    const client = new Client({
        host: '127.0.0.1', 
        user: 'delivery_db', 
        password: 'jHS3JBtieSDGxTye', 
        database: 'delivery_db',
        port: 5433
    });
    
    try {
        await client.connect();
        const res = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';");
        console.log("✅ Success! Your PostgreSQL tables are:");
        console.log(res.rows.map(r => r.tablename));
    } catch (err) {
        console.error("❌ Connection failed:", err.message);
    } finally {
        await client.end();
    }
}
run();
