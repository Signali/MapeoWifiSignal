// Modelo y constantes del análisis del piso (docs/api-contract.md, §4 «Análisis del piso»).
// Funciones puras: sin base de datos ni HTTP. Los mismos datos dan siempre el mismo resultado.

export const NO_SIGNAL_RSSI_DBM = -100; // muestra de un punto `sin_senal` en el mapa de calor
export const MIN_DISTANCE_M = 0.5; // distancia mínima del modelo (evita log10(0))
export const FIXED_N = 3.0; // exponente con 3 puntos
export const N_MIN = 2.0; // límites del exponente ajustado (4 o más puntos)
export const N_MAX = 5.0;
export const MIN_EMITTER_POINTS = 3;
export const MAX_CELLS_PER_SIDE = 100;

export interface FloorSize {
  width_m: number;
  height_m: number;
}

export type Vertex = { x: number; y: number };

// Piso con su contorno real: vértices [x, y] en metros. null o ausente = el rectángulo completo.
export interface FloorShape extends FloorSize {
  outline?: number[][] | null;
}

// Contorno del piso como vértices. Sin contorno cargado, el rectángulo width_m x height_m.
export function outlineOf(floor: FloorShape): Vertex[] {
  if (floor.outline) return floor.outline.map(([x, y]) => ({ x, y }));
  const { width_m: w, height_m: h } = floor;
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

// Punto dentro del contorno (polígono, cóncavo o no). El borde cuenta como dentro.
export function insideOutline(outline: Vertex[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const onSegment =
      Math.abs(cross) < 1e-9 && x >= Math.min(a.x, b.x) - 1e-9 && x <= Math.max(a.x, b.x) + 1e-9 &&
      y >= Math.min(a.y, b.y) - 1e-9 && y <= Math.max(a.y, b.y) + 1e-9;
    if (onSegment) return true;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface Grid {
  cell_m: number;
  cols: number;
  rows: number;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// RSSI(d) = P0 − 10·n·log10(d), con d mínima de 0,5 m.
export function predictRssi(p0Dbm: number, n: number, distanceM: number): number {
  return p0Dbm - 10 * n * Math.log10(Math.max(distanceM, MIN_DISTANCE_M));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// 1 m por celda; si el lado mayor supera 100 m, la celda se agranda para no pasar de 100 por lado.
// Es la grilla del rectángulo del piso: los consumidores se quedan solo con las celdas cuyo centro
// cae dentro del contorno (`insideOutline`). Un lado menor que media celda no tiene ningún centro.
export function gridOf(floor: FloorSize): Grid {
  const longest = Math.max(floor.width_m, floor.height_m);
  const cell_m = longest > MAX_CELLS_PER_SIDE ? Math.ceil(longest / MAX_CELLS_PER_SIDE) : 1;
  const count = (sideM: number) => {
    const n = Math.ceil(sideM / cell_m - 0.5);
    return n > 0 ? n : 0;
  };
  return { cell_m, cols: count(floor.width_m), rows: count(floor.height_m) };
}

export function cellCenter(grid: Grid, col: number, row: number): { x: number; y: number } {
  return { x: (col + 0.5) * grid.cell_m, y: (row + 0.5) * grid.cell_m };
}
