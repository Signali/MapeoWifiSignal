import { describe, expect, test } from 'vitest';
import { cellCenter, gridOf } from '../src/services/analysis-model.ts';
import { buildHeatmap } from '../src/services/heatmap.ts';

const FLOOR = { width_m: 40, height_m: 25 }; // Piso 3 del seed

describe('gridOf', () => {
  test('Piso 3: celdas de 1 m, 40 columnas y 25 filas', () => {
    expect(gridOf(FLOOR)).toEqual({ cell_m: 1, cols: 40, rows: 25 });
  });

  test('un piso de 100 m por lado conserva la celda de 1 m', () => {
    expect(gridOf({ width_m: 100, height_m: 50 })).toEqual({ cell_m: 1, cols: 100, rows: 50 });
  });

  test('un piso mayor a 100 m agranda la celda y no pasa de 100 por lado', () => {
    const grid = gridOf({ width_m: 300, height_m: 200 });
    expect(grid.cell_m).toBe(3);
    expect(grid.cols).toBe(100);
    expect(grid.rows).toBe(67);
  });

  test('solo cuentan las celdas cuyo centro cae dentro del piso', () => {
    const floor = { width_m: 40.6, height_m: 10.3 };
    const grid = gridOf(floor);
    expect(grid.cols).toBe(41); // el último centro es 40,5 < 40,6
    expect(grid.rows).toBe(10); // el centro 10,5 quedaría fuera de 10,3
    expect(cellCenter(grid, grid.cols - 1, grid.rows - 1).x).toBeLessThan(floor.width_m);
    expect(cellCenter(grid, grid.cols - 1, grid.rows - 1).y).toBeLessThan(floor.height_m);
  });
});

describe('buildHeatmap', () => {
  test('Piso 3: 1000 celdas, por fila y luego por x, con el centro de cada celda', () => {
    const map = buildHeatmap(FLOOR, []);
    expect(map).toMatchObject({ cell_m: 1, cols: 40, rows: 25, points_used: 0 });
    expect(map.cells).toHaveLength(1000);
    expect(map.cells[0]).toEqual({ x: 0.5, y: 0.5, rssi_dbm: null, category: null });
    expect(map.cells[1]).toMatchObject({ x: 1.5, y: 0.5 });
    expect(map.cells[40]).toMatchObject({ x: 0.5, y: 1.5 });
    expect(map.cells[999]).toMatchObject({ x: 39.5, y: 24.5 });
  });

  test('sin muestras todas las celdas quedan sin datos', () => {
    const map = buildHeatmap(FLOOR, []);
    expect(map.cells.every((c) => c.rssi_dbm === null && c.category === null)).toBe(true);
  });

  test('una muestra: las celdas a 8 m o menos valen lo mismo y las demás quedan sin datos', () => {
    const map = buildHeatmap(FLOOR, [{ x: 8.5, y: 0.5, rssi: -73 }]);
    expect(map.points_used).toBe(1);
    const at = (x: number, y: number) => map.cells.find((c) => c.x === x && c.y === y);
    expect(at(0.5, 0.5)).toEqual({ x: 0.5, y: 0.5, rssi_dbm: -73, category: 'debil' }); // d = 8 exacto: entra
    expect(at(8.5, 0.5)).toMatchObject({ rssi_dbm: -73 });
    expect(at(16.5, 0.5)).toMatchObject({ rssi_dbm: -73 });
    expect(at(17.5, 0.5)).toEqual({ x: 17.5, y: 0.5, rssi_dbm: null, category: null }); // d = 9
    expect(at(0.5, 9.5)).toEqual({ x: 0.5, y: 9.5, rssi_dbm: null, category: null }); // d > 8
  });

  test('dos muestras: el punto medio pesa igual y una celda más cercana pesa más a la cercana', () => {
    const samples = [
      { x: 2.5, y: 0.5, rssi: -60 },
      { x: 6.5, y: 0.5, rssi: -80 },
    ];
    const map = buildHeatmap(FLOOR, samples);
    const at = (x: number) => map.cells.find((c) => c.x === x && c.y === 0.5);
    expect(at(4.5)?.rssi_dbm).toBe(-70); // equidistante: promedio
    // 3,5 está a 1 m de la primera y a 3 m de la segunda: pesos 1 y 1/9
    expect(at(3.5)?.rssi_dbm).toBe(-62); // (−60·1 + −80·(1/9)) / (1 + 1/9) = −62
    expect(at(4.5)?.category).toBe('regular');
  });

  test('una muestra a menos de 1 cm del centro se toma tal cual', () => {
    const map = buildHeatmap(FLOOR, [
      { x: 10.504, y: 5.5, rssi: -50 },
      { x: 12.5, y: 5.5, rssi: -90 },
    ]);
    expect(map.cells.find((c) => c.x === 10.5 && c.y === 5.5)?.rssi_dbm).toBe(-50);
  });

  test('un punto sin_senal cuenta como −100 dBm', () => {
    const map = buildHeatmap(FLOOR, [{ x: 5.5, y: 5.5, rssi: null }]);
    expect(map.points_used).toBe(1);
    expect(map.cells.find((c) => c.x === 5.5 && c.y === 5.5)).toEqual({
      x: 5.5,
      y: 5.5,
      rssi_dbm: -100,
      category: 'debil',
    });
  });

  test('una celda interpolada nunca es sin_senal', () => {
    const map = buildHeatmap(FLOOR, [{ x: 5.5, y: 5.5, rssi: null }]);
    expect(map.cells.some((c) => c.category === 'sin_senal')).toBe(false);
  });

  test('la categoría sale del valor redondeado a 1 decimal', () => {
    // −64,96 sin redondear sería «buena» (> −65); redondeado es −65,0 → «regular».
    const map = buildHeatmap(FLOOR, [{ x: 0.5, y: 0.5, rssi: -64.96 }]);
    expect(map.cells[0]).toEqual({ x: 0.5, y: 0.5, rssi_dbm: -65, category: 'regular' });
  });

  test('con el contorno de un edificio en L, solo salen las celdas de adentro (64 de 100)', () => {
    const l = {
      width_m: 10,
      height_m: 10,
      outline: [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]],
    };
    const map = buildHeatmap(l, [{ x: 2, y: 2, rssi: -70 }]);
    expect(map).toMatchObject({ cell_m: 1, cols: 10, rows: 10 });
    expect(map.cells).toHaveLength(64);
    // Ninguna celda cae en el hueco de la L (x > 4 e y > 4).
    expect(map.cells.some((c) => c.x > 4 && c.y > 4)).toBe(false);
    expect(map.cells.some((c) => c.x === 8.5 && c.y === 2.5)).toBe(true); // el brazo horizontal sí
  });

  test('sin contorno propio sigue saliendo el rectángulo completo', () => {
    expect(buildHeatmap({ width_m: 10, height_m: 10, outline: null }, []).cells).toHaveLength(100);
  });

  test('es determinista', () => {
    const samples = [
      { x: 12.5, y: 8, rssi: -74 },
      { x: 12.5, y: 2, rssi: -61 },
      { x: 19, y: 2, rssi: null },
    ];
    expect(buildHeatmap(FLOOR, samples)).toEqual(buildHeatmap(FLOOR, samples));
  });

  test('un piso de 300 x 200 m no pasa de unas 10 000 celdas', () => {
    const map = buildHeatmap({ width_m: 300, height_m: 200 }, []);
    expect(map.cells.length).toBe(map.cols * map.rows);
    expect(map.cells.length).toBeLessThanOrEqual(10_000);
  });
});
