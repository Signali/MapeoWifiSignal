import { AppError } from '../errors.ts';
import * as floors from '../repositories/floors.ts';
import * as measurements from '../repositories/measurements.ts';
import * as organizations from '../repositories/organizations.ts';
import * as points from '../repositories/points.ts';
import { readScope } from './buildings.ts';
import { type Category, categoryOf } from './signal-category.ts';
import type { TokenUser } from './token.ts';

export type Reading = Omit<measurements.ReadingRow, 'measurement_id'>;
export type MeasurementOut = {
  id: number;
  point_id: number;
  phase: string;
  measured_at: Date;
  category: Category;
  best_rssi_dbm: number | null;
  voided: { reason: string; at: Date } | null;
  readings: Reading[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_MS = 30 * DAY_MS;
const MAX_FUTURE_MS = 5 * 60 * 1000; // margen por relojes desfasados

// `readings` llega ordenado de la más fuerte a la más débil (lo hace el repositorio).
function toOut(row: measurements.MeasurementRow, rows: measurements.ReadingRow[]): MeasurementOut {
  const readings = rows.map(({ bssid, ssid, rssi_dbm, frequency_mhz }) => ({ bssid, ssid, rssi_dbm, frequency_mhz }));
  const best = readings.length > 0 ? readings[0].rssi_dbm : null;
  return {
    id: row.id,
    point_id: row.point_id,
    phase: row.phase,
    measured_at: row.measured_at,
    category: categoryOf(best),
    best_rssi_dbm: best,
    voided: row.voided_at && row.void_reason ? { reason: row.void_reason, at: row.voided_at } : null,
    readings,
  };
}

async function withReadings(row: measurements.MeasurementRow): Promise<MeasurementOut> {
  return toOut(row, await measurements.readingsOf([row.id]));
}

// Reenvío de un client_uuid (la cola de la app): de la organización → la medición guardada;
// de otra → 409. undefined si el client_uuid es nuevo.
async function alreadyRegistered(user: TokenUser, clientUuid: string): Promise<MeasurementOut | undefined> {
  const row = await measurements.findByClientUuid(clientUuid);
  if (!row) return undefined;
  if (row.org_id !== user.orgId) throw new AppError('conflict', 'client_uuid ya fue usado');
  return withReadings(row);
}

// Registrar: admin y tecnico (lo exige la ruta). Orden del contrato §6.15: client_uuid
// repetido → punto visible (404) → fecha (422) → guardar. Solo se guardan las lecturas del
// SSID de la organización (comparación exacta); las demás se validaron y se descartan.
export async function create(
  user: TokenUser,
  body: {
    point_id: number;
    phase: string;
    client_uuid: string;
    measured_at?: Date;
    readings: Reading[];
  },
): Promise<{ created: boolean; measurement: MeasurementOut }> {
  const existing = await alreadyRegistered(user, body.client_uuid);
  if (existing) return { created: false, measurement: existing };

  if (!(await points.findById(body.point_id, readScope(user)))) throw new AppError('not_found', 'Punto no encontrado');

  const now = Date.now();
  const measuredAt = body.measured_at ?? new Date(now);
  if (measuredAt.getTime() < now - MAX_PAST_MS || measuredAt.getTime() > now + MAX_FUTURE_MS) {
    throw new AppError('domain_rule', 'measured_at debe estar entre los últimos 30 días y ahora');
  }

  const ssid = await organizations.wifiSsidOf(user.orgId);
  const kept = body.readings.filter((reading) => reading.ssid === ssid);
  const row = await measurements.insert(
    { point_id: body.point_id, user_id: user.id, phase: body.phase, client_uuid: body.client_uuid, measured_at: measuredAt },
    kept,
  );
  if (row) return { created: true, measurement: await withReadings(row) };

  // Carrera: otro envío con el mismo client_uuid entró entre la lectura y el insert.
  const raced = await alreadyRegistered(user, body.client_uuid);
  if (!raced) throw new Error('client_uuid en conflicto, pero la medición no existe');
  return { created: false, measurement: raced };
}

// Para pintar el plano: un elemento por cada punto del piso, con su última medición válida de
// la fase o null. Piso no visible → 404 (el mismo que en puntos).
export async function listByFloor(
  user: TokenUser,
  floorId: number,
  phase: string,
): Promise<{ point_id: number; measurement: MeasurementOut | null }[]> {
  const scope = readScope(user);
  if (!(await floors.findById(floorId, scope))) throw new AppError('not_found', 'Piso no encontrado');
  const rows = await measurements.latestByFloor(floorId, phase, scope);
  const found = rows.filter((row) => row.id !== null);
  const readings = found.length > 0 ? await measurements.readingsOf(found.map((row) => row.id!)) : [];
  return rows.map((row) => ({
    point_id: row.point_id,
    measurement:
      row.id === null
        ? null
        : toOut(
            { id: row.id, point_id: row.point_id, phase: row.phase!, measured_at: row.measured_at!, voided_at: row.voided_at, void_reason: row.void_reason },
            readings.filter((r) => r.measurement_id === row.id),
          ),
  }));
}

// Anular: solo admin (lo exige la ruta). Si no hay fila vigente, se distingue entre una ya
// anulada (409) y una que no existe o es de otra organización (404). `assignedTo: null` =
// sin filtro por asignación: el admin ve todos los edificios de su organización.
export async function voidMeasurement(user: TokenUser, id: number, reason: string): Promise<void> {
  if (await measurements.voidMeasurement(id, user.orgId, user.id, reason)) return;
  if (await measurements.findById(id, { orgId: user.orgId, assignedTo: null })) {
    throw new AppError('conflict', 'La medición ya está anulada');
  }
  throw new AppError('not_found', 'Medición no encontrada');
}

export async function getById(user: TokenUser, id: number): Promise<MeasurementOut> {
  const row = await measurements.findById(id, readScope(user));
  if (!row) throw new AppError('not_found', 'Medición no encontrada');
  return withReadings(row);
}
