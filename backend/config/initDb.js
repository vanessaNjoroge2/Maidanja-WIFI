const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function initializeDatabase() {
  try {
    // 1. Check if packages table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'packages'
      );
    `);
    
    const tableExists = checkTable.rows[0].exists;
    
    if (!tableExists) {
      console.log('💾 Database: No packages table found. Initializing schema...');
      const schemaSql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
      await pool.query(schemaSql);
      console.log('💾 Database: Schema created successfully.');
    }

    // 2. Check if hotspot_users table exists (migration-001)
    const checkHotspotTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'hotspot_users'
      );
    `);
    
    const hotspotExists = checkHotspotTable.rows[0].exists;
    
    if (!hotspotExists) {
      console.log('💾 Database: Hotspot tables missing. Running migration-001...');
      const migrationSql = fs.readFileSync(path.join(__dirname, '../../database/migration-001-hotspot.sql'), 'utf8');
      await pool.query(migrationSql);
      console.log('💾 Database: Migration-001 completed.');
    }

    // 3. Check if packages are seeded
    const checkSeed = await pool.query('SELECT COUNT(*) FROM packages');
    if (parseInt(checkSeed.rows[0].count, 10) === 0) {
      console.log('💾 Database: Packages table is empty. Seeding default passes...');
      const seedSql = fs.readFileSync(path.join(__dirname, '../../database/seed.sql'), 'utf8');
      await pool.query(seedSql);
      console.log('💾 Database: Seeding completed.');
    }
  } catch (err) {
    console.error('❌ Database Initialization Failed:', err.message || err);
  }
}

module.exports = initializeDatabase;
