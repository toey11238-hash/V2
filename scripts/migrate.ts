import { loadConfig } from '@autoserver/config';
import { Database, runMigrations } from '@autoserver/database';

const config = loadConfig();
const db = new Database(config);
try {
  const ran = await runMigrations(db);
  console.log(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Database is already current.');
} finally {
  await db.close();
}
