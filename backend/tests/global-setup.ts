import { seed } from '../scripts/seed.ts';
import { pool } from '../src/repositories/db.ts';

// Corre una vez antes de todos los tests, con NODE_ENV=test (base DB_NAME_TEST).
export default async function setup(): Promise<void> {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
