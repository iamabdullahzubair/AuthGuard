import Redis from 'ioredis';
import { pool, initDb, query } from '../db/index.js';
import { config } from '../config/index.js';

async function resetAll() {
  console.log('====================================================');
  console.log('⚠️  DANGER: Starting Complete Database & Redis Reset');
  console.log('====================================================');

  // 1. Flush Redis
  if (config.REDIS_URL) {
    try {
      console.log('🧹 Flushing Redis cache (FLUSHALL)...');
      const redis = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.flushall();
      await redis.quit();
      console.log('✅ Redis cache completely wiped clean.');
    } catch (err) {
      console.warn('⚠️ Redis flush skipped or failed:', err.message);
    }
  }

  // 2. Wipe PostgreSQL Database Tables
  try {
    console.log('🧹 Dropping all PostgreSQL tables (DROP SCHEMA public CASCADE)...');
    await query('DROP SCHEMA public CASCADE;');
    await query('CREATE SCHEMA public;');
    await query('GRANT ALL ON SCHEMA public TO public;');
    console.log('✅ PostgreSQL schema wiped clean.');

    // 3. Re-initialize 9-Table Schema & Super Admin Seed
    console.log('⚡ Re-creating 9 multi-tenant tables and seeding Super Admin...');
    await initDb();
    console.log('✅ 9 Multi-Tenant tables created successfully.');
    console.log(`✅ Super Admin seeded from .env: ${config.SUPER_ADMIN_EMAIL}`);
  } catch (err) {
    console.error('❌ Database reset failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('====================================================');
  console.log('🎉 Reset Completed Successfully! System is 100% Fresh.');
  console.log('====================================================');
  process.exit(0);
}

resetAll();
