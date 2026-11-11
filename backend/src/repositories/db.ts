import pg from 'pg';
import { config } from '../config.ts';
import { AppError } from '../errors.ts';

// `numeric` llega de pg como texto ("12.50"); la API devuelve números (12.5).
// Único lugar donde se convierte: ver la regla en el README de esta carpeta.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool(config.db);

// Constraints cuya violación es un conflicto esperado (409), con el mensaje del contrato.
// Único lugar donde un error de la base (23505 duplicado, 23503 FK) se vuelve 409.
const CONFLICTS: Record<string, string> = {
  buildings_org_name_key: 'Ya existe un edificio con ese nombre',
  floors_building_id_fkey: 'No se puede borrar: el edificio tiene pisos asociados',
  points_floor_code_key: 'Ya existe un punto con ese código en el piso',
  points_nfc_uid_key: 'La tira NFC ya está asociada a otro punto',
};

// pool.query + traducción de conflictos. Una constraint fuera del mapa sigue siendo
// un error inesperado (500): agregar aquí la fila cuando el contrato la define.
// `conflicts` suma constraints solo para esa llamada: una FK como measurements_point_id_fkey
// es un 409 al borrar el punto, pero también salta al insertar una medición con un punto
// inexistente (ahí no es un conflicto), así que no puede ir al mapa global.
export async function query<R extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
  conflicts: Record<string, string> = {},
): Promise<pg.QueryResult<R>> {
  try {
    return await pool.query<R>(text, values);
  } catch (error) {
    const known = { ...CONFLICTS, ...conflicts };
    if (
      error instanceof pg.DatabaseError &&
      (error.code === '23505' || error.code === '23503') &&
      error.constraint !== undefined &&
      Object.hasOwn(known, error.constraint)
    ) {
      throw new AppError('conflict', known[error.constraint]);
    }
    throw error;
  }
}
