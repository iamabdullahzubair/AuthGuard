import app from './app.js';
import { config } from './config/index.js';
import { initDb, pool } from './db/index.js';

async function startServer() {
  try {
    console.log('Connecting to database...');
    await initDb();

    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`=================================================`);
      console.log(`🚀 Authenticator Backend running on port ${config.PORT}`);
      console.log(`   - Website: http://localhost:${config.PORT}`);
      console.log(`   - PWA App: http://localhost:${config.PORT}/pwa/`);
      console.log(`   - API:     http://localhost:${config.PORT}/api/health`);
      console.log(`=================================================`);
    });

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('Database pool closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

