import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { closeRedis, connectRedis } from './infra/redis/redisClient.js';

let closing = false;

async function start() {
  await pool.query('SELECT 1');
  await connectRedis();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[v2] API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[v2] received ${signal}; shutting down`);
    server.close(async (error) => {
      try {
        await closeRedis();
        await pool.end();
        process.exitCode = error ? 1 : 0;
      } catch (closeError) {
        console.error('[v2] shutdown failed', closeError);
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error) => {
  console.error('[v2] startup failed', error);
  await closeRedis().catch(() => {});
  await pool.end();
  process.exitCode = 1;
});
