import { AppError } from '../errors.ts';
import * as floors from '../repositories/floors.ts';
import * as points from '../repositories/points.ts';
import { readScope } from './buildings.ts';
import type { TokenUser } from './token.ts';

// Mismo 404 si no existe, es de otra organización o es de un edificio que el cliente no
// tiene asignado: nunca se revela que existe.
const floorNotFound = () => new AppError('not_found', 'Piso no encontrado');
const pointNotFound = () => new AppError('not_found', 'Punto no encontrado');

// Regla de dominio (422): 0 ≤ x ≤ width_m y 0 ≤ y ≤ height_m. Se revisan solo las
// coordenadas que llegan (en PATCH pueden venir una o ninguna). Va antes de escribir, así
// que gana al 409 si los dos aplican.
function assertInside(floor: floors.Floor, x: number | undefined, y: number | undefined): void {
  const inside = (value: number | undefined, max: number) => value === undefined || (value >= 0 && value <= max);
  if (!inside(x, floor.width_m) || !inside(y, floor.height_m)) {
    throw new AppError('domain_rule', `Las coordenadas quedan fuera del piso (${floor.width_m} x ${floor.height_m} m)`);
  }
}

export async function listByFloor(user: TokenUser, floorId: number) {
  const scope = readScope(user);
  if (!(await floors.findById(floorId, scope))) throw floorNotFound();
  return points.listByFloor(floorId, scope);
}

export async function getById(user: TokenUser, id: number) {
  const point = await points.findById(id, readScope(user));
  if (!point) throw pointNotFound();
  return point;
}

// Crear y editar: admin y tecnico (lo exige la ruta). Las medidas del piso no cambian por
// la API, así que leer el piso y después escribir no abre una carrera.
export async function create(user: TokenUser, point: points.NewPoint) {
  const floor = await floors.findById(point.floor_id, readScope(user));
  if (!floor) throw floorNotFound();
  assertInside(floor, point.x, point.y);
  return points.create(point);
}

export async function update(user: TokenUser, id: number, changes: points.PointChanges) {
  const floor = await floors.findByPointId(id, readScope(user));
  if (!floor) throw pointNotFound();
  assertInside(floor, changes.x, changes.y);
  // Si el punto se borró entre la lectura y la escritura, no hay fila → 404.
  const point = await points.update(id, user.orgId, changes);
  if (!point) throw pointNotFound();
  return point;
}

// Borrar: solo admin (lo exige la ruta).
export async function remove(user: TokenUser, id: number): Promise<void> {
  if (!(await points.remove(id, user.orgId))) throw pointNotFound();
}
