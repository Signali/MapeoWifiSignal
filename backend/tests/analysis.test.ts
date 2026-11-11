import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { app } from '../src/app.ts';
import { pool } from '../src/repositories/db.ts';
import { distance, insideOutline, predictRssi } from '../src/services/analysis-model.ts';
import { REASONS } from '../src/services/recommendation.ts';
import { signToken } from '../src/services/token.ts';

// Rutas 19 a 21 (contrato §5, §6.19 a §6.21) contra la app real y signalmap_test.
// Seed: org 1, Torre Norte (id 1, asignada al cliente) con el Piso 3 (id 1, 40 x 25 m).
// Cada prueba arma sus propios pisos (en un edificio de la org 1 NO asignado al cliente, y en otra
// organización) y al final se borra solo eso: otros archivos corren en paralelo.
const SSID = process.env.SEED_WIFI_SSID as string;
const FORBIDDEN_FLOOR = { message: 'Piso no encontrado' };
const FLOOR_ID_MSG = { message: 'floor_id es obligatorio y debe ser entero' };
const PHASE_MSG = { message: 'phase debe ser antes o despues' };
const BSSID_A = 'a4:2b:b0:11:22:33';
const BSSID_B = 'a4:2b:b0:11:22:44';
const BSSID_C = 'a4:2b:b0:11:22:55';

const auth = { admin: '', tecnico: '', cliente: '', adminOtraOrg: '' };
const ids = { adminUser: 0, annexBuilding: 0, otherOrg: 0, otherBuilding: 0, otherFloor: 0 };
const floorIds: number[] = [];
let seq = 0;

async function login(email: string, password: string | undefined): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return `Bearer ${res.body.token}`;
}

async function insertId(sql: string, values: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(sql, values);
  return rows[0].id;
}

beforeAll(async () => {
  auth.admin = await login('admin@demo.cl', process.env.SEED_ADMIN_PASSWORD);
  auth.tecnico = await login('tecnico@demo.cl', process.env.SEED_TECNICO_PASSWORD);
  auth.cliente = await login('cliente@demo.cl', process.env.SEED_CLIENTE_PASSWORD);
  ids.adminUser = (await pool.query<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0].id;
  ids.annexBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES (1, 'Anexo Analisis') RETURNING id`, []);

  ids.otherOrg = await insertId(`INSERT INTO organizations (name, wifi_ssid) VALUES ('Otra Org Analisis', 'Otra Red') RETURNING id`, []);
  ids.otherBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES ($1, 'Torre Norte') RETURNING id`, [ids.otherOrg]);
  ids.otherFloor = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m) VALUES ($1, 'Piso 3', 40, 25) RETURNING id`,
    [ids.otherBuilding],
  );
  auth.adminOtraOrg = `Bearer ${signToken({ id: ids.adminUser, orgId: ids.otherOrg, role: 'admin' }, 600)}`;
});

afterAll(async () => {
  const all = [...floorIds, ids.otherFloor];
  await pool.query('DELETE FROM measurements WHERE point_id IN (SELECT id FROM points WHERE floor_id = ANY($1))', [all]);
  await pool.query('DELETE FROM points WHERE floor_id = ANY($1)', [all]);
  await pool.query('DELETE FROM floors WHERE id = ANY($1)', [all]);
  await pool.query('DELETE FROM buildings WHERE id = ANY($1)', [[ids.annexBuilding, ids.otherBuilding]]);
  await pool.query('DELETE FROM organizations WHERE id = $1', [ids.otherOrg]);
  await pool.end();
});

type Pt = { x: number; y: number };

// Un piso nuevo del anexo con sus puntos (códigos y UID únicos para todo el archivo).
async function makeFloor(
  width: number,
  height: number,
  points: Pt[],
  extra: { outline?: number[][]; plan_url?: string } = {},
): Promise<{ floorId: number; pointIds: number[] }> {
  seq++;
  const floorId = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m, outline, plan_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [ids.annexBuilding, `A${seq}`, width, height, extra.outline ? JSON.stringify(extra.outline) : null, extra.plan_url ?? null],
  );
  floorIds.push(floorId);
  const pointIds: number[] = [];
  for (const [i, p] of points.entries()) {
    const nfc = `0F${(seq * 100 + i).toString(16).toUpperCase().padStart(6, '0')}`;
    pointIds.push(
      await insertId(`INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
        floorId,
        `A${seq}-${i + 1}`,
        p.x,
        p.y,
        nfc,
      ]),
    );
  }
  return { floorId, pointIds };
}

type Rd = { bssid?: string; rssi: number; freq?: number; ssid?: string };

// Medición insertada por SQL (la API no deja elegir la fecha ni anular).
async function addMeasurement(
  pointId: number,
  phase: 'antes' | 'despues',
  readings: Rd[],
  opts: { at?: Date; voided?: boolean } = {},
): Promise<number> {
  const voided = opts.voided === true;
  const id = await insertId(
    `INSERT INTO measurements (point_id, user_id, phase, client_uuid, measured_at, voided_at, void_reason, voided_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [pointId, ids.adminUser, phase, randomUUID(), opts.at ?? new Date(), voided ? new Date() : null, voided ? 'punto_equivocado' : null, voided ? ids.adminUser : null],
  );
  for (const r of readings) {
    await pool.query(
      `INSERT INTO network_readings (measurement_id, bssid, ssid, rssi_dbm, frequency_mhz) VALUES ($1, $2, $3, $4, $5)`,
      [id, r.bssid ?? BSSID_A, r.ssid ?? SSID, r.rssi, r.freq ?? 5180],
    );
  }
  return id;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
// Lectura que daría un emisor en `emitter` (modelo del contrato), en dBm enteros.
const rssiFrom = (emitter: Pt, p0: number, n: number, p: Pt) => Math.round(predictRssi(p0, n, distance(p.x, p.y, emitter.x, emitter.y)));

const get = (path: string, query: string, token = auth.admin) =>
  request(app).get(`/api/v1/${path}${query}`).set('Authorization', token);

function expectError(res: request.Response, status: number, body?: { message: string }) {
  expect(res.status).toBe(status);
  if (body) expect(res.body).toEqual(body);
  else expect(typeof res.body.message).toBe('string');
}

// Los 4 errores comunes de las tres rutas (contrato §6.19 a §6.21).
function commonErrors(path: string, withPhase: boolean) {
  const phase = withPhase ? '&phase=antes' : '';
  describe(`errores de /${path}`, () => {
    test('401 sin token', async () => {
      expectError(await request(app).get(`/api/v1/${path}?floor_id=1${phase}`), 401);
    });
    test('400 sin floor_id, con floor_id que no es entero y con un parámetro desconocido', async () => {
      expectError(await get(path, `?${phase.slice(1)}`), 400, FLOOR_ID_MSG);
      expectError(await get(path, `?floor_id=abc${phase}`), 400, FLOOR_ID_MSG);
      expectError(await get(path, `?floor_id=1${phase}&otro=1`), 400);
    });
    test('404 con un piso inexistente, de otra organización y (cliente) de un edificio no asignado', async () => {
      const annex = await makeFloor(10, 8, [{ x: 1, y: 1 }]);
      expectError(await get(path, `?floor_id=999999${phase}`), 404, FORBIDDEN_FLOOR);
      expectError(await get(path, `?floor_id=${ids.otherFloor}${phase}`), 404, FORBIDDEN_FLOOR);
      expectError(await get(path, `?floor_id=${annex.floorId}${phase}`, auth.adminOtraOrg), 404, FORBIDDEN_FLOOR);
      expectError(await get(path, `?floor_id=${annex.floorId}${phase}`, auth.cliente), 404, FORBIDDEN_FLOOR);
    });
    test('400 gana al 404 y el tecnico puede leer', async () => {
      expectError(await get(path, `?floor_id=999999${withPhase ? '&phase=x' : '&otro=1'}`), 400);
      expect((await get(path, `?floor_id=1${phase}`, auth.tecnico)).status).toBe(200);
    });
  });
}

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/heatmap (fila 19)', () => {
  test('200 con el cuerpo exacto: una muestra de −70 dBm da −70 «regular» en toda la grilla de 4 x 3', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -70 }]);
    const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
    expect(res.status).toBe(200);
    const cells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) cells.push({ x: col + 0.5, y: row + 0.5, rssi_dbm: -70, category: 'regular' });
    }
    expect(res.body).toEqual({ floor_id: floorId, phase: 'antes', cell_m: 1, cols: 4, rows: 3, points_used: 1, cells });
  });

  test('Piso 3 del seed: 1000 celdas (40 x 25) para el cliente asignado', async () => {
    const res = await get('heatmap', '?floor_id=1&phase=antes', auth.cliente);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ floor_id: 1, phase: 'antes', cell_m: 1, cols: 40, rows: 25 });
    expect(res.body.cells).toHaveLength(1000);
  });

  test('sin mediciones: points_used 0 y todas las celdas sin datos; un piso sin puntos responde igual', async () => {
    const withPoints = await makeFloor(4, 3, [{ x: 1, y: 1 }, { x: 3, y: 2 }]);
    const empty = await makeFloor(4, 3, []);
    for (const floorId of [withPoints.floorId, empty.floorId]) {
      const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
      expect(res.status).toBe(200);
      expect(res.body.points_used).toBe(0);
      expect(res.body.cells).toHaveLength(12);
      expect(res.body.cells.every((c: { rssi_dbm: null; category: null }) => c.rssi_dbm === null && c.category === null)).toBe(true);
    }
  });

  test('un punto sin_senal (sin lecturas) cuenta como −100 dBm: celdas «debil», nunca «sin_senal»', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', []);
    const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
    expect(res.body.points_used).toBe(1);
    expect(res.body.cells.every((c: { rssi_dbm: number; category: string }) => c.rssi_dbm === -100 && c.category === 'debil')).toBe(true);
  });

  test('usa la lectura más fuerte de la medición', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -80 }, { bssid: BSSID_B, rssi: -66 }]);
    const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
    expect(res.body.cells[0]).toMatchObject({ rssi_dbm: -66, category: 'regular' });
  });

  test('cuenta la última medición válida: la más nueva gana y una anulada no cuenta', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -90 }], { at: hoursAgo(5) });
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -60 }], { at: hoursAgo(3) });
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -95 }], { at: hoursAgo(1), voided: true });
    const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
    expect(res.body.points_used).toBe(1);
    expect(res.body.cells[0]).toMatchObject({ rssi_dbm: -60, category: 'buena' });
  });

  test('una medición solo anulada no cuenta', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -60 }], { voided: true });
    expect((await get('heatmap', `?floor_id=${floorId}&phase=antes`)).body.points_used).toBe(0);
  });

  test('las fases van separadas', async () => {
    const { floorId, pointIds } = await makeFloor(4, 3, [{ x: 1, y: 1 }]);
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -70 }]);
    expect((await get('heatmap', `?floor_id=${floorId}&phase=despues`)).body.points_used).toBe(0);
    expect((await get('heatmap', `?floor_id=${floorId}&phase=antes`)).body.points_used).toBe(1);
  });

  test('400 sin phase y con una phase que no es antes/despues', async () => {
    expectError(await get('heatmap', '?floor_id=1'), 400, PHASE_MSG);
    expectError(await get('heatmap', '?floor_id=1&phase=después'), 400, PHASE_MSG);
  });

  commonErrors('heatmap', true);
});

// ---------------------------------------------------------------------------------------
// Plano real: un piso con el contorno de un edificio en L (10 x 10 m, sin la esquina x > 4 e y > 4) y su imagen.
const L_OUTLINE = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];

describe('piso con contorno real (plano de la edificación)', () => {
  test('GET /floors devuelve el contorno como vértices {x, y} y la imagen del plano', async () => {
    const { floorId } = await makeFloor(10, 10, [{ x: 2, y: 2 }], { outline: L_OUTLINE, plan_url: '/plans/edificio-l.svg' });
    const res = await request(app).get(`/api/v1/floors?building_id=${ids.annexBuilding}`).set('Authorization', auth.admin);
    expect(res.status).toBe(200);
    expect(res.body.find((f: { id: number }) => f.id === floorId)).toEqual({
      id: floorId,
      building_id: ids.annexBuilding,
      name: expect.any(String),
      width_m: 10,
      height_m: 10,
      outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }],
      plan_url: '/plans/edificio-l.svg',
    });
  });

  test('el mapa de calor solo trae las 64 celdas de adentro, ninguna en el hueco', async () => {
    const { floorId, pointIds } = await makeFloor(10, 10, [{ x: 2, y: 2 }], { outline: L_OUTLINE });
    await addMeasurement(pointIds[0], 'antes', [{ rssi: -70 }]);
    const res = await get('heatmap', `?floor_id=${floorId}&phase=antes`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cols: 10, rows: 10, points_used: 1 });
    expect(res.body.cells).toHaveLength(64);
    expect(res.body.cells.some((c: Pt) => c.x > 4 && c.y > 4)).toBe(false);
  });

  test('la recomendación y el emisor quedan dentro del contorno', async () => {
    // Piso en L de 30 x 20 m; seis puntos medidos dentro del edificio y un emisor real también dentro.
    const outline = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [0, 20]];
    const points: Pt[] = [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 20, y: 4 }, { x: 4, y: 12 }, { x: 4, y: 17 }, { x: 26, y: 8 }];
    const emitter: Pt = { x: 8, y: 6 };
    const { floorId, pointIds } = await makeFloor(30, 20, points, { outline });
    await measureAll(pointIds, points, BSSID_A, emitter);
    const poly = outline.map(([x, y]) => ({ x, y }));
    const em = (await get('emitters', `?floor_id=${floorId}&phase=antes`)).body[0];
    expect(insideOutline(poly, em.x, em.y)).toBe(true);
    const rec = (await get('recommendation', `?floor_id=${floorId}`)).body;
    expect(rec.reason).toBeNull();
    expect(rec.position).not.toBeNull();
    expect(insideOutline(poly, rec.position.x, rec.position.y)).toBe(true);
  });

  test('la base rechaza un plan_url fuera de /plans/ y un contorno con menos de 3 vértices', async () => {
    const insert = (outline: string | null, planUrl: string | null) =>
      pool.query(`INSERT INTO floors (building_id, name, width_m, height_m, outline, plan_url) VALUES ($1, $2, 10, 10, $3, $4)`, [
        ids.annexBuilding,
        `X${randomUUID().slice(0, 8)}`,
        outline,
        planUrl,
      ]);
    await expect(insert(null, '../etc/passwd')).rejects.toThrow(/plan_url/);
    await expect(insert(null, 'https://otro.sitio/plano.png')).rejects.toThrow(/plan_url/);
    await expect(insert(null, '/plans/')).rejects.toThrow(/plan_url/);
    await expect(insert('[[0,0],[10,0]]', null)).rejects.toThrow(/outline/);
    await expect(insert('{"a":1}', null)).rejects.toThrow(/outline/);
  });
});

// ---------------------------------------------------------------------------------------
// Seis puntos de un piso de 30 x 20 m y un emisor en (6, 6) con P0 = −40 y n = 3.
const SIX: Pt[] = [
  { x: 4, y: 4 },
  { x: 10, y: 4 },
  { x: 4, y: 10 },
  { x: 10, y: 10 },
  { x: 15, y: 6 },
  { x: 7, y: 14 },
];
const EMITTER: Pt = { x: 6, y: 6 };

async function measureAll(pointIds: number[], points: Pt[], bssid: string, emitter: Pt, p0 = -40, n = 3, phase: 'antes' | 'despues' = 'antes') {
  for (const [i, pointId] of pointIds.entries()) {
    await addMeasurement(pointId, phase, [{ bssid, rssi: rssiFrom(emitter, p0, n, points[i]) }]);
  }
}

describe('GET /api/v1/emitters (fila 20)', () => {
  test('200: estima el emisor con 6 puntos (n libre) y devuelve los campos del contrato', async () => {
    const { floorId, pointIds } = await makeFloor(30, 20, SIX);
    await measureAll(pointIds, SIX, BSSID_A, EMITTER);
    const res = await get('emitters', `?floor_id=${floorId}&phase=antes`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const e = res.body[0];
    expect(Object.keys(e)).toEqual(['bssid', 'ssid', 'frequency_mhz', 'x', 'y', 'p0_dbm', 'n', 'n_fixed', 'rmse_db', 'points_used', 'estimated']);
    expect(e).toMatchObject({ bssid: BSSID_A, ssid: SSID, frequency_mhz: 5180, n_fixed: false, points_used: 6, estimated: true });
    expect(Math.abs(e.x - EMITTER.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(e.y - EMITTER.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(e.n - 3)).toBeLessThanOrEqual(0.5);
  });

  test('con 3 puntos fija n en 3,0 (n_fixed) y toma ssid y frecuencia de la lectura más fuerte', async () => {
    const three = SIX.slice(0, 3);
    const { floorId, pointIds } = await makeFloor(30, 20, three);
    for (const [i, pointId] of pointIds.entries()) {
      // El punto 0 es el más cercano al emisor: su lectura es la más fuerte y trae 5180; las demás, 2437.
      await addMeasurement(pointId, 'antes', [{ rssi: rssiFrom(EMITTER, -40, 3, three[i]), freq: i === 0 ? 5180 : 2437 }]);
    }
    const res = await get('emitters', `?floor_id=${floorId}&phase=antes`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ n_fixed: true, n: 3, points_used: 3, frequency_mhz: 5180 });
  });

  test('con menos de 3 puntos, o con una de las 3 mediciones anulada, responde [] (200)', async () => {
    const two = await makeFloor(30, 20, SIX.slice(0, 2));
    await measureAll(two.pointIds, SIX.slice(0, 2), BSSID_A, EMITTER);
    const res = await get('emitters', `?floor_id=${two.floorId}&phase=antes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    const three = SIX.slice(0, 3);
    const voided = await makeFloor(30, 20, three);
    await measureAll(voided.pointIds.slice(0, 2), three.slice(0, 2), BSSID_A, EMITTER);
    await addMeasurement(voided.pointIds[2], 'antes', [{ rssi: rssiFrom(EMITTER, -40, 3, three[2]) }], { voided: true });
    expect((await get('emitters', `?floor_id=${voided.floorId}&phase=antes`)).body).toEqual([]);
  });

  test('sin mediciones en la fase pedida responde []', async () => {
    const { floorId, pointIds } = await makeFloor(30, 20, SIX);
    await measureAll(pointIds, SIX, BSSID_A, EMITTER);
    expect((await get('emitters', `?floor_id=${floorId}&phase=despues`)).body).toEqual([]);
  });

  test('ordena por points_used descendente y, en empate, por bssid ascendente', async () => {
    const { floorId, pointIds } = await makeFloor(30, 20, SIX);
    // C y B en 3 puntos (empate: gana B por bssid), A en 4 puntos.
    for (const [i, pointId] of pointIds.entries()) {
      const readings: Rd[] = [];
      if (i < 4) readings.push({ bssid: BSSID_A, rssi: rssiFrom({ x: 6, y: 6 }, -40, 3, SIX[i]) });
      if (i < 3) readings.push({ bssid: BSSID_C, rssi: rssiFrom({ x: 20, y: 5 }, -40, 3, SIX[i]) });
      if (i < 3) readings.push({ bssid: BSSID_B, rssi: rssiFrom({ x: 12, y: 8 }, -40, 3, SIX[i]) });
      await addMeasurement(pointId, 'antes', readings);
    }
    const res = await get('emitters', `?floor_id=${floorId}&phase=antes`);
    expect(res.body.map((e: { bssid: string; points_used: number }) => [e.bssid, e.points_used])).toEqual([
      [BSSID_A, 4],
      [BSSID_B, 3],
      [BSSID_C, 3],
    ]);
  });

  test('400 sin phase y con una phase que no es antes/despues', async () => {
    expectError(await get('emitters', '?floor_id=1'), 400, PHASE_MSG);
    expectError(await get('emitters', '?floor_id=1&phase=después'), 400, PHASE_MSG);
  });

  commonErrors('emitters', true);
});

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/recommendation (fila 21)', () => {
  // Puntos cercanos al emisor (buena) y tres lejanos (regular o débil) que el repetidor puede mejorar.
  const NEAR: Pt[] = [{ x: 4, y: 4 }, { x: 10, y: 4 }, { x: 4, y: 10 }, { x: 10, y: 10 }];
  const FAR: Pt[] = [{ x: 14, y: 8 }, { x: 16, y: 6 }, { x: 18, y: 6 }];
  const KEYS = ['floor_id', 'position', 'emitter_bssid', 'target_points', 'covered_points', 'reason', 'estimated'];

  test('200 con una posición: el emisor de referencia, los puntos a mejorar y cuántos cubre', async () => {
    const points = [...NEAR, ...FAR];
    const { floorId, pointIds } = await makeFloor(30, 20, points);
    await measureAll(pointIds, points, BSSID_A, EMITTER);
    const res = await get('recommendation', `?floor_id=${floorId}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(KEYS);
    expect(res.body).toMatchObject({ floor_id: floorId, emitter_bssid: BSSID_A, target_points: 3, reason: null, estimated: true });
    expect(res.body.position.x).toBeGreaterThan(0);
    expect(res.body.position.x).toBeLessThan(30);
    expect(res.body.position.y).toBeGreaterThan(0);
    expect(res.body.position.y).toBeLessThan(20);
    expect(res.body.covered_points).toBe(3);
  });

  test('usa solo la fase «antes»: mediciones solo en «después» no dan emisor', async () => {
    const points = [...NEAR, ...FAR];
    const { floorId, pointIds } = await makeFloor(30, 20, points);
    await measureAll(pointIds, points, BSSID_A, EMITTER, -40, 3, 'despues');
    const res = await get('recommendation', `?floor_id=${floorId}`);
    expect(res.body).toEqual({ floor_id: floorId, position: null, emitter_bssid: null, target_points: null, covered_points: null, reason: REASONS.noEmitter, estimated: true });
  });

  test('sin emisor (2 puntos medidos, o ninguno): «Faltan puntos medidos…» y todo en null', async () => {
    const two = await makeFloor(30, 20, SIX.slice(0, 2));
    await measureAll(two.pointIds, SIX.slice(0, 2), BSSID_A, EMITTER);
    const none = await makeFloor(30, 20, SIX);
    for (const floorId of [two.floorId, none.floorId]) {
      const res = await get('recommendation', `?floor_id=${floorId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ floor_id: floorId, position: null, emitter_bssid: null, target_points: null, covered_points: null, reason: REASONS.noEmitter, estimated: true });
    }
  });

  test('todos los puntos medidos ya son «buena»: target_points 0 y «Todos los puntos…»', async () => {
    const { floorId, pointIds } = await makeFloor(30, 20, NEAR);
    for (const pointId of pointIds) await addMeasurement(pointId, 'antes', [{ rssi: -50 }]);
    const res = await get('recommendation', `?floor_id=${floorId}`);
    expect(res.body).toMatchObject({ floor_id: floorId, position: null, emitter_bssid: BSSID_A, target_points: 0, covered_points: 0, reason: REASONS.allGood, estimated: true });
  });

  test('si el emisor no da señal «buena» en ningún lugar: «Ninguna ubicación…» con target_points real', async () => {
    const points = [...NEAR, ...FAR];
    const { floorId, pointIds } = await makeFloor(30, 20, points);
    await measureAll(pointIds, points, BSSID_A, EMITTER, -85); // un emisor débil: nadie lo recibe «buena»
    const res = await get('recommendation', `?floor_id=${floorId}`);
    expect(res.body).toMatchObject({ position: null, emitter_bssid: BSSID_A, target_points: 7, covered_points: 0, reason: REASONS.noPosition });
  });

  test('el emisor de referencia es el de más puntos', async () => {
    const points = [...NEAR, ...FAR];
    const { floorId, pointIds } = await makeFloor(30, 20, points);
    for (const [i, pointId] of pointIds.entries()) {
      const readings: Rd[] = [{ bssid: BSSID_C, rssi: rssiFrom({ x: 6, y: 6 }, -40, 3, points[i]) }];
      if (i < 3) readings.push({ bssid: BSSID_A, rssi: rssiFrom({ x: 12, y: 8 }, -40, 3, points[i]) });
      await addMeasurement(pointId, 'antes', readings);
    }
    expect((await get('recommendation', `?floor_id=${floorId}`)).body.emitter_bssid).toBe(BSSID_C);
  });

  test('400 con phase (o cualquier otro parámetro) y sin floor_id', async () => {
    expectError(await get('recommendation', '?floor_id=1&phase=antes'), 400);
    expectError(await get('recommendation', '?phase=antes'), 400);
  });

  test('200 para el cliente asignado, con los campos del contrato', async () => {
    const res = await get('recommendation', '?floor_id=1', auth.cliente);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(KEYS);
  });

  commonErrors('recommendation', false);
});
