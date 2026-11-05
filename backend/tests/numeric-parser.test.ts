import { afterAll, expect, test } from 'vitest';
import { pool } from '../src/repositories/db.ts';

// Regla de src/repositories/README.md: toda columna numeric llega como number.
// Recorre el esquema, así una columna numeric nueva queda cubierta sin tocar el test.

afterAll(() => pool.end());

test('todas las columnas numeric del esquema llegan como number', async () => {
  const { rows: columns } = await pool.query<{ column_ref: string; sql: string }>(
    `SELECT table_name || '.' || column_name AS column_ref,
            format('SELECT %I AS value FROM %I WHERE %I IS NOT NULL LIMIT 1',
                   column_name, table_name, column_name) AS sql
       FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'numeric'
      ORDER BY table_name, column_name`,
  );
  expect(columns.length).toBeGreaterThan(0);

  for (const { column_ref, sql } of columns) {
    const { rows } = await pool.query<{ value: unknown }>(sql);
    expect(rows, `${column_ref} no tiene datos: agregar una fila en db/seed.sql`).toHaveLength(1);
    expect(typeof rows[0].value, column_ref).toBe('number');
    expect(Number.isFinite(rows[0].value), column_ref).toBe(true);
  }
});
