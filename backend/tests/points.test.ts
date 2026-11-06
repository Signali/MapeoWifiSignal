import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { app } from '../src/app.ts';
import { pool } from '../src/repositories/db.ts';
import { createPointBody } from '../src/schemas/points.ts';
import { signToken } from '../src/services/token.ts';

// Pisos y puntos (contrato §5 filas 8 a 13, §6.8 a §6.13) contra la app real y signalmap_test.
// Seed: org 1, Torre Norte (id 1, asignada al cliente id 3) con el Piso 3 (id 1, 40 x 25 m)
// y 24 puntos (P-07 = id 7); Oficinas Centro (id 2) sin pisos ni asignación.
const P07 = { id: 7, floor_id: 1, code: 'P-07', x: 12.5, y: 8, nfc_uid: '04A23B1C5D8080' };
const PISO_3 = { id: 1, building_id: 1, name: 'Piso 3', width_m: 40, height_m: 25 };
const FORBIDDEN = { message: 'No tiene permiso para esta acción' };
const BAD_ID = { message: 'El id debe ser un número entero' };
const BUILDING_NOT_FOUND = { message: 'Edificio no encontrado' };
const FLOOR_NOT_FOUND = { message: 'Piso no encontrado' };
const POINT_NOT_FOUND = { message: 'Punto no encontrado' };
const BAD_BUILDING_ID = { message: 'building_id es obligatorio y debe ser entero' };
const BAD_FLOOR_ID = { message: 'floor_id es obligatorio y debe ser entero' };
const CODE_REQUIRED = { message: 'code es obligatorio (1 a 20 caracteres)' };
const CODE_CHARS = { message: 'code solo admite letras, números, espacios y - _ . /' };
const NFC_REQUIRED = { message: 'nfc_uid es obligatorio (1 a 32 caracteres hexadecimales)' };
const BAD_X = { message: 'x debe ser un número con hasta 2 decimales' };
const BAD_Y = { message: 'y debe ser un número con hasta 2 decimales' };
const EMPTY_PATCH = { message: 'Debe enviar al menos un campo: code, x, y o nfc_uid' };
const FLOOR_LOCKED = { message: 'floor_id no se puede modificar' };
const DUP_NFC = { message: 'La tira NFC ya está asociada a otro punto' };
const DUP_CODE = { message: 'Ya existe un punto con ese código en el piso' };
const OUTSIDE_PISO_3 = { message: 'Las coordenadas quedan fuera del piso (40 x 25 m)' };

const auth = { admin: '', tecnico: '', cliente: '', clienteSinEdificios: '', adminOtraOrg: '' };

// Datos que el seed no tiene (como en edificios, D6 del Paso 7): se crean aquí y se borran
// al final. En la org 1, un edificio NO asignado al cliente (con piso de 10 x 8 m y un punto);
// en otra org, un edificio con piso y punto, "asignado por error" al cliente de la org 1.
const ids = {
  otherOrg: 0,
  annexBuilding: 0,
  annexFloor: 0,
  annexPoint: 0,
  otherBuilding: 0,
  otherFloor: 0,
  otherPoint: 0,
  clienteSinEdificios: 0,
};
const ANNEX_NFC = '0A0A0A0A';
const OTHER_NFC = '0B0B0B0B';

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

  ids.annexBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES (1, 'Anexo Puntos') RETURNING id`, []);
  ids.annexFloor = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m) VALUES ($1, 'Piso 1', 10, 8) RETURNING id`,
    [ids.annexBuilding],
  );
  ids.annexPoint = await insertId(
    `INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, 'A-01', 1, 1, $2) RETURNING id`,
    [ids.annexFloor, ANNEX_NFC],
  );

  ids.otherOrg = await insertId(`INSERT INTO organizations (name) VALUES ('Otra Org Puntos') RETURNING id`, []);
  ids.otherBuilding = await insertId(`INSERT INTO buildings (org_id, name) VALUES ($1, 'Torre Norte') RETURNING id`, [
    ids.otherOrg,
  ]);
  ids.otherFloor = await insertId(
    `INSERT INTO floors (building_id, name, width_m, height_m) VALUES ($1, 'Piso 3', 40, 25) RETURNING id`,
    [ids.otherBuilding],
  );
  // Mismo code que P-07 de la org 1: la unicidad de code es por piso.
  ids.otherPoint = await insertId(
    `INSERT INTO points (floor_id, code, x, y, nfc_uid) VALUES ($1, 'P-07', 12.5, 8, $2) RETURNING id`,
    [ids.otherFloor, OTHER_NFC],
  );
  // Asignación cruzada (error de datos): el filtro por org_id debe seguir ocultándolo.
  await pool.query('INSERT INTO user_buildings (user_id, building_id) VALUES (3, $1)', [ids.otherBuilding]);

  ids.clienteSinEdificios = await insertId(
    `INSERT INTO users (org_id, email_local, email_domain_id, password_hash, role)
     SELECT 1, 'cliente-sin-edificios-puntos', id, 'sin-login', 'cliente' FROM email_domains WHERE domain = 'demo.cl'
     RETURNING id`,
    [],
  );
  auth.clienteSinEdificios = `Bearer ${signToken({ id: ids.clienteSinEdificios, orgId: 1, role: 'cliente' }, 600)}`;
  auth.adminOtraOrg = `Bearer ${signToken({ id: 999, orgId: ids.otherOrg, role: 'admin' }, 600)}`;
});

// Puntos creados por la API en este archivo: al final se borran solo esos (los otros
// archivos de test corren en paralelo sobre la misma base).
const createdIds: number[] = [];

afterAll(async () => {
  await pool.query('DELETE FROM points WHERE id = ANY($1) OR floor_id = ANY($2)', [
    createdIds,
    [ids.annexFloor, ids.otherFloor],
  ]);
  await pool.query('DELETE FROM floors WHERE id = ANY($1)', [[ids.annexFloor, ids.otherFloor]]);
  await pool.query('DELETE FROM buildings WHERE id = ANY($1)', [[ids.annexBuilding, ids.otherBuilding]]);
  await pool.query('DELETE FROM users WHERE id = $1', [ids.clienteSinEdificios]);
  await pool.query('DELETE FROM organizations WHERE id = $1', [ids.otherOrg]);
  await pool.end();
});

// nfc_uid únicos para los puntos que crean los tests (hexadecimal, sin chocar con el seed).
let nfcSeq = 0;
const nextNfc = () => `ABCD${(++nfcSeq).toString(16).padStart(8, '0').toUpperCase()}`;
let codeSeq = 0;
const nextCode = () => `T-${++codeSeq}`;

const validBody = (overrides: Record<string, unknown> = {}) => ({
  floor_id: 1,
  code: nextCode(),
  x: 30,
  y: 12.5,
  nfc_uid: nextNfc(),
  ...overrides,
});

async function post(token: string, body: unknown) {
  const res = await request(app).post('/api/v1/points').set('Authorization', token).send(body as object);
  if (res.status === 201) createdIds.push(res.body.id);
  return res;
}

async function createdPoint(overrides: Record<string, unknown> = {}) {
  const res = await post(auth.admin, validBody(overrides));
  expect(res.status).toBe(201);
  return res.body as typeof P07;
}

const getPoint = (id: number | string, token = auth.admin) =>
  request(app).get(`/api/v1/points/${id}`).set('Authorization', token);
const patch = (id: number | string, token: string, body: unknown) =>
  request(app).patch(`/api/v1/points/${id}`).set('Authorization', token).send(body as object);
const del = (id: number | string, token: string) => request(app).delete(`/api/v1/points/${id}`).set('Authorization', token);

function expect401(res: request.Response) {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ message: 'Token requerido' });
  expect(res.headers['www-authenticate']).toBe('Bearer');
}

function expectError(res: request.Response, status: number, body?: { message: string }) {
  expect(res.status).toBe(status);
  if (body) expect(res.body).toEqual(body);
  else expect(typeof res.body.message).toBe('string');
}

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/floors?building_id= (fila 8)', () => {
  test.each(['admin', 'tecnico', 'cliente'] as const)('%s → 200 con los pisos de Torre Norte', async (role) => {
    const res = await request(app).get('/api/v1/floors?building_id=1').set('Authorization', auth[role]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([PISO_3]);
  });

  test('admin, edificio sin pisos (Oficinas Centro) → 200 []', async () => {
    const res = await request(app).get('/api/v1/floors?building_id=2').set('Authorization', auth.admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('técnico, edificio de la org no asignado al cliente → 200', async () => {
    const res = await request(app).get(`/api/v1/floors?building_id=${ids.annexBuilding}`).set('Authorization', auth.tecnico);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: ids.annexFloor, building_id: ids.annexBuilding, name: 'Piso 1', width_m: 10, height_m: 8 }]);
  });

  test.each([
    ['falta', ''],
    ['texto', '?building_id=abc'],
    ['cero', '?building_id=0'],
    ['decimal', '?building_id=1.5'],
    ['fuera del integer', '?building_id=2147483648'],
    ['repetido', '?building_id=1&building_id=1'],
  ])('building_id %s → 400', async (_label, qs) => {
    expectError(await request(app).get(`/api/v1/floors${qs}`).set('Authorization', auth.admin), 400, BAD_BUILDING_ID);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    expectError(await request(app).get('/api/v1/floors?building_id=1&org_id=2').set('Authorization', auth.admin), 400);
  });

  test('sin token → 401', async () => expect401(await request(app).get('/api/v1/floors?building_id=1')));

  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherBuilding, 'admin'],
    ['el cliente no lo tiene asignado', (): number => 2, 'cliente'],
    ['el cliente no lo tiene asignado (con pisos)', (): number => ids.annexBuilding, 'cliente'],
    ['está asignado por error a otra org', (): number => ids.otherBuilding, 'cliente'],
    ['el cliente no tiene asignaciones', (): number => 1, 'clienteSinEdificios'],
    ['admin de otra org pide Torre Norte', (): number => 1, 'adminOtraOrg'],
  ] as const)('%s → 404', async (_label, building, role) => {
    const res = await request(app).get(`/api/v1/floors?building_id=${building()}`).set('Authorization', auth[role]);
    expectError(res, 404, BUILDING_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/points?floor_id= (fila 9)', () => {
  test.each(['admin', 'tecnico', 'cliente'] as const)('%s → 200 con los 24 puntos del seed, por id', async (role) => {
    const res = await request(app).get('/api/v1/points?floor_id=1').set('Authorization', auth[role]);
    expect(res.status).toBe(200);
    const seed = res.body.slice(0, 24);
    expect(seed.map((p: { code: string }) => p.code)).toEqual(
      Array.from({ length: 24 }, (_, i) => `P-${String(i + 1).padStart(2, '0')}`),
    );
    expect(seed[6]).toEqual(P07);
    const pointIds = res.body.map((p: { id: number }) => p.id);
    expect(pointIds).toEqual([...pointIds].sort((a, b) => a - b));
    for (const point of res.body) {
      expect(point.floor_id).toBe(1);
      expect(Object.keys(point)).toEqual(['id', 'floor_id', 'code', 'x', 'y', 'nfc_uid']);
    }
  });

  test('admin, piso de un edificio no asignado al cliente → 200', async () => {
    const res = await request(app).get(`/api/v1/points?floor_id=${ids.annexFloor}`).set('Authorization', auth.admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: ids.annexPoint, floor_id: ids.annexFloor, code: 'A-01', x: 1, y: 1, nfc_uid: ANNEX_NFC }]);
  });

  test('admin de otra org → solo los de su piso', async () => {
    const res = await request(app).get(`/api/v1/points?floor_id=${ids.otherFloor}`).set('Authorization', auth.adminOtraOrg);
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([ids.otherPoint]);
  });

  test.each([
    ['falta', ''],
    ['texto', '?floor_id=abc'],
    ['cero', '?floor_id=0'],
    ['negativo', '?floor_id=-1'],
    ['fuera del integer', '?floor_id=99999999999'],
    ['repetido', '?floor_id=1&floor_id=1'],
  ])('floor_id %s → 400', async (_label, qs) => {
    expectError(await request(app).get(`/api/v1/points${qs}`).set('Authorization', auth.admin), 400, BAD_FLOOR_ID);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    expectError(await request(app).get('/api/v1/points?floor_id=1&building_id=1').set('Authorization', auth.admin), 400);
  });

  test('sin token → 401', async () => expect401(await request(app).get('/api/v1/points?floor_id=1')));

  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherFloor, 'admin'],
    ['es de un edificio no asignado al cliente', (): number => ids.annexFloor, 'cliente'],
    ['es de un edificio asignado por error a otra org', (): number => ids.otherFloor, 'cliente'],
    ['el cliente no tiene asignaciones', (): number => 1, 'clienteSinEdificios'],
    ['admin de otra org pide el Piso 3', (): number => 1, 'adminOtraOrg'],
  ] as const)('el piso %s → 404', async (_label, floor, role) => {
    const res = await request(app).get(`/api/v1/points?floor_id=${floor()}`).set('Authorization', auth[role]);
    expectError(res, 404, FLOOR_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------------------
describe('GET /api/v1/points/:id (fila 10)', () => {
  test.each(['admin', 'tecnico', 'cliente'] as const)('%s → 200 P-07 (cuerpo del contrato)', async (role) => {
    const res = await getPoint(7, auth[role]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(P07);
  });

  test('técnico, punto de un edificio no asignado al cliente → 200', async () => {
    const res = await getPoint(ids.annexPoint, auth.tecnico);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('A-01');
  });

  test.each(['abc', '0', '-1', '1.5', '007', '2147483648'])('id %s → 400', async (id) => {
    expectError(await getPoint(id), 400, BAD_ID);
  });

  test('%ZZ → 400 Petición inválida', async () => {
    expectError(await getPoint('%ZZ'), 400, { message: 'Petición inválida' });
  });

  test('parámetro de consulta desconocido → 400', async () => {
    expectError(await request(app).get('/api/v1/points/7?floor_id=1').set('Authorization', auth.admin), 400);
  });

  test('sin token → 401', async () => expect401(await request(app).get('/api/v1/points/7')));

  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherPoint, 'admin'],
    ['es de un edificio no asignado al cliente', (): number => ids.annexPoint, 'cliente'],
    ['es de un edificio asignado por error a otra org', (): number => ids.otherPoint, 'cliente'],
    ['el cliente no tiene asignaciones', (): number => 7, 'clienteSinEdificios'],
    ['admin de otra org pide P-07', (): number => 7, 'adminOtraOrg'],
  ] as const)('el punto %s → 404', async (_label, point, role) => {
    expectError(await getPoint(point(), auth[role]), 404, POINT_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------------------
describe('POST /api/v1/points (fila 11)', () => {
  test.each(['admin', 'tecnico'] as const)('%s → 201 + Location + objeto, y se puede releer', async (role) => {
    const body = validBody();
    const res = await post(auth[role], body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), ...body });
    expect(res.headers.location).toBe(`/api/v1/points/${res.body.id}`);
    const read = await getPoint(res.body.id);
    expect(read.body).toEqual(res.body);
  });

  test('code y nfc_uid se normalizan (trim, espacios, mayúsculas)', async () => {
    const res = await post(auth.admin, validBody({ code: '  p-  25_b ', nfc_uid: ' 04b11c22d3e4ff ' }));
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('P- 25_B');
    expect(res.body.nfc_uid).toBe('04B11C22D3E4FF');
  });

  test.each([
    ['ancho completo', 'Ｐ－３０', 'P-30'],
    ['dos espacios especiales (NBSP)', 'p  31', 'P 31'],
    ['ß', 'ßala', 'SSALA'],
    ['tilde combinada', 'nivél', 'NIVÉL'],
    ['caracteres permitidos', 'a.b/c-d_e 1', 'A.B/C-D_E 1'],
  ])('code con %s → %s', async (_label, code, expected) => {
    const res = await post(auth.admin, validBody({ code }));
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(expected);
  });

  test('normalizar dos veces da lo mismo (code)', () => {
    for (const code of ['  p-  25 ', 'ßala', 'Ｐ－３０', 'nivél', 'İx']) {
      const once = createPointBody.parse(validBody({ code })).code;
      expect(createPointBody.parse(validBody({ code: once })).code).toBe(once);
    }
  });

  test('code de 20 caracteres → 201; el largo se mide después de normalizar', async () => {
    expect((await post(auth.admin, validBody({ code: 'A'.repeat(20) }))).status).toBe(201);
    expect((await post(auth.admin, validBody({ code: `  ${'B'.repeat(10)}     ${'C'.repeat(9)}  ` }))).status).toBe(201);
  });

  test('nfc_uid de 32 caracteres → 201', async () => {
    const res = await post(auth.admin, validBody({ nfc_uid: 'f'.repeat(31) + '1' }));
    expect(res.status).toBe(201);
    expect(res.body.nfc_uid).toBe('F'.repeat(31) + '1');
  });

  test('bordes del piso (0 y 40 x 25) → 201', async () => {
    expect((await post(auth.admin, validBody({ x: 0, y: 0 }))).status).toBe(201);
    expect((await post(auth.admin, validBody({ x: 40, y: 25 }))).status).toBe(201);
    expect((await post(auth.admin, validBody({ x: 39.99, y: 24.99 }))).status).toBe(201);
  });

  test('mismo code en otro piso (P-07 en el Anexo) → 201', async () => {
    const res = await post(auth.admin, validBody({ floor_id: ids.annexFloor, code: 'P-07', x: 5, y: 5 }));
    expect(res.status).toBe(201);
  });

  test('admin crea en un piso de la org no asignado al cliente → 201', async () => {
    expect((await post(auth.admin, validBody({ floor_id: ids.annexFloor, x: 2, y: 2 }))).status).toBe(201);
  });

  // 400 ------------------------------------------------------------------------------
  test.each(['floor_id', 'code', 'x', 'y', 'nfc_uid'])('falta %s → 400', async (field) => {
    const body: Record<string, unknown> = validBody();
    delete body[field];
    expectError(await post(auth.admin, body), 400);
  });

  test.each([
    ['floor_id texto', { floor_id: '1' }, BAD_FLOOR_ID],
    ['floor_id decimal', { floor_id: 1.5 }, BAD_FLOOR_ID],
    ['floor_id cero', { floor_id: 0 }, BAD_FLOOR_ID],
    ['floor_id fuera del integer', { floor_id: 2147483648 }, BAD_FLOOR_ID],
    ['floor_id null', { floor_id: null }, BAD_FLOOR_ID],
    ['x texto ("doce")', { x: 'doce' }, BAD_X],
    ['x como texto numérico', { x: '12.5' }, BAD_X],
    ['x con 3 decimales', { x: 12.345 }, BAD_X],
    ['x muy chico', { x: 1e-7 }, BAD_X],
    ['y con 3 decimales', { y: 1.005 }, BAD_Y],
    ['y null', { y: null }, BAD_Y],
    ['code vacío', { code: '' }, CODE_REQUIRED],
    ['code solo espacios', { code: '   ' }, CODE_REQUIRED],
    ['code de 21', { code: 'A'.repeat(21) }, CODE_REQUIRED],
    ['code número', { code: 7 }, CODE_REQUIRED],
    ['code con emoji', { code: 'P-📶' }, CODE_CHARS],
    ['code con #', { code: 'P#1' }, CODE_CHARS],
    ['code con NUL', { code: 'P\u00001' }, CODE_CHARS],
    ['code con salto de línea', { code: 'P\n1' }, CODE_CHARS],
    ['code con relleno invisible', { code: 'Pㅤ' }, CODE_CHARS],
    ['nfc_uid vacío', { nfc_uid: '' }, NFC_REQUIRED],
    ['nfc_uid no hexadecimal', { nfc_uid: '04G1' }, NFC_REQUIRED],
    ['nfc_uid con separadores', { nfc_uid: '04:A2:3B' }, NFC_REQUIRED],
    ['nfc_uid con ß', { nfc_uid: 'ß' }, NFC_REQUIRED],
    ['nfc_uid con NUL', { nfc_uid: '04\u0000' }, NFC_REQUIRED],
    ['nfc_uid de 33', { nfc_uid: 'A'.repeat(33) }, NFC_REQUIRED],
    ['nfc_uid número', { nfc_uid: 4 }, NFC_REQUIRED],
  ])('%s → 400', async (_label, overrides, message) => {
    expectError(await post(auth.admin, validBody(overrides)), 400, message);
  });

  test('campo desconocido → 400', async () => {
    expectError(await post(auth.admin, validBody({ org_id: 2 })), 400);
  });

  test('sin cuerpo → 400', async () => {
    expectError(await request(app).post('/api/v1/points').set('Authorization', auth.admin), 400);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    const res = await request(app).post('/api/v1/points?floor_id=1').set('Authorization', auth.admin).send(validBody());
    expectError(res, 400);
  });

  // 401 / 403 ------------------------------------------------------------------------
  test('sin token → 401', async () => expect401(await request(app).post('/api/v1/points').send(validBody())));

  test('cliente → 403', async () => {
    expectError(await post(auth.cliente, validBody()), 403, FORBIDDEN);
  });

  test('cliente con cuerpo inválido → 403 (no 400)', async () => {
    expectError(await post(auth.cliente, { x: 'doce' }), 403, FORBIDDEN);
  });

  // 404 ------------------------------------------------------------------------------
  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherFloor, 'admin'],
    ['es de otra org (técnico)', (): number => ids.otherFloor, 'tecnico'],
    ['admin de otra org en el Piso 3', (): number => 1, 'adminOtraOrg'],
  ] as const)('el piso %s → 404 (sin crear nada)', async (_label, floor, role) => {
    const nfc = nextNfc();
    expectError(await post(auth[role], validBody({ floor_id: floor(), nfc_uid: nfc })), 404, FLOOR_NOT_FOUND);
    const { rowCount } = await pool.query('SELECT 1 FROM points WHERE nfc_uid = $1', [nfc]);
    expect(rowCount).toBe(0);
  });

  // 409 ------------------------------------------------------------------------------
  test('nfc_uid de un punto de la misma org → 409', async () => {
    expectError(await post(auth.admin, validBody({ nfc_uid: P07.nfc_uid })), 409, DUP_NFC);
  });

  test('nfc_uid de otra org, en minúsculas → 409 (único en todo el sistema)', async () => {
    expectError(await post(auth.admin, validBody({ nfc_uid: OTHER_NFC.toLowerCase() })), 409, DUP_NFC);
  });

  test.each(['P-07', 'p-07', ' P-07 ', 'Ｐ－０７'])('code %s en el Piso 3 → 409', async (code) => {
    expectError(await post(auth.tecnico, validBody({ code })), 409, DUP_CODE);
  });

  // 422 ------------------------------------------------------------------------------
  test.each([
    ['x mayor al ancho', { x: 40.01 }],
    ['x = 45 (ejemplo del contrato)', { x: 45 }],
    ['y mayor al largo', { y: 25.01 }],
    ['x negativo', { x: -0.01 }],
    ['y negativo', { y: -3 }],
    ['x enorme', { x: 1e300 }],
    ['x entero enorme (1e21: la cuenta de decimales no da exacta)', { x: 1e21 }],
  ])('%s → 422 (sin crear nada)', async (_label, overrides) => {
    const nfc = nextNfc();
    expectError(await post(auth.admin, validBody({ ...overrides, nfc_uid: nfc })), 422, OUTSIDE_PISO_3);
    const { rowCount } = await pool.query('SELECT 1 FROM points WHERE nfc_uid = $1', [nfc]);
    expect(rowCount).toBe(0);
  });

  test('el mensaje usa las medidas del piso (10 x 8 m)', async () => {
    const res = await post(auth.admin, validBody({ floor_id: ids.annexFloor, x: 10.5, y: 1 }));
    expectError(res, 422, { message: 'Las coordenadas quedan fuera del piso (10 x 8 m)' });
  });

  test('fuera del piso y con code duplicado → 422 (se valida antes de escribir)', async () => {
    expectError(await post(auth.admin, validBody({ code: 'P-07', x: 45 })), 422, OUTSIDE_PISO_3);
  });
});

// ---------------------------------------------------------------------------------------
describe('PATCH /api/v1/points/:id (fila 12)', () => {
  test.each(['admin', 'tecnico'] as const)('%s → 200 con los campos cambiados, y se puede releer', async (role) => {
    const point = await createdPoint();
    const res = await patch(point.id, auth[role], { x: 13, y: 8.5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...point, x: 13, y: 8.5 });
    expect((await getPoint(point.id)).body).toEqual(res.body);
  });

  test('cambia code y nfc_uid normalizados, sin tocar x/y', async () => {
    const point = await createdPoint();
    const nfc = nextNfc();
    const res = await patch(point.id, auth.admin, { code: ' nuevo-1 ', nfc_uid: nfc.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...point, code: 'NUEVO-1', nfc_uid: nfc });
  });

  test('solo x, dentro del piso → 200', async () => {
    const point = await createdPoint();
    const res = await patch(point.id, auth.admin, { x: 40 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...point, x: 40 });
  });

  test('sus mismos valores → 200', async () => {
    const point = await createdPoint();
    const { id: _id, floor_id: _floor, ...same } = point;
    const res = await patch(point.id, auth.admin, same);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(point);
  });

  test('admin edita un punto de un edificio no asignado al cliente → 200', async () => {
    const point = await createdPoint({ floor_id: ids.annexFloor, x: 3, y: 3 });
    expect((await patch(point.id, auth.admin, { y: 7.5 })).status).toBe(200);
  });

  // 400 ------------------------------------------------------------------------------
  test('cuerpo vacío → 400', async () => {
    expectError(await patch(7, auth.admin, {}), 400, EMPTY_PATCH);
  });

  test('sin cuerpo → 400', async () => {
    expectError(await request(app).patch('/api/v1/points/7').set('Authorization', auth.admin), 400, EMPTY_PATCH);
  });

  test.each([
    ['solo floor_id', { floor_id: 2 }],
    ['floor_id igual al actual', { floor_id: 1 }],
    ['floor_id junto a otro campo', { floor_id: 1, x: 3 }],
  ])('%s → 400 floor_id no se puede modificar (sin cambios)', async (_label, body) => {
    expectError(await patch(7, auth.admin, body), 400, FLOOR_LOCKED);
    expect((await getPoint(7)).body).toEqual(P07);
  });

  test.each([
    ['campo desconocido', { org_id: 2 }, undefined],
    ['x texto', { x: 'doce' }, BAD_X],
    ['x con 3 decimales', { x: 12.345 }, BAD_X],
    ['y null', { y: null }, BAD_Y],
    ['code vacío', { code: '' }, CODE_REQUIRED],
    ['code con emoji', { code: '📶' }, CODE_CHARS],
    ['nfc_uid no hexadecimal', { nfc_uid: 'ZZ' }, NFC_REQUIRED],
  ])('%s → 400 (sin cambios)', async (_label, body, message) => {
    expectError(await patch(7, auth.admin, body), 400, message);
    expect((await getPoint(7)).body).toEqual(P07);
  });

  test.each(['abc', '0', '2147483648'])('id %s → 400', async (id) => {
    expectError(await patch(id, auth.admin, { x: 1 }), 400, BAD_ID);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    const res = await request(app).patch('/api/v1/points/7?x=1').set('Authorization', auth.admin).send({ x: 13 });
    expectError(res, 400);
  });

  // 401 / 403 ------------------------------------------------------------------------
  test('sin token → 401', async () => expect401(await request(app).patch('/api/v1/points/7').send({ x: 13 })));

  test('cliente → 403 (sin cambios)', async () => {
    expectError(await patch(7, auth.cliente, { x: 13 }), 403, FORBIDDEN);
    expect((await getPoint(7)).body).toEqual(P07);
  });

  test('cliente con id y cuerpo inválidos → 403 (no 400)', async () => {
    expectError(await patch('abc', auth.cliente, { floor_id: 2 }), 403, FORBIDDEN);
  });

  // 404 ------------------------------------------------------------------------------
  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherPoint, 'admin'],
    ['es de otra org (técnico)', (): number => ids.otherPoint, 'tecnico'],
    ['admin de otra org edita P-07', (): number => 7, 'adminOtraOrg'],
  ] as const)('el punto %s → 404 (sin cambios)', async (_label, point, role) => {
    expectError(await patch(point(), auth[role], { x: 1 }), 404, POINT_NOT_FOUND);
    expect((await getPoint(7)).body).toEqual(P07);
    expect((await getPoint(ids.otherPoint, auth.adminOtraOrg)).body.x).toBe(12.5);
  });

  test('404 antes que 422: punto ajeno con coordenadas fuera del piso', async () => {
    expectError(await patch(ids.otherPoint, auth.admin, { x: 999 }), 404, POINT_NOT_FOUND);
  });

  // 409 ------------------------------------------------------------------------------
  test('code de otro punto del piso → 409 (sin cambios)', async () => {
    const point = await createdPoint();
    expectError(await patch(point.id, auth.tecnico, { code: 'p-07' }), 409, DUP_CODE);
    expect((await getPoint(point.id)).body).toEqual(point);
  });

  test('nfc_uid de un punto de otra org → 409 (sin cambios)', async () => {
    const point = await createdPoint();
    expectError(await patch(point.id, auth.admin, { nfc_uid: OTHER_NFC }), 409, DUP_NFC);
    expect((await getPoint(point.id)).body).toEqual(point);
  });

  // 422 ------------------------------------------------------------------------------
  test.each([
    ['x mayor al ancho', { x: 40.01 }],
    ['y mayor al largo', { y: 26 }],
    ['x negativo', { x: -1 }],
    ['ambas fuera', { x: 41, y: 26 }],
  ])('%s → 422 (sin cambios)', async (_label, body) => {
    const point = await createdPoint();
    expectError(await patch(point.id, auth.admin, body), 422, OUTSIDE_PISO_3);
    expect((await getPoint(point.id)).body).toEqual(point);
  });

  test('usa las medidas del piso del punto (10 x 8 m)', async () => {
    const point = await createdPoint({ floor_id: ids.annexFloor, x: 4, y: 4 });
    expectError(await patch(point.id, auth.admin, { y: 9 }), 422, { message: 'Las coordenadas quedan fuera del piso (10 x 8 m)' });
  });

  test('fuera del piso y con code duplicado → 422', async () => {
    const point = await createdPoint();
    expectError(await patch(point.id, auth.admin, { code: 'P-07', x: 50 }), 422, OUTSIDE_PISO_3);
  });
});

// ---------------------------------------------------------------------------------------
describe('DELETE /api/v1/points/:id (fila 13)', () => {
  test('admin → 204 sin cuerpo, y después 404', async () => {
    const point = await createdPoint();
    const res = await del(point.id, auth.admin);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expectError(await getPoint(point.id), 404, POINT_NOT_FOUND);
    expectError(await del(point.id, auth.admin), 404, POINT_NOT_FOUND);
  });

  test('admin borra un punto de un edificio no asignado al cliente → 204', async () => {
    const point = await createdPoint({ floor_id: ids.annexFloor, x: 6, y: 6 });
    expect((await del(point.id, auth.admin)).status).toBe(204);
  });

  test.each(['abc', '0', '2147483648'])('id %s → 400', async (id) => {
    expectError(await del(id, auth.admin), 400, BAD_ID);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    expectError(await request(app).delete('/api/v1/points/7?force=1').set('Authorization', auth.admin), 400);
  });

  test('sin token → 401', async () => expect401(await request(app).delete('/api/v1/points/7')));

  test.each(['tecnico', 'cliente'] as const)('%s → 403 (sigue existiendo)', async (role) => {
    expectError(await del(7, auth[role]), 403, FORBIDDEN);
    expect((await getPoint(7)).status).toBe(200);
  });

  test('técnico con id inválido → 403 (no 400)', async () => {
    expectError(await del('abc', auth.tecnico), 403, FORBIDDEN);
  });

  test.each([
    ['no existe', (): number => 2147483647, 'admin'],
    ['es de otra org', (): number => ids.otherPoint, 'admin'],
    ['admin de otra org borra P-07', (): number => 7, 'adminOtraOrg'],
  ] as const)('el punto %s → 404 (sigue existiendo)', async (_label, point, role) => {
    expectError(await del(point(), auth[role]), 404, POINT_NOT_FOUND);
    expect((await getPoint(7)).status).toBe(200);
    expect((await getPoint(ids.otherPoint, auth.adminOtraOrg)).status).toBe(200);
  });
});
