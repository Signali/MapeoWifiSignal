import { AppError } from '../errors.ts';
import * as buildings from '../repositories/buildings.ts';
import * as floors from '../repositories/floors.ts';
import { outlineOf } from './analysis-model.ts';
import type { Vertex } from './analysis-model.ts';
import { readScope } from './buildings.ts';
import type { TokenUser } from './token.ts';

export type FloorOut = Omit<floors.Floor, 'outline'> & { outline: Vertex[] };

// Contrato §6.8: si el edificio no es visible (no existe, es de otra organización o el
// cliente no lo tiene asignado) → 404 del edificio; si es visible y no tiene pisos → [].
// `outline` siempre sale como vértices {x, y}: sin contorno cargado, el rectángulo del piso.
export async function listByBuilding(user: TokenUser, buildingId: number): Promise<FloorOut[]> {
  const scope = readScope(user);
  if (!(await buildings.findById(buildingId, scope))) throw new AppError('not_found', 'Edificio no encontrado');
  const rows = await floors.listByBuilding(buildingId, scope);
  return rows.map((floor) => ({ ...floor, outline: outlineOf(floor) }));
}
