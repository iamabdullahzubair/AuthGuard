import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from './pool.js';

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const historyTable = 'v2_schema_migrations';
const lockKey = 2_026_112_501;

async function getMigrationFiles() {
  const names = (await fs.readdir(migrationDir))
    .filter((name) => /^\d{3,}_[a-z0-9_-]+\.js$/i.test(name))
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));

  const numbers = names.map((name) => Number(name.match(/^\d+/)[0]));
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('Migration number prefixes must be unique');
  }

  const migrations = [];
  for (const name of names) {
    const source = await fs.readFile(path.join(migrationDir, name));
    const checksum = crypto.createHash('sha256').update(source).digest('hex');
    const module = await import(pathToFileURL(path.join(migrationDir, name)).href);
    if (typeof module.up !== 'function') {
      throw new Error(`Migration ${name} must export up(client)`);
    }
    migrations.push({ name, checksum, ...module });
  }
  return migrations;
}

async function run(direction) {
  if (!['up', 'status'].includes(direction)) {
    throw new Error('Usage: node src/db/migrate.js [up|status]');
  }

  const migrations = await getMigrationFiles();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (direction === 'up') {
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${historyTable} (
          name TEXT PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    const historyExists = await client.query("SELECT to_regclass($1) AS table_name", [historyTable]);
    const appliedResult = historyExists.rows[0].table_name
      ? await client.query(`SELECT name, checksum FROM ${historyTable} ORDER BY name`)
      : { rows: [] };
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum.trim()]));
    const knownNames = new Set(migrations.map(({ name }) => name));

    for (const [name, checksum] of applied) {
      if (!knownNames.has(name)) throw new Error(`Applied migration file is missing: ${name}`);
      const migration = migrations.find((item) => item.name === name);
      if (migration.checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`);
    }

    if (direction === 'status') {
      const pending = migrations.filter(({ name }) => !applied.has(name));
      console.log(`Applied: ${applied.size}; pending: ${pending.length}`);
      for (const migration of migrations) {
        console.log(`${applied.has(migration.name) ? 'applied' : 'pending'}  ${migration.name}`);
      }
      await client.query('COMMIT');
      return;
    }

    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      console.log(`Applying ${migration.name}`);
      await migration.up(client);
      await client.query(`INSERT INTO ${historyTable} (name, checksum) VALUES ($1, $2)`, [migration.name, migration.checksum]);
    }
    await client.query('COMMIT');
    console.log('V2 database migrations are up to date.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

run(process.argv[2] || 'up')
  .catch((error) => {
    console.error(`[v2 migrations] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
