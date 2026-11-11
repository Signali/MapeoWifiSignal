import { describe, expect, test } from 'vitest';
import { gridOf, insideOutline, outlineOf } from '../src/services/analysis-model.ts';

// Edificio en L de 10 x 10 m: falta el cuadrante de x > 4 e y > 4.
const L = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];

describe('outlineOf', () => {
  test('sin contorno cargado es el rectángulo del piso', () => {
    expect(outlineOf({ width_m: 40, height_m: 25 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 25 },
      { x: 0, y: 25 },
    ]);
    expect(outlineOf({ width_m: 40, height_m: 25, outline: null })).toHaveLength(4);
  });

  test('con contorno cargado devuelve sus vértices como {x, y}', () => {
    expect(outlineOf({ width_m: 10, height_m: 10, outline: [[0, 0], [10, 0], [5, 8]] })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ]);
  });
});

describe('insideOutline', () => {
  test('adentro y afuera de un contorno cóncavo (la L)', () => {
    expect(insideOutline(L, 2, 2)).toBe(true);
    expect(insideOutline(L, 8, 2)).toBe(true); // brazo horizontal
    expect(insideOutline(L, 2, 8)).toBe(true); // brazo vertical
    expect(insideOutline(L, 7, 7)).toBe(false); // el hueco de la L
    expect(insideOutline(L, 11, 2)).toBe(false);
    expect(insideOutline(L, -1, 2)).toBe(false);
  });

  test('el borde y los vértices cuentan como dentro', () => {
    expect(insideOutline(L, 0, 0)).toBe(true);
    expect(insideOutline(L, 10, 4)).toBe(true);
    expect(insideOutline(L, 7, 4)).toBe(true); // arista del hueco
    expect(insideOutline(L, 4, 7)).toBe(true);
    expect(insideOutline(L, 5, 0)).toBe(true);
  });

  test('el rectángulo por defecto incluye los bordes y deja fuera lo de afuera', () => {
    const rect = outlineOf({ width_m: 40, height_m: 25 });
    expect(insideOutline(rect, 0, 0)).toBe(true);
    expect(insideOutline(rect, 40, 25)).toBe(true);
    expect(insideOutline(rect, 20.5, 12.5)).toBe(true);
    expect(insideOutline(rect, 40.01, 10)).toBe(false);
    expect(insideOutline(rect, 10, -0.01)).toBe(false);
  });
});

describe('gridOf con lados menores que media celda', () => {
  test('un lado de 0,3 m no tiene ningún centro de celda dentro: 0 columnas', () => {
    expect(gridOf({ width_m: 0.3, height_m: 10 })).toEqual({ cell_m: 1, cols: 0, rows: 10 });
  });
});
