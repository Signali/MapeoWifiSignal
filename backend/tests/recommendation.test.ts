import { describe, expect, test } from 'vitest';
import { cellCenter, distance, gridOf, insideOutline, outlineOf, predictRssi } from '../src/services/analysis-model.ts';
import { REASONS, recommend } from '../src/services/recommendation.ts';
import type { MeasuredPoint, RefEmitter } from '../src/services/recommendation.ts';
import { categoryOf } from '../src/services/signal-category.ts';

const FLOOR = { width_m: 40, height_m: 25 }; // Piso 3 del seed

// Con P0 = −40 y n = 3, la señal es «buena» (> −65 dBm) a menos de unos 6,8 m del emisor.
const EMITTER: RefEmitter = { x: 5, y: 12, p0_dbm: -40, n: 3 };

const point = (x: number, y: number, category: MeasuredPoint['category']): MeasuredPoint => ({ x, y, category });

// Referencia hecha a fuerza bruta para comprobar que la elegida es de verdad la mejor.
function bruteForce(emitter: RefEmitter, points: MeasuredPoint[]) {
  const targets = points.filter((p) => p.category !== 'buena');
  const grid = gridOf(FLOOR);
  const valid: { x: number; y: number; covered: number; fromEmitter: number }[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const { x, y } = cellCenter(grid, col, row);
      const fromEmitter = predictRssi(emitter.p0_dbm, emitter.n, distance(x, y, emitter.x, emitter.y));
      if (categoryOf(fromEmitter) !== 'buena') continue;
      const covered = targets.filter(
        (t) => categoryOf(predictRssi(emitter.p0_dbm, emitter.n, distance(x, y, t.x, t.y))) === 'buena',
      ).length;
      valid.push({ x, y, covered, fromEmitter });
    }
  }
  return { targets: targets.length, valid };
}

describe('recommend', () => {
  test('sin emisor: motivo «Faltan puntos…» y todo lo demás en null', () => {
    expect(recommend(FLOOR, null, [point(10, 10, 'debil')])).toEqual({
      position: null,
      target_points: null,
      covered_points: null,
      reason: REASONS.noEmitter,
    });
    expect(REASONS.noEmitter).toBe('Faltan puntos medidos para estimar el emisor (mínimo 3).');
  });

  test('todos los puntos medidos ya son «buena»: target_points 0 y motivo «Todos los puntos…»', () => {
    const result = recommend(FLOOR, EMITTER, [point(6, 12, 'buena'), point(8, 12, 'buena')]);
    expect(result).toEqual({ position: null, target_points: 0, covered_points: 0, reason: REASONS.allGood });
    expect(REASONS.allGood).toBe('Todos los puntos medidos ya tienen señal buena.');
  });

  test('sin puntos medidos tampoco hay nada que mejorar', () => {
    expect(recommend(FLOOR, EMITTER, []).reason).toBe(REASONS.allGood);
  });

  test('si el emisor no da señal «buena» en ningún lugar: motivo «Ninguna ubicación…» con target_points real', () => {
    const weak: RefEmitter = { x: 5, y: 12, p0_dbm: -80, n: 3 };
    const result = recommend(FLOOR, weak, [point(10, 12, 'debil'), point(14, 12, 'sin_senal')]);
    expect(result).toEqual({ position: null, target_points: 2, covered_points: 0, reason: REASONS.noPosition });
    expect(REASONS.noPosition).toBe('Ninguna ubicación del piso mejora la señal de los puntos medidos.');
  });

  test('si ninguna candidata válida cubre un punto, la mejor cubre 0: motivo «Ninguna ubicación…»', () => {
    // El punto débil está a 30 m del emisor: ninguna candidata alimentada por «buena» llega a él.
    const result = recommend(FLOOR, EMITTER, [point(35, 12, 'debil')]);
    expect(result).toEqual({ position: null, target_points: 1, covered_points: 0, reason: REASONS.noPosition });
  });

  test('elige una candidata válida y que cubre los puntos que puede', () => {
    const points = [point(11, 12, 'debil'), point(12, 14, 'regular'), point(11.5, 10, 'sin_senal'), point(6, 12, 'buena')];
    const result = recommend(FLOOR, EMITTER, points);
    expect(result.reason).toBeNull();
    expect(result.target_points).toBe(3);
    expect(result.covered_points).toBe(3);
    const pos = result.position;
    expect(pos).not.toBeNull();
    // Es válida: el emisor le da señal «buena».
    const fromEmitter = predictRssi(EMITTER.p0_dbm, EMITTER.n, distance(pos?.x ?? 0, pos?.y ?? 0, EMITTER.x, EMITTER.y));
    expect(categoryOf(fromEmitter)).toBe('buena');
  });

  test('coincide con la búsqueda a fuerza bruta: más puntos cubiertos y, en empate, más señal desde el emisor, menor y, menor x', () => {
    const points = [
      point(9, 12, 'debil'),
      point(11, 15, 'regular'),
      point(12, 9, 'debil'),
      point(10, 12, 'sin_senal'),
      point(30, 20, 'debil'),
      point(6, 12, 'buena'),
    ];
    const { targets, valid } = bruteForce(EMITTER, points);
    const maxCovered = Math.max(...valid.map((c) => c.covered));
    const best = valid
      .filter((c) => c.covered === maxCovered)
      .sort((a, b) => b.fromEmitter - a.fromEmitter || a.y - b.y || a.x - b.x)[0];

    const result = recommend(FLOOR, EMITTER, points);
    expect(result.target_points).toBe(targets);
    expect(result.covered_points).toBe(maxCovered);
    expect(result.position).toEqual({ x: best.x, y: best.y });
  });

  test('con un solo punto a mejorar gana, entre las que lo cubren, la de mayor señal desde el emisor', () => {
    const points = [point(10, 12, 'debil')];
    const { valid } = bruteForce(EMITTER, points);
    const covering = valid.filter((c) => c.covered === 1);
    const best = covering.sort((a, b) => b.fromEmitter - a.fromEmitter || a.y - b.y || a.x - b.x)[0];
    expect(recommend(FLOOR, EMITTER, points).position).toEqual({ x: best.x, y: best.y });
  });

  test('los puntos que ya son «buena» no cuentan como objetivo', () => {
    const result = recommend(FLOOR, EMITTER, [point(10, 12, 'debil'), point(6, 12, 'buena'), point(7, 13, 'buena')]);
    expect(result.target_points).toBe(1);
  });

  // 30 x 20 m al que le falta la esquina x > 10 e y > 10 (el «hueco» de la L).
  const L_SHAPE = { width_m: 30, height_m: 20, outline: [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [0, 20]] };
  const L_EMITTER: RefEmitter = { x: 9, y: 9, p0_dbm: -40, n: 3 };

  test('con el contorno de un edificio en L, el repetidor nunca se recomienda en el hueco', () => {
    // Dos puntos débiles dentro del hueco (el plano admite tiras en el rectángulo). Sin contorno, el mejor
    // lugar está en el hueco y mejora los dos; con contorno, solo queda un lugar dentro del edificio y mejora uno.
    const points = [point(20, 15, 'debil'), point(19, 14, 'debil')];
    const outline = outlineOf(L_SHAPE);
    const free = recommend({ width_m: 30, height_m: 20 }, L_EMITTER, points);
    expect(free.covered_points).toBe(2);
    expect(insideOutline(outline, free.position?.x ?? -1, free.position?.y ?? -1)).toBe(false);

    const inLShape = recommend(L_SHAPE, L_EMITTER, points);
    expect(inLShape.reason).toBeNull();
    expect(inLShape.covered_points).toBe(1);
    expect(insideOutline(outline, inLShape.position?.x ?? -1, inLShape.position?.y ?? -1)).toBe(true);
  });

  test('si ninguna posición dentro del edificio mejora un punto, responde «Ninguna ubicación…»', () => {
    // Un punto débil dentro del hueco, lejos de todo lo que el emisor alimenta desde el edificio.
    const result = recommend(L_SHAPE, L_EMITTER, [point(24, 18, 'debil')]);
    expect(result).toEqual({ position: null, target_points: 1, covered_points: 0, reason: REASONS.noPosition });
  });

  test('con el contorno en L y puntos débiles junto al brazo, la posición elegida queda dentro del edificio', () => {
    const points = [point(13, 8, 'debil'), point(14, 9, 'regular'), point(12, 9, 'debil')];
    const result = recommend(L_SHAPE, L_EMITTER, points);
    expect(result.reason).toBeNull();
    expect(insideOutline(outlineOf(L_SHAPE), result.position?.x ?? -1, result.position?.y ?? -1)).toBe(true);
  });

  test('es determinista', () => {
    const points = [point(9, 12, 'debil'), point(11, 15, 'regular'), point(12, 9, 'debil')];
    expect(recommend(FLOOR, EMITTER, points)).toEqual(recommend(FLOOR, EMITTER, points));
  });
});
