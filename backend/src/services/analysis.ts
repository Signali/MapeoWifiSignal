import { AppError } from '../errors.ts';
import * as floors from '../repositories/floors.ts';
import * as measurements from '../repositories/measurements.ts';
import { readScope } from './buildings.ts';
import { buildHeatmap } from './heatmap.ts';
import type { Heatmap } from './heatmap.ts';
import { recommend } from './recommendation.ts';
import type { Recommendation } from './recommendation.ts';
import { categoryOf } from './signal-category.ts';
import type { TokenUser } from './token.ts';
import { fitEmitter } from './trilateration.ts';
import type { EmitterFit } from './trilateration.ts';

// Rutas 19 a 21 (contrato §6.19 a §6.21). Leen todos los roles; el cliente solo ve sus edificios.
// Calculan a partir de la última medición válida de cada punto en la fase; no guardan nada.
// Las matemáticas viven en heatmap.ts, trilateration.ts y recommendation.ts (funciones puras).

// Un punto del piso con las lecturas de su última medición válida; null si no tiene medición.
type PointData = { x: number; y: number; readings: measurements.ReadingRow[] | null };

export type EmitterOut = EmitterFit & { bssid: string; ssid: string; frequency_mhz: number; estimated: true };

// `readings` llega ordenado de la más fuerte a la más débil (lo hace el repositorio).
const bestRssi = (readings: measurements.ReadingRow[]): number | null => (readings.length > 0 ? readings[0].rssi_dbm : null);

// Los puntos del piso que tienen medición, con su mejor lectura (null si fue `sin_senal`).
const measuredOf = (points: PointData[]) =>
  points.filter((p) => p.readings !== null).map((p) => ({ x: p.x, y: p.y, rssi: bestRssi(p.readings!) }));

async function loadFloor(user: TokenUser, floorId: number, phase: string) {
  const scope = readScope(user);
  const floor = await floors.findById(floorId, scope);
  if (!floor) throw new AppError('not_found', 'Piso no encontrado');
  const rows = await measurements.latestByFloor(floorId, phase, scope);
  const found = rows.filter((row) => row.id !== null);
  const readings = found.length > 0 ? await measurements.readingsOf(found.map((row) => row.id!)) : [];
  // Se agrupan una sola vez por medición; dentro de cada una se conserva el orden (la más fuerte primero).
  const byMeasurement = new Map<number, measurements.ReadingRow[]>();
  for (const r of readings) {
    const list = byMeasurement.get(r.measurement_id);
    if (list) list.push(r);
    else byMeasurement.set(r.measurement_id, [r]);
  }
  const points: PointData[] = rows.map((row) => ({
    x: row.x,
    y: row.y,
    readings: row.id === null ? null : (byMeasurement.get(row.id) ?? []),
  }));
  return { floor, points };
}

// Cada BSSID con lecturas en 3 o más puntos entra al ajuste. ssid y frecuencia: los de su lectura más fuerte.
function estimateEmitters(floor: floors.Floor, points: PointData[]): EmitterOut[] {
  const byBssid = new Map<string, { x: number; y: number; reading: measurements.ReadingRow }[]>();
  for (const p of points) {
    for (const reading of p.readings ?? []) {
      const list = byBssid.get(reading.bssid) ?? [];
      list.push({ x: p.x, y: p.y, reading });
      byBssid.set(reading.bssid, list);
    }
  }
  const out: EmitterOut[] = [];
  for (const [bssid, list] of byBssid) {
    const fit = fitEmitter(list.map(({ x, y, reading }) => ({ x, y, rssi: reading.rssi_dbm })), floor);
    if (!fit) continue;
    const strongest = list.reduce((a, b) => (b.reading.rssi_dbm > a.reading.rssi_dbm ? b : a)).reading;
    out.push({ bssid, ssid: strongest.ssid, frequency_mhz: strongest.frequency_mhz, ...fit, estimated: true });
  }
  return out.sort((a, b) => b.points_used - a.points_used || (a.bssid < b.bssid ? -1 : 1));
}

export async function heatmapOf(user: TokenUser, floorId: number, phase: string): Promise<{ floor_id: number; phase: string } & Heatmap> {
  const { floor, points } = await loadFloor(user, floorId, phase);
  return { floor_id: floor.id, phase, ...buildHeatmap(floor, measuredOf(points)) };
}

export async function emittersOf(user: TokenUser, floorId: number, phase: string): Promise<EmitterOut[]> {
  const { floor, points } = await loadFloor(user, floorId, phase);
  return estimateEmitters(floor, points);
}

// Siempre con la fase «antes». Emisor de referencia: más points_used; en empate menor rmse_db; luego menor bssid.
// (Distinto del orden de la ruta 20, que por contrato no mira rmse_db: por eso es un segundo orden a propósito.)
export async function recommendationOf(
  user: TokenUser,
  floorId: number,
): Promise<{ floor_id: number; emitter_bssid: string | null; estimated: true } & Recommendation> {
  const { floor, points } = await loadFloor(user, floorId, 'antes');
  const reference = estimateEmitters(floor, points).sort(
    (a, b) => b.points_used - a.points_used || a.rmse_db - b.rmse_db || (a.bssid < b.bssid ? -1 : 1),
  )[0];
  const measured = measuredOf(points).map(({ x, y, rssi }) => ({ x, y, category: categoryOf(rssi) }));
  const result = recommend(floor, reference ?? null, measured);
  return { floor_id: floor.id, position: result.position, emitter_bssid: reference?.bssid ?? null, target_points: result.target_points, covered_points: result.covered_points, reason: result.reason, estimated: true };
}
