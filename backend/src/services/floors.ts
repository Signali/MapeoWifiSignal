import { AppError } from '../errors.ts';
import * as buildings from '../repositories/buildings.ts';
import * as floors from '../repositories/floors.ts';
import { readScope } from './buildings.ts';
import type { TokenUser } from './token.ts';

// Contrato §6.8: si el edificio no es visible (no existe, es de otra organización o el
// cliente no lo tiene asignado) → 404 del edificio; si es visible y no tiene pisos → [].
export async function listByBuilding(user: TokenUser, buildingId: number) {
  const scope = readScope(user);
  if (!(await buildings.findById(buildingId, scope))) throw new AppError('not_found', 'Edificio no encontrado');
  return floors.listByBuilding(buildingId, scope);
}
