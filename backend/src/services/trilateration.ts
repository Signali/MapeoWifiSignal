import {
  distance,
  FIXED_N,
  insideOutline,
  MIN_DISTANCE_M,
  MIN_EMITTER_POINTS,
  N_MAX,
  N_MIN,
  outlineOf,
  round1,
} from './analysis-model.ts';
import type { FloorShape } from './analysis-model.ts';

// Posición del emisor por mínimos cuadrados con RSSI(d) = P0 − 10·n·log10(d). Contrato §4 y §6.20.
// Sin librerías: para una posición (x, y) el modelo es lineal en P0 y n, así que se resuelven en forma
// cerrada y solo se busca la posición (cuadrícula gruesa y refinamiento), de manera determinista.
const COARSE_STEP_M = 0.5; // en pisos de hasta 100 m; en uno mayor crece (a lo más ~200 pasos por lado)
const MIN_STEP_M = 0.005;
const EPSILON = 1e-9;
const MAX_REFINE_STEPS = 10_000;

export interface EmitterSample {
  x: number;
  y: number;
  rssi: number;
}

export interface EmitterFit {
  x: number;
  y: number;
  p0_dbm: number;
  n: number;
  n_fixed: boolean;
  rmse_db: number;
  points_used: number;
}

interface Profile {
  sse: number;
  p0: number;
  n: number;
}

type Found = { x: number; y: number } & Profile;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Mejor P0 y n para un emisor en (x, y), y el error cuadrático que deja.
function profileAt(x: number, y: number, samples: EmitterSample[], freeN: boolean): Profile {
  const loss = samples.map((s) => -10 * Math.log10(Math.max(distance(x, y, s.x, s.y), MIN_DISTANCE_M)));
  const m = samples.length;
  const meanL = loss.reduce((a, b) => a + b, 0) / m;
  const meanR = samples.reduce((a, s) => a + s.rssi, 0) / m;
  let n = FIXED_N;
  if (freeN) {
    let varL = 0;
    let cov = 0;
    for (let i = 0; i < m; i++) {
      varL += (loss[i] - meanL) ** 2;
      cov += (loss[i] - meanL) * (samples[i].rssi - meanR);
    }
    if (varL > EPSILON) n = clamp(cov / varL, N_MIN, N_MAX);
  }
  const p0 = meanR - n * meanL;
  let sse = 0;
  for (let i = 0; i < m; i++) sse += (samples[i].rssi - (p0 + n * loss[i])) ** 2;
  return { sse, p0, n };
}

// null si hay menos de 3 puntos. Con 3 puntos n = 3,0 (n_fixed); con 4 o más se ajusta entre 2,0 y 5,0.
// La posición queda dentro del contorno del piso (el rectángulo, si no tiene contorno propio).
// Valores redondeados a 1 decimal, como en el contrato.
export function fitEmitter(samples: EmitterSample[], floor: FloorShape): EmitterFit | null {
  if (samples.length < MIN_EMITTER_POINTS) return null;
  const freeN = samples.length >= 4;
  const outline = outlineOf(floor);
  const coarse = Math.max(COARSE_STEP_M, Math.max(floor.width_m, floor.height_m) / 200);

  // Cuadrícula gruesa: y ascendente y, dentro, x ascendente; en un empate gana la primera (menor y, luego menor x).
  let best: Found | null = null;
  for (let j = 0; j * coarse <= floor.height_m + EPSILON; j++) {
    const y = Math.min(j * coarse, floor.height_m);
    for (let i = 0; i * coarse <= floor.width_m + EPSILON; i++) {
      const x = Math.min(i * coarse, floor.width_m);
      if (!insideOutline(outline, x, y)) continue;
      const p = profileAt(x, y, samples, freeN);
      if (best === null || p.sse < best.sse - EPSILON) best = { x, y, ...p };
    }
  }
  if (best === null) return null; // un contorno más fino que la cuadrícula: no hay dónde buscar

  // Refinamiento: se prueba a los 8 vecinos que siguen dentro del contorno y, si ninguno mejora, se achica el paso.
  let current: Found = best;
  let step = coarse;
  for (let it = 0; it < MAX_REFINE_STEPS && step >= MIN_STEP_M; it++) {
    let moved: Found = current;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = clamp(current.x + dx * step, 0, floor.width_m);
        const y = clamp(current.y + dy * step, 0, floor.height_m);
        if (!insideOutline(outline, x, y)) continue;
        const p = profileAt(x, y, samples, freeN);
        if (p.sse < moved.sse - EPSILON) moved = { x, y, ...p };
      }
    }
    if (moved === current) step /= 2;
    else current = moved;
  }

  return {
    x: round1(current.x),
    y: round1(current.y),
    p0_dbm: round1(current.p0),
    n: round1(current.n),
    n_fixed: !freeN,
    rmse_db: round1(Math.sqrt(current.sse / samples.length)),
    points_used: samples.length,
  };
}
