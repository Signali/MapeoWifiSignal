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
export async function query<R extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<pg.QueryResult<R>> {
  try {
    return await pool.query<R>(text, values);
  } catch (error) {
    if (
      error instanceof pg.DatabaseError &&
      (error.code === '23505' || error.code === '23503') &&
      error.constraint !== undefined &&
      Object.hasOwn(CONFLICTS, error.constraint)
    ) {
      throw new AppError('conflict', CONFLICTS[error.constraint]);
    }
    throw error;
  }
}
