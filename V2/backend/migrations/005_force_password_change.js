export async function up(client) {
  await client.query(`
    ALTER TABLE tenant_members
      ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
  `);
}
