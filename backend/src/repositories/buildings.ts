import { query } from './db.ts';

export type Building = { id: number; name: string };

// Qué edificios puede leer quien llama: los de su organización y, si `assignedTo` no es
// null, solo los asignados a ese usuario (user_buildings). Lo decide el service.
export type ReadScope = { orgId: number; assignedTo: number | null };

// Filtro de lectura sobre `b`, con $1 = orgId y $2 = assignedTo. El org_id se exige
// siempre, también con asignación: una asignación a un edificio de otra organización
// no lo hace visible. Pisos y puntos lo reutilizan con un JOIN a buildings b.
export const VISIBLE = `b.org_id = $1
  AND ($2::integer IS NULL
       OR EXISTS (SELECT 1 FROM user_buildings ub WHERE ub.building_id = b.id AND ub.user_id = $2))`;

export async function list(scope: ReadScope): Promise<Building[]> {
  const { rows } = await query<Building>(`SELECT b.id, b.name FROM buildings b WHERE ${VISIBLE} ORDER BY b.id`, [
    scope.orgId,
    scope.assignedTo,
  ]);
  return rows;
}

export async function findById(id: number, scope: ReadScope): Promise<Building | undefined> {
  const { rows } = await query<Building>(`SELECT b.id, b.name FROM buildings b WHERE b.id = $3 AND ${VISIBLE}`, [
    scope.orgId,
    scope.assignedTo,
    id,
  ]);
  return rows[0];
}

// Nombre repetido en la organización → 409 (buildings_org_name_key, traducido en db.ts).
export async function create(orgId: number, name: string): Promise<Building> {
  const { rows } = await query<Building>('INSERT INTO buildings (org_id, name) VALUES ($1, $2) RETURNING id, name', [
    orgId,
    name,
  ]);
  return rows[0];
}

// undefined si no existe en la organización. Nombre repetido → 409.
export async function update(id: number, orgId: number, name: string): Promise<Building | undefined> {
  const { rows } = await query<Building>(
    'UPDATE buildings SET name = $3 WHERE id = $1 AND org_id = $2 RETURNING id, name',
    [id, orgId, name],
  );
  return rows[0];
}

// false si no existe en la organización. Con pisos → 409 (floors_building_id_fkey,
// ON DELETE RESTRICT). Las asignaciones (user_buildings) se borran en cascada.
export async function remove(id: number, orgId: number): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM buildings WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rowCount === 1;
}
