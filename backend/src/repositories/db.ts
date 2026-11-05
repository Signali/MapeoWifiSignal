import pg from 'pg';
import { config } from '../config.ts';

// `numeric` llega de pg como texto ("12.50"); la API devuelve números (12.5).
// Único lugar donde se convierte: ver la regla en el README de esta carpeta.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool(config.db);
