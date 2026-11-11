import { cellCenter, distance, gridOf, insideOutline, NO_SIGNAL_RSSI_DBM, outlineOf, round1 } from './analysis-model.ts';
import type { FloorShape } from './analysis-model.ts';
import { categoryOf } from './signal-category.ts';
import type { Category } from './signal-category.ts';

// Mapa de calor por IDW (distancia inversa ponderada). Contrato §4 «Análisis del piso» y §6.19.
const IDW_POWER = 2;
const IDW_RADIUS_M = 8;
const COINCIDENT_M = 0.01; // una muestra a menos de 1 cm del centro se toma tal cual

// rssi: la mejor lectura del punto; null si es `sin_senal` (cuenta como −100 dBm).
export interface HeatSample {
  x: number;
  y: number;
  rssi: number | null;
}

export interface HeatCell {
  x: number;
  y: number;
  rssi_dbm: number | null;
  category: Category | null;
}

export interface Heatmap {
  cell_m: number;
  cols: number;
  rows: number;
  points_used: number;
  cells: HeatCell[];
}

function interpolate(cx: number, cy: number, samples: { x: number; y: number; value: number }[]): number | null {
  let weighted = 0;
  let weights = 0;
  const coincident: number[] = [];
  for (const s of samples) {
    const d = distance(cx, cy, s.x, s.y);
    if (d > IDW_RADIUS_M) continue;
    if (d < COINCIDENT_M) {
      coincident.push(s.value);
      continue;
    }
    const w = 1 / d ** IDW_POWER;
    weighted += w * s.value;
    weights += w;
  }
  if (coincident.length > 0) return coincident.reduce((a, b) => a + b, 0) / coincident.length;
  return weights === 0 ? null : weighted / weights;
}

// Celdas por fila (y ascendente) y, dentro de la fila, x ascendente. Solo las celdas cuyo centro cae
// dentro del contorno del piso: afuera del edificio no se pinta nada.
export function buildHeatmap(floor: FloorShape, samples: HeatSample[]): Heatmap {
  const grid = gridOf(floor);
  const outline = outlineOf(floor);
  const values = samples.map((s) => ({ x: s.x, y: s.y, value: s.rssi ?? NO_SIGNAL_RSSI_DBM }));
  const cells: HeatCell[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const { x, y } = cellCenter(grid, col, row);
      if (!insideOutline(outline, x, y)) continue;
      const value = interpolate(x, y, values);
      if (value === null) {
        cells.push({ x, y, rssi_dbm: null, category: null });
        continue;
      }
      // La categoría se calcula sobre el valor ya redondeado: lo que se muestra y lo que se pinta coinciden.
      const rssi = round1(value);
      cells.push({ x, y, rssi_dbm: rssi, category: categoryOf(rssi) });
    }
  }
  return { ...grid, points_used: samples.length, cells };
}
