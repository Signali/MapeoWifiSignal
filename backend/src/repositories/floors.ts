import { type ReadScope, VISIBLE } from './buildings.ts';
import { query } from './db.ts';

// `outline`: vértices [[x, y], ...] en metros; null = el rectángulo completo (lo completa el service).
// `plan_url`: imagen del plano (/plans/...); null = sin imagen.
export type Floor = {
  id: number;
  building_id: number;
  name: string;
  width_m: number;
  height_m: number;
  outline: number[][] | null;
  plan_url: string | null;
};

// Un piso es visible si lo es su edificio (VISIBLE, con $1 = orgId y $2 = assignedTo).
const FROM_VISIBLE = `FROM floors f JOIN buildings b ON b.id = f.building_id WHERE ${VISIBLE}`;
const COLUMNS = 'f.id, f.building_id, f.name, f.width_m, f.height_m, f.outline, f.plan_url';

export async function listByBuilding(buildingId: number, scope: ReadScope): Promise<Floor[]> {
  const { rows } = await query<Floor>(`SELECT ${COLUMNS} ${FROM_VISIBLE} AND f.building_id = $3 ORDER BY f.id`, [
    scope.orgId,
    scope.assignedTo,
    buildingId,
  ]);
  return rows;
}

export async function findById(id: number, scope: ReadScope): Promise<Floor | undefined> {
  const { rows } = await query<Floor>(`SELECT ${COLUMNS} ${FROM_VISIBLE} AND f.id = $3`, [
    scope.orgId,
    scope.assignedTo,
    id,
  ]);
  return rows[0];
}

// Piso de un punto visible (para validar coordenadas al editarlo). undefined si el punto
// no existe o no es visible.
export async function findByPointId(pointId: number, scope: ReadScope): Promise<Floor | undefined> {
  const { rows } = await query<Floor>(
    `SELECT ${COLUMNS} FROM points p JOIN floors f ON f.id = p.floor_id JOIN buildings b ON b.id = f.building_id
     WHERE ${VISIBLE} AND p.id = $3`,
    [scope.orgId, scope.assignedTo, pointId],
  );
  return rows[0];
}
