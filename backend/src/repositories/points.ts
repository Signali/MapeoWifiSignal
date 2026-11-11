import { type ReadScope, VISIBLE } from './buildings.ts';
import { query } from './db.ts';

export type Point = { id: number; floor_id: number; code: string; x: number; y: number; nfc_uid: string };
export type NewPoint = Omit<Point, 'id'>;
export type PointChanges = Partial<Pick<Point, 'code' | 'x' | 'y' | 'nfc_uid'>>;

// Un punto es visible si lo es el edificio de su piso (VISIBLE, $1 = orgId, $2 = assignedTo).
const FROM_VISIBLE = `FROM points p JOIN floors f ON f.id = p.floor_id JOIN buildings b ON b.id = f.building_id
  WHERE ${VISIBLE}`;
const COLUMNS = 'p.id, p.floor_id, p.code, p.x, p.y, p.nfc_uid';
// Escrituras: el punto debe ser de la organización del token (por su piso y edificio).
const IN_ORG = 'p.id = $1 AND f.id = p.floor_id AND b.id = f.building_id AND b.org_id = $2';

export async function listByFloor(floorId: number, scope: ReadScope): Promise<Point[]> {
  const { rows } = await query<Point>(`SELECT ${COLUMNS} ${FROM_VISIBLE} AND p.floor_id = $3 ORDER BY p.id`, [
    scope.orgId,
    scope.assignedTo,
    floorId,
  ]);
  return rows;
}

export async function findById(id: number, scope: ReadScope): Promise<Point | undefined> {
  const { rows } = await query<Point>(`SELECT ${COLUMNS} ${FROM_VISIBLE} AND p.id = $3`, [
    scope.orgId,
    scope.assignedTo,
    id,
  ]);
  return rows[0];
}

export type PointWithPlace = Point & { floor: { id: number; name: string }; building: { id: number; name: string } };

// El nfc_uid llega en mayúsculas (como se guarda). Misma visibilidad que findById.
export async function findByTag(nfcUid: string, scope: ReadScope): Promise<PointWithPlace | undefined> {
  const { rows } = await query<PointWithPlace>(
    `SELECT ${COLUMNS},
            json_build_object('id', f.id, 'name', f.name) AS floor,
            json_build_object('id', b.id, 'name', b.name) AS building
     ${FROM_VISIBLE} AND p.nfc_uid = $3`,
    [scope.orgId, scope.assignedTo, nfcUid],
  );
  return rows[0];
}

// El service ya comprobó que el piso es visible y que las coordenadas caben. code
// repetido en el piso o nfc_uid repetido → 409 (traducido en db.ts). La FK floor_id no va
// al mapa de conflictos: un piso inexistente es 404 y lo decide el service.
export async function create(point: NewPoint): Promise<Point> {
  const { rows } = await query<Point>(
    `INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, floor_id, code, x, y, nfc_uid`,
    [point.floor_id, point.code, point.x, point.y, point.nfc_uid],
  );
  return rows[0];
}

// Solo cambia los campos enviados (COALESCE con null = sin cambio). undefined si el punto
// no existe en la organización. code o nfc_uid repetidos → 409.
export async function update(id: number, orgId: number, changes: PointChanges): Promise<Point | undefined> {
  const { rows } = await query<Point>(
    `UPDATE points p
     SET code = COALESCE($3, p.code), x = COALESCE($4, p.x), y = COALESCE($5, p.y), nfc_uid = COALESCE($6, p.nfc_uid)
     FROM floors f, buildings b
     WHERE ${IN_ORG}
     RETURNING ${COLUMNS}`,
    [id, orgId, changes.code ?? null, changes.x ?? null, changes.y ?? null, changes.nfc_uid ?? null],
  );
  return rows[0];
}

// false si el punto no existe en la organización. Nada referencia a points: sin 409.
export async function remove(id: number, orgId: number): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM points p USING floors f, buildings b WHERE ${IN_ORG}`, [id, orgId]);
  return rowCount === 1;
}
