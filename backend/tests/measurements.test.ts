import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { app } from '../src/app.ts';
import { pool } from '../src/repositories/db.ts';
import { signToken } from '../src/services/token.ts';

// Rutas 15 y 17 (contrato §5, §6.15 y §6.17) contra la app real y signalmap_test.
// Seed: org 1, Torre Norte (id 1, asignada al cliente) con el Piso 3 y 24 puntos (P-24 = id 24).
// Los tests crean un edificio de la org 1 NO asignado al cliente y otra organización, con su
// piso y punto, y borran al final solo lo que crearon (otros archivos corren en paralelo).
const SSID = process.env.SEED_WIFI_SSID as string;
const P24 = 24;
const FORBIDDEN = { message: 'No tiene permiso para esta acción' };
const POINT_NOT_FOUND = { message: 'Punto no encontrado' };
const MEASUREMENT_NOT_FOUND = { message: 'Medición no encontrada' };
const READINGS_MSG = { message: 'readings debe tener entre 1 y 100 lecturas' };
const MEASURED_AT_MSG = { message: 'measured_at debe ser una fecha ISO 8601 con zona horaria' };

const auth = { admin: '', tecnico: '', cliente: '', adminOtraOrg: '' };
const ids = { adminUser: 0, annexBuilding: 0, annexFloor: 0, annexPoint: 0, otherOrg: 0, otherBuilding: 0, otherFloor: 0, otherPoint: 0 };
const uuids: string[] = [];

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

  ids.annexBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES (1, 'Anexo Mediciones') RETURNING id`, []);
  ids.annexFloor = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m) VALUES ($1, 'Piso 1', 10, 8) RETURNING id`,
    [ids.annexBuilding],
  );
  ids.annexPoint = await insertId(
    `INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, 'M-01', 1, 1, '0C0C0C0C') RETURNING id`,
    [ids.annexFloor],
  );

  ids.otherOrg = await insertId(`INSERT INTO organizations (name, wifi_ssid) VALUES ('Otra Org Mediciones', 'Otra Red') RETURNING id`, []);
  ids.otherBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES ($1, 'Torre Norte') RETURNING id`, [ids.otherOrg]);
  ids.otherFloor = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m) VALUES ($1, 'Piso 3', 40, 25) RETURNING id`,
    [ids.otherBuilding],
  );
  ids.otherPoint = await insertId(
    `INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, 'M-01', 1, 1, '0D0D0D0D') RETURNING id`,
    [ids.otherFloor],
  );
  auth.adminOtraOrg = `Bearer ${signToken({ id: ids.adminUser, orgId: ids.otherOrg, role: 'admin' }, 600)}`;
});

afterAll(async () => {
  await pool.query('DELETE FROM measurements WHERE client_uuid = ANY($1)', [uuids]); // las lecturas caen en cascada
  await pool.query('DELETE FROM points WHERE id = ANY($1)', [[ids.annexPoint, ids.otherPoint]]);
  await pool.query('DELETE FROM floors WHERE id = ANY($1)', [[ids.annexFloor, ids.otherFloor]]);
  await pool.query('DELETE FROM buildings WHERE id = ANY($1)', [[ids.annexBuilding, ids.otherBuilding]]);
  await pool.query('DELETE FROM organizations WHERE id = $1', [ids.otherOrg]);
  await pool.end();
});

const reading = (overrides: Record<string, unknown> = {}) => ({
  bssid: 'a4:2b:b0:11:22:33',
  ssid: SSID,
  rssi_dbm: -74,
  frequency_mhz: 5180,
  ...overrides,
});

const validBody = (overrides: Record<string, unknown> = {}) => ({
  point_id: ids.annexPoint,
  phase: 'antes',
  client_uuid: randomUUID(),
  readings: [reading()],
  ...overrides,
});

async function post(token: string, body: Record<string, unknown>) {
  // Solo los UUID válidos: la limpieza final los compara con una columna uuid.
  if (typeof body.client_uuid === 'string' && /^[0-9a-f-]{36}$/i.test(body.client_uuid)) uuids.push(body.client_uuid.toLowerCase());
  return request(app).post('/api/v1/measurements').set('Authorization', token).send(body);
}

const get = (id: number | string, token = auth.admin) => request(app).get(`/api/v1/measurements/${id}`).set('Authorization', token);
const countOf = async (uuid: string) =>
  Number((await pool.query('SELECT count(*) FROM measurements WHERE client_uuid = $1', [uuid])).rows[0].count);

// Medición de la otra organización, insertada por SQL (la API no la dejaría crear desde la org 1).
async function insertOtherOrgMeasurement(uuid = randomUUID()): Promise<number> {
  uuids.push(uuid);
  return insertId(
    `INSERT INTO measurements (point_id, user_id, phase, client_uuid, measured_at) VALUES ($1, $2, 'antes', $3, now()) RETURNING id`,
    [ids.otherPoint, ids.adminUser, uuid],
  );
}

function expectError(res: request.Response, status: number, body?: { message: string }) {
  expect(res.status).toBe(status);
  if (body) expect(res.body).toEqual(body);
  else expect(typeof res.body.message).toBe('string');
}

// ---------------------------------------------------------------------------------------
describe('POST /api/v1/measurements (fila 15)', () => {
  test('201 + Location + cuerpo exacto: descarta otras redes, ordena, BSSID y client_uuid en minúsculas, measured_at en UTC', async () => {
    const at = new Date(Date.now() - 3_600_000);
    const uuid = randomUUID();
    const res = await post(auth.admin, {
      point_id: ids.annexPoint,
      phase: 'antes',
      client_uuid: uuid.toUpperCase(),
      measured_at: new Date(at.getTime() - 3 * 3_600_000).toISOString().replace('Z', '-03:00'),
      readings: [
        reading({ bssid: 'A4:2B:B0:11:22:34', rssi_dbm: -79, frequency_mhz: 2437 }),
        reading({ bssid: 'A4:2B:B0:11:22:33' }),
        reading({ bssid: '10:fe:ed:aa:bb:cc', ssid: 'Vecino 5G', rssi_dbm: -60, frequency_mhz: 5240 }),
      ],
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/measurements/${res.body.id}`);
    expect(res.body).toEqual({
      id: res.body.id,
      point_id: ids.annexPoint,
      phase: 'antes',
      measured_at: at.toISOString(),
      category: 'debil',
      best_rssi_dbm: -74,
      voided: null,
      readings: [reading(), reading({ bssid: 'a4:2b:b0:11:22:34', rssi_dbm: -79, frequency_mhz: 2437 })],
    });
    const { rows } = await pool.query('SELECT client_uuid FROM measurements WHERE id = $1', [res.body.id]);
    expect(rows[0].client_uuid).toBe(uuid);
  });

  test('sin measured_at: usa la hora de recepción', async () => {
    const res = await post(auth.admin, validBody({ readings: [reading({ rssi_dbm: -60 })] }));
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('buena');
    expect(Math.abs(Date.now() - Date.parse(res.body.measured_at))).toBeLessThan(5000);
  });

  test('categoría regular con la lectura más fuerte (−68 dBm)', async () => {
    const res = await post(auth.admin, validBody({ readings: [reading({ rssi_dbm: -68 })] }));
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('regular');
  });

  test('sin lecturas de la red de la organización → 201 sin_senal', async () => {
    const res = await post(auth.admin, validBody({ readings: [reading({ ssid: 'Vecino 5G' })] }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'sin_senal', best_rssi_dbm: null, readings: [] });
  });

  test('el SSID se compara exacto (distingue mayúsculas)', async () => {
    const res = await post(auth.admin, validBody({ readings: [reading({ ssid: SSID.toUpperCase() === SSID ? SSID.toLowerCase() : SSID.toUpperCase() })] }));
    expect(res.status).toBe(201);
    expect(res.body.readings).toEqual([]);
  });

  test('tecnico → 201', async () => {
    expect((await post(auth.tecnico, validBody())).status).toBe(201);
  });

  test('mismo client_uuid → 200 con la ya guardada, aunque el cuerpo sea otro, sin fila nueva', async () => {
    const body = validBody();
    const first = await post(auth.admin, body);
    expect(first.status).toBe(201);
    const again = await post(auth.admin, { ...body, phase: 'despues', readings: [reading({ rssi_dbm: -50 })] });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(again.headers.location).toBeUndefined();
    expect(await countOf(body.client_uuid)).toBe(1);
  });

  test('reenvío con el punto ya inválido o la fecha fuera de rango → 200 (el client_uuid se resuelve antes)', async () => {
    const body = validBody();
    const first = await post(auth.admin, body);
    expect(first.status).toBe(201);
    const again = await post(auth.admin, { ...body, point_id: 2147483647, measured_at: '2020-01-01T00:00:00Z' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  test('client_uuid de otra organización → 409', async () => {
    const uuid = randomUUID();
    await insertOtherOrgMeasurement(uuid);
    expectError(await post(auth.admin, validBody({ client_uuid: uuid })), 409, { message: 'client_uuid ya fue usado' });
  });

  test('cliente → 403, también con el cuerpo mal formado (gana al 400)', async () => {
    expectError(await post(auth.cliente, validBody()), 403, FORBIDDEN);
    expectError(await post(auth.cliente, { x: 1 }), 403, FORBIDDEN);
  });

  test('sin token → 401', async () => {
    const res = await request(app).post('/api/v1/measurements').send(validBody());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token requerido' });
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => reading({ bssid: `aa:bb:cc:dd:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 255).toString(16).padStart(2, '0')}` }));

  test.each([
    ['point_id no es entero', { point_id: 'siete' }, 'point_id es obligatorio y debe ser entero'],
    ['falta point_id', { point_id: undefined }, 'point_id es obligatorio y debe ser entero'],
    ['phase inválida', { phase: 'durante' }, 'phase debe ser antes o despues'],
    ['falta phase', { phase: undefined }, 'phase debe ser antes o despues'],
    ['client_uuid no es UUID', { client_uuid: 'abc' }, 'client_uuid es obligatorio y debe ser un UUID'],
    ['falta client_uuid', { client_uuid: undefined }, 'client_uuid es obligatorio y debe ser un UUID'],
    ['readings vacío', { readings: [] }, READINGS_MSG.message],
    ['readings con 101 lecturas', { readings: many(101) }, READINGS_MSG.message],
    ['falta readings', { readings: undefined }, READINGS_MSG.message],
    ['bssid con otro formato', { readings: [reading({ bssid: 'a4-2b-b0-11-22-33' })] }, 'bssid debe tener el formato aa:bb:cc:dd:ee:ff'],
    ['ssid de 33 caracteres', { readings: [reading({ ssid: 'x'.repeat(33) })] }, 'ssid debe tener hasta 32 caracteres'],
    ['rssi_dbm −121', { readings: [reading({ rssi_dbm: -121 })] }, 'rssi_dbm debe ser un entero entre -120 y 0'],
    ['rssi_dbm 1', { readings: [reading({ rssi_dbm: 1 })] }, 'rssi_dbm debe ser un entero entre -120 y 0'],
    ['rssi_dbm −70,5', { readings: [reading({ rssi_dbm: -70.5 })] }, 'rssi_dbm debe ser un entero entre -120 y 0'],
    ['frequency_mhz 2399', { readings: [reading({ frequency_mhz: 2399 })] }, 'frequency_mhz debe ser un entero entre 2400 y 7125'],
    ['frequency_mhz 7126', { readings: [reading({ frequency_mhz: 7126 })] }, 'frequency_mhz debe ser un entero entre 2400 y 7125'],
    [
      'bssid repetido (mayúsculas y minúsculas)',
      { readings: [reading({ bssid: 'AA:BB:CC:DD:EE:FF' }), reading({ bssid: 'aa:bb:cc:dd:ee:ff' })] },
      'Hay un bssid repetido en readings',
    ],
    ['measured_at sin zona horaria', { measured_at: '2026-11-12T12:04:05' }, MEASURED_AT_MSG.message],
    ['measured_at no es texto', { measured_at: 1762956245 }, MEASURED_AT_MSG.message],
    ['measured_at con una fecha imposible', { measured_at: '2026-02-30T12:00:00Z' }, MEASURED_AT_MSG.message],
  ])('400: %s', async (_name, overrides, message) => {
    expectError(await post(auth.admin, validBody(overrides)), 400, { message });
  });

  test('400: campo desconocido en la medición y en una lectura', async () => {
    expectError(await post(auth.admin, validBody({ user_id: 1 })), 400);
    expectError(await post(auth.admin, validBody({ readings: [reading({ extra: 1 })] })), 400);
  });

  test('400: parámetro de consulta desconocido', async () => {
    const res = await request(app).post('/api/v1/measurements?x=1').set('Authorization', auth.admin).send(validBody());
    expectError(res, 400);
  });

  test('400: JSON mal formado', async () => {
    const res = await request(app)
      .post('/api/v1/measurements')
      .set('Authorization', auth.admin)
      .set('Content-Type', 'application/json')
      .send('{"point_id":');
    expectError(res, 400, { message: 'JSON mal formado' });
  });

  test('404: punto inexistente y punto de otra organización', async () => {
    expectError(await post(auth.admin, validBody({ point_id: 2147483647 })), 404, POINT_NOT_FOUND);
    expectError(await post(auth.admin, validBody({ point_id: ids.otherPoint })), 404, POINT_NOT_FOUND);
  });

  test.each([
    ['10 minutos en el futuro', () => new Date(Date.now() + 10 * 60_000)],
    ['hace 31 días', () => new Date(Date.now() - 31 * 86_400_000)],
  ])('422: measured_at %s', async (_name, when) => {
    const res = await post(auth.admin, validBody({ measured_at: when().toISOString() }));
    expectError(res, 422, { message: 'measured_at debe estar entre los últimos 30 días y ahora' });
  });

  test('la medición rechazada no deja filas', async () => {
    const body = validBody({ measured_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect((await post(auth.admin, body)).status).toBe(422);
    expect(await countOf(body.client_uuid)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/measurements/:id (fila 17)', () => {
  test('200 con el cuerpo de §6.15 (admin, tecnico)', async () => {
    const created = await post(auth.admin, validBody());
    expect(created.status).toBe(201);
    for (const token of [auth.admin, auth.tecnico]) {
      const res = await get(created.body.id, token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
    }
  });

  test('200 con una anulada: voided completo', async () => {
    const created = await post(auth.admin, validBody());
    await pool.query(
      `UPDATE measurements SET voided_at = now(), void_reason = 'punto_equivocado', voided_by = $2 WHERE id = $1`,
      [created.body.id, ids.adminUser],
    );
    const res = await get(created.body.id);
    expect(res.status).toBe(200);
    expect(res.body.voided).toEqual({ reason: 'punto_equivocado', at: expect.any(String) });
    expect(Number.isNaN(Date.parse(res.body.voided.at))).toBe(false);
    expect(res.body.readings).toEqual(created.body.readings);
  });

  test('200 cliente con una medición del P-24 (Torre Norte asignada)', async () => {
    const created = await post(auth.admin, validBody({ point_id: P24 }));
    expect(created.status).toBe(201);
    const res = await get(created.body.id, auth.cliente);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  test('400: id no entero', async () => {
    expectError(await get('abc'), 400, { message: 'El id debe ser un número entero' });
  });

  test('400: parámetro de consulta desconocido', async () => {
    const res = await request(app).get('/api/v1/measurements/1?x=1').set('Authorization', auth.admin);
    expectError(res, 400);
  });

  test('401 sin token', async () => {
    const res = await request(app).get('/api/v1/measurements/1');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token requerido' });
  });

  test('404: inexistente, de otra organización y (cliente) de un edificio no asignado', async () => {
    expectError(await get(2147483647), 404, MEASUREMENT_NOT_FOUND);

    const other = await insertOtherOrgMeasurement();
    expectError(await get(other), 404, MEASUREMENT_NOT_FOUND);

    const annex = await post(auth.admin, validBody());
    expect(annex.status).toBe(201);
    expect((await get(annex.body.id)).status).toBe(200); // el admin sí la ve
    expectError(await get(annex.body.id, auth.cliente), 404, MEASUREMENT_NOT_FOUND);
  });
});
