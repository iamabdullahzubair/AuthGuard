export async function up(client) {
  await client.query(`
    ALTER TABLE auth_sessions
      ADD COLUMN device_name TEXT NOT NULL DEFAULT 'Browser',
      ADD COLUMN device_type TEXT NOT NULL DEFAULT 'web'
        CHECK (device_type IN ('web', 'pwa', 'mobile'));
  `);
}
