import fs from 'fs';
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
        console.log("⏳ Reading READY_TO_IMPORT.sql...");
        const sql = fs.readFileSync('READY_TO_IMPORT.sql', 'utf8');
        
        console.log("🚀 Injecting schema into PostgreSQL...");
        await client.query(sql);
        
        const res = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';");
        console.log("✅ Success! Your tables are:", res.rows.map(r => r.tablename));
    } catch (err) {
        console.error("❌ Import failed:", err.message);
    } finally {
        await client.end();
    }
}
run();
