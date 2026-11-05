import { AppError } from '../errors.ts';
import * as buildings from '../repositories/buildings.ts';
import type { TokenUser } from './token.ts';

// Contrato §3: admin y tecnico leen todos los edificios de su organización; un cliente,
// solo los que tiene asignados (consultados en cada petición, no van en el token).
function readScope(user: TokenUser): buildings.ReadScope {
  return { orgId: user.orgId, assignedTo: user.role === 'cliente' ? user.id : null };
}

// Mismo 404 si no existe, es de otra organización o el cliente no lo tiene asignado:
// nunca se revela que existe.
const notFound = () => new AppError('not_found', 'Edificio no encontrado');

export function list(user: TokenUser) {
  return buildings.list(readScope(user));
}

export async function getById(user: TokenUser, id: number) {
  const building = await buildings.findById(id, readScope(user));
  if (!building) throw notFound();
  return building;
}

// Escribir es solo de admin (lo exige la ruta con requireRole), siempre en su organización.
export function create(user: TokenUser, name: string) {
  return buildings.create(user.orgId, name);
}

export async function update(user: TokenUser, id: number, name: string) {
  const building = await buildings.update(id, user.orgId, name);
  if (!building) throw notFound();
  return building;
}

export async function remove(user: TokenUser, id: number): Promise<void> {
  if (!(await buildings.remove(id, user.orgId))) throw notFound();
}
