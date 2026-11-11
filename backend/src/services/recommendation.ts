import { cellCenter, distance, gridOf, insideOutline, outlineOf, predictRssi } from './analysis-model.ts';
import type { FloorShape } from './analysis-model.ts';
import { categoryOf } from './signal-category.ts';
import type { Category } from './signal-category.ts';

// Ubicación recomendada del repetidor. Contrato §4 «Análisis del piso» y §6.21.
export const REASONS = {
  noEmitter: 'Faltan puntos medidos para estimar el emisor (mínimo 3).',
  allGood: 'Todos los puntos medidos ya tienen señal buena.',
  noPosition: 'Ninguna ubicación del piso mejora la señal de los puntos medidos.',
} as const;

// Emisor de referencia (los valores de la ruta 20).
export interface RefEmitter {
  x: number;
  y: number;
  p0_dbm: number;
  n: number;
}

// Un punto medido en la fase «antes» con su categoría.
export interface MeasuredPoint {
  x: number;
  y: number;
  category: Category;
}

export interface Recommendation {
  position: { x: number; y: number } | null;
  target_points: number | null;
  covered_points: number | null;
  reason: string | null;
}

// El repetidor se supone con el mismo P0 y n que el emisor. Una candidata (centro de la grilla dentro del
// contorno del piso) es válida si el emisor le da señal «buena»; gana la que más puntos no «buenos» pasa a «buena». Empate: mayor señal desde el
// emisor, luego menor y, luego menor x.
export function recommend(floor: FloorShape, emitter: RefEmitter | null, points: MeasuredPoint[]): Recommendation {
  if (emitter === null) return { position: null, target_points: null, covered_points: null, reason: REASONS.noEmitter };

  const targets = points.filter((p) => p.category !== 'buena');
  if (targets.length === 0) return { position: null, target_points: 0, covered_points: 0, reason: REASONS.allGood };

  const grid = gridOf(floor);
  const outline = outlineOf(floor);
  let best: { x: number; y: number; covered: number; fromEmitter: number } | null = null;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const { x, y } = cellCenter(grid, col, row);
      if (!insideOutline(outline, x, y)) continue; // el repetidor se instala dentro del edificio
      const fromEmitter = predictRssi(emitter.p0_dbm, emitter.n, distance(x, y, emitter.x, emitter.y));
      if (categoryOf(fromEmitter) !== 'buena') continue;
      let covered = 0;
      for (const t of targets) {
        if (categoryOf(predictRssi(emitter.p0_dbm, emitter.n, distance(x, y, t.x, t.y))) === 'buena') covered++;
      }
      // Se recorre por y y x ascendentes: con todo igual se queda la primera (menor y, luego menor x).
      if (best === null || covered > best.covered || (covered === best.covered && fromEmitter > best.fromEmitter)) {
        best = { x, y, covered, fromEmitter };
      }
    }
  }

  if (best === null || best.covered === 0) {
    return { position: null, target_points: targets.length, covered_points: 0, reason: REASONS.noPosition };
  }
  return {
    position: { x: best.x, y: best.y },
    target_points: targets.length,
    covered_points: best.covered,
    reason: null,
  };
}
