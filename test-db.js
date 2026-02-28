require('dotenv').config({ path: 'backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function findOrder() {
    try {
        const res = await pool.query('SELECT id, cart_id FROM "order" ORDER BY created_at DESC LIMIT 5');
        console.log("Recent Orders in DB:");
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

findOrder();
