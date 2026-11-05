// `npm run seed`: deja la base con los datos de ejemplo. SOLO desarrollo y demo.
// 1) Ejecuta db/seed.sql (resetea las tablas y carga los datos de dominio).
// 2) Crea los 3 usuarios con las claves de SEED_*_PASSWORD (.env), hasheadas con bcrypt.
// Todo en una transacción: si algo falla, la base queda como estaba.
// Es un script de desarrollo, no parte del servicio: por eso su SQL no está en repositories/.
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../src/config.ts';
import { pool } from '../src/repositories/db.ts';

const ORG_NAME = 'Inmobiliaria Norte';
const BCRYPT_ROUNDS = 10;

export async function seed(): Promise<void> {
  if (config.env === 'production') {
    throw new Error('El seed borra todos los datos: no se corre con NODE_ENV=production');
  }

  const passwords = z
    .object({
      SEED_ADMIN_PASSWORD: z.string().min(1),
      SEED_TECNICO_PASSWORD: z.string().min(1),
      SEED_CLIENTE_PASSWORD: z.string().min(1),
    })
    .parse(process.env);

  const users = [
    { emailLocal: 'admin', role: 'admin', password: passwords.SEED_ADMIN_PASSWORD },
    { emailLocal: 'tecnico', role: 'tecnico', password: passwords.SEED_TECNICO_PASSWORD },
    { emailLocal: 'cliente', role: 'cliente', password: passwords.SEED_CLIENTE_PASSWORD },
  ];

  const seedSql = readFileSync(new URL('../../db/seed.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(seedSql);

    // Prioridad del corporativo: los usuarios de la org usan su dominio corporativo.
    const { rows: domains } = await client.query<{ org_id: number; domain_id: number }>(
      `SELECT o.id AS org_id, d.id AS domain_id
         FROM organizations o
         JOIN email_domains d ON d.org_id = o.id AND d.kind = 'corporativo'
        WHERE o.name = $1`,
      [ORG_NAME],
    );
    if (domains.length !== 1) {
      throw new Error(`Se esperaba un dominio corporativo para "${ORG_NAME}" en db/seed.sql`);
    }
    const { org_id: orgId, domain_id: domainId } = domains[0];

    for (const user of users) {
      const hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (org_id, email_local, email_domain_id, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [orgId, user.emailLocal, domainId, hash, user.role],
      );

      // El cliente solo ve Torre Norte (Oficinas Centro le responde 404).
      if (user.role === 'cliente') {
        await client.query(
          `INSERT INTO user_buildings (user_id, building_id)
           SELECT $1, id FROM buildings WHERE org_id = $2 AND name = 'Torre Norte'`,
          [rows[0].id, orgId],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.main) {
  try {
    await seed();
    console.log(`Seed cargado en la base "${config.db.database}".`);
  } finally {
    await pool.end();
  }
}
