import { describe, expect, test } from 'vitest';
import { distance, insideOutline, outlineOf, predictRssi } from '../src/services/analysis-model.ts';
import { fitEmitter } from '../src/services/trilateration.ts';
import type { EmitterSample } from '../src/services/trilateration.ts';

const FLOOR = { width_m: 40, height_m: 25 }; // Piso 3 del seed

// Puntos del seed: P-07, P-08 y P-09 (las 3 tiras reales) y otros que forman figura.
const P07 = { x: 12.5, y: 8 };
const P08 = { x: 12.5, y: 2 };
const P09 = { x: 19, y: 2 };
const OTROS = [
  { x: 19, y: 8 },
  { x: 19, y: 14 },
  { x: 6, y: 14 },
  { x: 25.5, y: 8 },
];

// Lecturas que produciría un emisor en `emitter` con el modelo del contrato, más un ruido determinista (sin azar).
function readingsFrom(
  emitter: { x: number; y: number },
  p0: number,
  n: number,
  points: { x: number; y: number }[],
  noiseDb = 0,
): EmitterSample[] {
  return points.map((p, i) => {
    const noise = noiseDb * Math.sin(i * 12.9898 + 1); // entre −noiseDb y +noiseDb, siempre igual
    return { ...p, rssi: predictRssi(p0, n, distance(p.x, p.y, emitter.x, emitter.y)) + noise };
  });
}

describe('fitEmitter', () => {
  test('menos de 3 puntos → null', () => {
    const emitter = { x: 8.4, y: 5.1 };
    expect(fitEmitter(readingsFrom(emitter, -38, 3, [P07, P08]), FLOOR)).toBeNull();
    expect(fitEmitter([], FLOOR)).toBeNull();
  });

  test('3 puntos sin ruido (n fijo en 3,0): recupera la posición y P0', () => {
    const emitter = { x: 8.4, y: 5.1 };
    const fit = fitEmitter(readingsFrom(emitter, -38.2, 3, [P07, P08, P09]), FLOOR);
    expect(fit).not.toBeNull();
    expect(fit?.n_fixed).toBe(true);
    expect(fit?.n).toBe(3);
    expect(fit?.points_used).toBe(3);
    expect(Math.abs((fit?.x ?? 0) - emitter.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((fit?.y ?? 0) - emitter.y)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((fit?.p0_dbm ?? 0) - -38.2)).toBeLessThanOrEqual(0.2);
    expect(fit?.rmse_db).toBeLessThanOrEqual(0.1);
  });

  test('6 puntos sin ruido (n libre): recupera la posición, P0 y el exponente', () => {
    const emitter = { x: 22.3, y: 11.7 };
    const fit = fitEmitter(readingsFrom(emitter, -41, 3.4, [P07, P08, P09, ...OTROS.slice(0, 3)]), FLOOR);
    expect(fit?.n_fixed).toBe(false);
    expect(fit?.points_used).toBe(6);
    expect(Math.abs((fit?.x ?? 0) - emitter.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((fit?.y ?? 0) - emitter.y)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((fit?.n ?? 0) - 3.4)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((fit?.p0_dbm ?? 0) - -41)).toBeLessThanOrEqual(0.3);
  });

  test('con ruido de ±2 dB la posición queda a menos de 3 m', () => {
    const emitter = { x: 15.2, y: 5.6 };
    const fit = fitEmitter(readingsFrom(emitter, -40, 3, [P07, P08, P09, ...OTROS], 2), FLOOR);
    expect(fit?.n_fixed).toBe(false);
    expect(distance(fit?.x ?? 0, fit?.y ?? 0, emitter.x, emitter.y)).toBeLessThan(3);
    expect(fit?.rmse_db).toBeGreaterThan(0);
    expect(fit?.rmse_db).toBeLessThan(4);
  });

  test('el exponente ajustado nunca sale de 2,0 a 5,0', () => {
    const emitter = { x: 15, y: 10 };
    const steep = fitEmitter(readingsFrom(emitter, -30, 8, [P07, P08, P09, ...OTROS]), FLOOR);
    const flat = fitEmitter(readingsFrom(emitter, -50, 0.5, [P07, P08, P09, ...OTROS]), FLOOR);
    expect(steep?.n).toBe(5);
    expect(flat?.n).toBe(2);
  });

  test('si el emisor real está fuera del piso, la estimación queda dentro', () => {
    const outside = { x: 45, y: -6 };
    const fit = fitEmitter(readingsFrom(outside, -38, 3, [P07, P08, P09, ...OTROS]), FLOOR);
    expect(fit?.x).toBeGreaterThanOrEqual(0);
    expect(fit?.x).toBeLessThanOrEqual(FLOOR.width_m);
    expect(fit?.y).toBeGreaterThanOrEqual(0);
    expect(fit?.y).toBeLessThanOrEqual(FLOOR.height_m);
  });

  test('con el contorno de un edificio en L, la estimación queda dentro del edificio', () => {
    // Piso de 30 x 20 m al que le falta la esquina x > 10 e y > 10. El emisor real está en ese hueco.
    const l = { ...FLOOR, width_m: 30, height_m: 20, outline: [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [0, 20]] };
    const outline = outlineOf(l);
    const hole = { x: 20, y: 16 };
    const points = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 25, y: 5 }, { x: 5, y: 15 }];
    const fit = fitEmitter(readingsFrom(hole, -40, 3, points), l);
    expect(fit).not.toBeNull();
    expect(insideOutline(outline, fit?.x ?? -1, fit?.y ?? -1)).toBe(true);
    // Sin contorno, en cambio, el mismo ajuste cae en el hueco: la prueba distingue los dos casos.
    const free = fitEmitter(readingsFrom(hole, -40, 3, points), { width_m: 30, height_m: 20 });
    expect(insideOutline(outline, free?.x ?? -1, free?.y ?? -1)).toBe(false);
  });

  test('un piso muy grande (500 x 500 m) igual se resuelve, con la cuadrícula gruesa más ancha', () => {
    const big = { width_m: 500, height_m: 500 };
    const points = [{ x: 100, y: 100 }, { x: 300, y: 120 }, { x: 150, y: 350 }, { x: 400, y: 400 }];
    const fit = fitEmitter(readingsFrom({ x: 220, y: 210 }, -30, 2.8, points), big);
    expect(fit).not.toBeNull();
    expect(fit?.x).toBeGreaterThanOrEqual(0);
    expect(fit?.x).toBeLessThanOrEqual(500);
    // Con la cuadrícula gruesa de 2,5 m y el refinamiento, queda cerca del emisor real.
    expect(distance(fit?.x ?? 0, fit?.y ?? 0, 220, 210)).toBeLessThan(5);
  });

  test('con 3 puntos en línea recta devuelve una de las dos posiciones simétricas, siempre la misma', () => {
    const line = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    const samples = readingsFrom({ x: 18, y: 4 }, -40, 3, line);
    const a = fitEmitter(samples, FLOOR);
    const b = fitEmitter(samples, FLOOR);
    expect(a).toEqual(b);
    expect(a?.x).toBeCloseTo(18, 0);
    // Gana la simétrica de menor y (la primera de la búsqueda): y = 4.
    expect(a?.y).toBeCloseTo(4, 0);
  });

  test('es determinista', () => {
    const samples = readingsFrom({ x: 15.2, y: 5.6 }, -40, 3, [P07, P08, P09, ...OTROS], 2);
    expect(fitEmitter(samples, FLOOR)).toEqual(fitEmitter(samples, FLOOR));
  });

  test('los valores salen con 1 decimal', () => {
    const fit = fitEmitter(readingsFrom({ x: 8.37, y: 5.12 }, -38.17, 3, [P07, P08, P09, ...OTROS], 1), FLOOR);
    for (const v of [fit?.x, fit?.y, fit?.p0_dbm, fit?.n, fit?.rmse_db]) {
      expect(Math.round((v ?? 0) * 10) / 10).toBe(v);
    }
  });
});
