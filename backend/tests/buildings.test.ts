import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { app } from '../src/app.ts';
import { pool } from '../src/repositories/db.ts';
import { buildingBody } from '../src/schemas/buildings.ts';
import { signToken } from '../src/services/token.ts';

// Edificios (contrato §5 filas 3 a 7, §6.3 a §6.7) contra la app real y signalmap_test.
// Seed: org 1 con Torre Norte (id 1, con piso) y Oficinas Centro (id 2, sin pisos);
// el cliente (id 3) tiene asignada solo Torre Norte.
const TORRE_NORTE = { id: 1, name: 'Torre Norte' };
const OFICINAS_CENTRO = { id: 2, name: 'Oficinas Centro' };
const NAME_REQUIRED = { message: 'name es obligatorio (1 a 100 caracteres)' };
const NAME_CHARS = { message: "name solo admite letras, números, espacios y . , - ' ( ) / #" };
const FORBIDDEN = { message: 'No tiene permiso para esta acción' };
const NOT_FOUND = { message: 'Edificio no encontrado' };
const BAD_ID = { message: 'El id debe ser un número entero' };
const DUPLICATE = { message: 'Ya existe un edificio con ese nombre' };
const HAS_FLOORS = { message: 'No se puede borrar: el edificio tiene pisos asociados' };

const auth = { admin: '', tecnico: '', cliente: '', clienteSinEdificios: '', adminOtraOrg: '' };
let otherOrgId: number;
let otherOrgBuildingId: number;
let clienteSinEdificiosId: number;

async function login(email: string, password: string | undefined): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return `Bearer ${res.body.token}`;
}

// Datos que el seed no tiene (decisión D6 del paso): se crean aquí y se borran al final.
beforeAll(async () => {
  auth.admin = await login('admin@demo.cl', process.env.SEED_ADMIN_PASSWORD);
  auth.tecnico = await login('tecnico@demo.cl', process.env.SEED_TECNICO_PASSWORD);
  auth.cliente = await login('cliente@demo.cl', process.env.SEED_CLIENTE_PASSWORD);

  const org = await pool.query<{ id: number }>(`INSERT INTO organizations (name) VALUES ('Otra Org') RETURNING id`);
  otherOrgId = org.rows[0].id;
  // Mismo nombre que un edificio de la org 1: la unicidad es por organización.
  const building = await pool.query<{ id: number }>(
    `INSERT INTO buildings (org_id, name) VALUES ($1, 'Torre Norte') RETURNING id`,
    [otherOrgId],
  );
  otherOrgBuildingId = building.rows[0].id;
  // Asignación cruzada (un error de datos): el cliente de la org 1 "asignado" a un
  // edificio de otra org. El filtro por org_id debe seguir ocultándolo.
  await pool.query(`INSERT INTO user_buildings (user_id, building_id) VALUES (3, $1)`, [otherOrgBuildingId]);

  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (org_id, email_local, email_domain_id, password_hash, role)
     SELECT 1, 'cliente-sin-edificios', id, 'sin-login', 'cliente' FROM email_domains WHERE domain = 'demo.cl'
     RETURNING id`,
  );
  clienteSinEdificiosId = user.rows[0].id;
  auth.clienteSinEdificios = `Bearer ${signToken({ id: clienteSinEdificiosId, orgId: 1, role: 'cliente' }, 600)}`;
  auth.adminOtraOrg = `Bearer ${signToken({ id: 999, orgId: otherOrgId, role: 'admin' }, 600)}`;
});

// Edificios que creó este archivo en la org 1: al final se borran solo esos (los otros
// archivos de test corren en paralelo sobre la misma base).
const createdIds: number[] = [];

afterAll(async () => {
  // Las asignaciones se borran en cascada.
  await pool.query('DELETE FROM buildings WHERE id = ANY($1) OR org_id = $2', [createdIds, otherOrgId]);
  await pool.query('DELETE FROM users WHERE id = $1', [clienteSinEdificiosId]);
  await pool.query('DELETE FROM organizations WHERE id = $1', [otherOrgId]);
  await pool.end();
});

async function createAsAdmin(name: unknown) {
  const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.admin).send({ name });
  if (res.status === 201) createdIds.push(res.body.id);
  return res;
}

async function createdId(name: string): Promise<number> {
  const res = await createAsAdmin(name);
  expect(res.status).toBe(201);
  return res.body.id;
}

function expect401(res: request.Response) {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ message: 'Token requerido' });
  expect(res.headers['www-authenticate']).toBe('Bearer');
}

describe('GET /api/v1/buildings (fila 3)', () => {
  test.each(['admin', 'tecnico'] as const)('%s → 200 con los edificios de su org, por id, solo id y name', async (role) => {
    const res = await request(app).get('/api/v1/buildings').set('Authorization', auth[role]);
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 2)).toEqual([TORRE_NORTE, OFICINAS_CENTRO]);
    const ids = res.body.map((b: { id: number }) => b.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).not.toContain(otherOrgBuildingId);
    for (const building of res.body) expect(Object.keys(building)).toEqual(['id', 'name']);
  });

  test('cliente → 200 solo con sus edificios asignados (ni Oficinas Centro ni el de otra org)', async () => {
    const res = await request(app).get('/api/v1/buildings').set('Authorization', auth.cliente);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([TORRE_NORTE]);
  });

  test('cliente sin edificios asignados → 200 []', async () => {
    const res = await request(app).get('/api/v1/buildings').set('Authorization', auth.clienteSinEdificios);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('admin de otra org → solo los suyos', async () => {
    const res = await request(app).get('/api/v1/buildings').set('Authorization', auth.adminOtraOrg);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: otherOrgBuildingId, name: 'Torre Norte' }]);
  });

  test('parámetro de consulta desconocido → 400', async () => {
    const res = await request(app).get('/api/v1/buildings?org_id=2').set('Authorization', auth.admin);
    expect(res.status).toBe(400);
  });

  test('sin token → 401', async () => expect401(await request(app).get('/api/v1/buildings')));
});

describe('GET /api/v1/buildings/:id (fila 4)', () => {
  test.each(['admin', 'tecnico', 'cliente'] as const)('%s → 200 Torre Norte', async (role) => {
    const res = await request(app).get('/api/v1/buildings/1').set('Authorization', auth[role]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(TORRE_NORTE);
  });

  test.each(['abc', '0', '-1', '1.5', '007', '2147483648', '99999999999'])('id "%s" → 400', async (id) => {
    const res = await request(app).get(`/api/v1/buildings/${id}`).set('Authorization', auth.admin);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_ID);
  });

  test.each(['%ZZ', '%E0%A4%A'])('id con escape de URL inválido (%s) → 400, no 500 (aun sin token)', async (id) => {
    for (const authorization of [auth.admin, undefined]) {
      const req = request(app).get(`/api/v1/buildings/${id}`);
      if (authorization) req.set('Authorization', authorization);
      const res = await req;
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Petición inválida' });
    }
  });

  test('id máximo de PostgreSQL (2147483647), inexistente → 404, no 500', async () => {
    const res = await request(app).get('/api/v1/buildings/2147483647').set('Authorization', auth.admin);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('sin token → 401', async () => expect401(await request(app).get('/api/v1/buildings/1')));

  test('no existe → 404', async () => {
    const res = await request(app).get('/api/v1/buildings/999999').set('Authorization', auth.admin);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('de otra org → 404 (mismo mensaje: no revela que existe)', async () => {
    const res = await request(app).get(`/api/v1/buildings/${otherOrgBuildingId}`).set('Authorization', auth.admin);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('cliente sin ese edificio asignado (Oficinas Centro) → 404', async () => {
    const res = await request(app).get('/api/v1/buildings/2').set('Authorization', auth.cliente);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('cliente asignado por error a un edificio de otra org → 404', async () => {
    const res = await request(app).get(`/api/v1/buildings/${otherOrgBuildingId}`).set('Authorization', auth.cliente);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('cliente sin edificios asignados → 404', async () => {
    const res = await request(app).get('/api/v1/buildings/1').set('Authorization', auth.clienteSinEdificios);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });
});

describe('POST /api/v1/buildings (fila 5)', () => {
  test('admin → 201 + Location + objeto, y queda guardado', async () => {
    const res = await createAsAdmin('Prueba Bodega Sur');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), name: 'Prueba Bodega Sur' });
    expect(res.headers.location).toBe(`/api/v1/buildings/${res.body.id}`);
    const read = await request(app).get(res.headers.location).set('Authorization', auth.admin);
    expect(read.body).toEqual(res.body);
  });

  // Normalización del nombre (decisión D3c): NFC, trim, espacios juntos, mayúscula
  // inicial por palabra.
  test.each([
    ['  prueba   bodega  norte ', 'Prueba Bodega Norte'],
    ['PRUEBA ÑUÑOA ÁRBOL', 'Prueba Ñuñoa Árbol'],
    ["prueba edificio o'higgins", "Prueba Edificio O'Higgins"],
    ['prueba 3er piso-anexo (remodelada)', 'Prueba 3er Piso-Anexo (Remodelada)'],
    ['Prueba UMayor Sede TI', 'Prueba Umayor Sede Ti'],
    ['prueba calle 5 #12, of. 3/4', 'Prueba Calle 5 #12, Of. 3/4'],
    ['prueba café', 'Prueba Café'], // "e" + tilde combinada → "é"
    ["prueba children's d'agostino", "Prueba Children's D'Agostino"], // tras ' solo si antes hay 1 letra
    ['prueba no　separable', 'Prueba No Separable'], // espacios Unicode → espacio (NFKC)
    ['prueba　　doble', 'Prueba Doble'], // NFKC antes de juntar espacios
    ['ｐｒｕｅｂａ ａｎｃｈａ', 'Prueba Ancha'], // ancho completo → letras normales (NFKC)
    ['PRUEBA İSTANBUL', 'Prueba İstanbul'], // 'İ' en minúscula es 'i' + punto: no abre palabra
    ['prueba ßtraße', 'Prueba ßtraße'], // 'ß' en mayúscula es 'SS': queda igual
  ])('"%s" se guarda como "%s"', async (input, stored) => {
    const res = await createAsAdmin(input);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(stored);
  });

  test('100 caracteres → 201', async () => {
    const res = await createAsAdmin('a'.repeat(100));
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`A${'a'.repeat(99)}`);
  });

  test('el largo se mide después de juntar espacios (141 escritos, 92 guardados) → 201', async () => {
    const res = await createAsAdmin(`a${' '.repeat(50)}${'b'.repeat(90)}`);
    expect(res.status).toBe(201);
    expect(res.body.name).toHaveLength(92);
  });

  test('el mismo nombre que un edificio de otra org → 201 (único por organización)', async () => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.adminOtraOrg).send({ name: 'Oficinas Centro' });
    expect(res.status).toBe(201);
  });

  test.each([
    ['falta name', {}],
    ['name vacío', { name: '' }],
    ['solo espacios', { name: '   ' }],
    ['101 caracteres', { name: 'a'.repeat(101) }],
    ['name número', { name: 42 }],
    ['name null', { name: null }],
  ])('%s → 400 "name es obligatorio"', async (_caso, body) => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.admin).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NAME_REQUIRED);
  });

  test.each([
    ['emoji', 'Torre 🚀'],
    ['símbolo', 'Torre $ Norte'],
    ['carácter NUL (PostgreSQL lo rechazaría con un 500)', 'Torre\u0000Norte'],
    ['salto de línea interno', 'Torre\nNorte'],
    ['tabulador interno', 'Torre\tNorte'],
    ['espacio de ancho cero', 'Torre​Norte'],
    ['relleno invisible de Hangul', 'TorreㅤNorte'],
    ['solo un relleno invisible (se vería vacío)', 'ㅤ'],
  ])('%s → 400 con el mensaje de caracteres permitidos', async (_caso, name) => {
    const res = await createAsAdmin(name);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NAME_CHARS);
  });

  test('campo desconocido → 400', async () => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.admin).send({ name: 'Prueba X', org_id: 2 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Llave desconocida: "org_id"' });
  });

  test('sin cuerpo → 400', async () => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.admin);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NAME_REQUIRED);
  });

  test('sin token (y cuerpo inválido) → 401', async () =>
    expect401(await request(app).post('/api/v1/buildings').send({ nmae: 1 })));

  test.each(['tecnico', 'cliente'] as const)('%s → 403', async (role) => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth[role]).send({ name: 'Prueba Prohibida' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });

  test('cliente con cuerpo inválido → 403, no 400 (orden del contrato)', async () => {
    const res = await request(app).post('/api/v1/buildings').set('Authorization', auth.cliente).send({ nmae: 1 });
    expect(res.status).toBe(403);
  });

  test('nombre ya usado en la org → 409', async () => {
    const res = await createAsAdmin('Torre Norte');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(DUPLICATE);
  });

  test.each([
    ['otras mayúsculas y espacios', '  torre   NORTE '],
    ['letras de ancho completo', 'Ｔｏｒｒｅ Ｎｏｒｔｅ'],
    ['negrita matemática', '𝐓𝐨𝐫𝐫𝐞 𝐍𝐨𝐫𝐭𝐞'],
  ])('mismo nombre con %s → 409 (se normaliza antes de guardar)', async (_caso, name) => {
    const res = await createAsAdmin(name);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(DUPLICATE);
  });

  // La API nunca devuelve un nombre que ella misma rechazaría o cambiaría.
  test.each(['PRUEBA İSTANBUL', 'ßtraße', 'ǰ', "children's o'higgins", 'ｐｒｕｅｂａ', 'café #3/4'])(
    'normalizar dos veces da lo mismo: "%s"',
    (name) => {
      const once = buildingBody.parse({ name }).name;
      expect(buildingBody.parse({ name: once }).name).toBe(once);
    },
  );
});

describe('PATCH /api/v1/buildings/:id (fila 6)', () => {
  const patch = (id: number | string, body: object, authorization = auth.admin) =>
    request(app).patch(`/api/v1/buildings/${id}`).set('Authorization', authorization).send(body);

  test('admin → 200 con el objeto actualizado (normalizado), y queda guardado', async () => {
    const id = await createdId('Prueba Para Renombrar');
    const res = await patch(id, { name: 'prueba  renombrada' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, name: 'Prueba Renombrada' });
    const read = await request(app).get(`/api/v1/buildings/${id}`).set('Authorization', auth.admin);
    expect(read.body).toEqual({ id, name: 'Prueba Renombrada' });
  });

  test('renombrar con su mismo nombre → 200', async () => {
    const id = await createdId('Prueba Mismo Nombre');
    const res = await patch(id, { name: 'Prueba Mismo Nombre' });
    expect(res.status).toBe(200);
  });

  test.each([
    ['cuerpo vacío', {}, NAME_REQUIRED],
    ['campo desconocido', { name: 'Prueba X', extra: 1 }, { message: 'Llave desconocida: "extra"' }],
    ['name inválido', { name: '' }, NAME_REQUIRED],
    ['emoji', { name: 'Torre 🚀' }, NAME_CHARS],
  ])('%s → 400', async (_caso, body, message) => {
    const res = await patch(1, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(message);
  });

  test('id no entero → 400', async () => {
    const res = await patch('abc', { name: 'Prueba X' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_ID);
  });

  test('sin token → 401', async () =>
    expect401(await request(app).patch('/api/v1/buildings/1').send({ name: 'Prueba X' })));

  test.each(['tecnico', 'cliente'] as const)('%s → 403 (y el nombre no cambia)', async (role) => {
    const res = await patch(1, { name: 'Prueba Prohibida' }, auth[role]);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
    const read = await request(app).get('/api/v1/buildings/1').set('Authorization', auth.admin);
    expect(read.body).toEqual(TORRE_NORTE);
  });

  test('cliente con id y cuerpo inválidos → 403, no 400 (orden del contrato)', async () => {
    const res = await patch('abc', { nmae: 1 }, auth.cliente);
    expect(res.status).toBe(403);
  });

  test('no existe → 404', async () => {
    const res = await patch(999999, { name: 'Prueba X' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('de otra org → 404 (y no se modifica)', async () => {
    const res = await patch(otherOrgBuildingId, { name: 'Prueba Ajena' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    const { rows } = await pool.query('SELECT name FROM buildings WHERE id = $1', [otherOrgBuildingId]);
    expect(rows[0].name).toBe('Torre Norte');
  });

  test('nombre de otro edificio de la org → 409', async () => {
    const id = await createdId('Prueba Choque');
    const res = await patch(id, { name: 'oficinas centro' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(DUPLICATE);
  });
});

describe('DELETE /api/v1/buildings/:id (fila 7)', () => {
  const del = (id: number | string, authorization = auth.admin) =>
    request(app).delete(`/api/v1/buildings/${id}`).set('Authorization', authorization);

  test('edificio creado por la API (sin pisos) → 204 sin cuerpo, y después 404', async () => {
    const id = await createdId('Prueba Para Borrar');
    const res = await del(id);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const read = await request(app).get(`/api/v1/buildings/${id}`).set('Authorization', auth.admin);
    expect(read.status).toBe(404);
  });

  test('edificio asignado a un cliente → 204 (la asignación se borra en cascada)', async () => {
    const id = await createdId('Prueba Asignada');
    await pool.query('INSERT INTO user_buildings (user_id, building_id) VALUES ($1, $2)', [clienteSinEdificiosId, id]);
    const res = await del(id);
    expect(res.status).toBe(204);
    const { rows } = await pool.query('SELECT 1 FROM user_buildings WHERE building_id = $1', [id]);
    expect(rows).toEqual([]);
  });

  test('id no entero → 400', async () => {
    const res = await del('abc');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_ID);
  });

  test('sin token → 401', async () => expect401(await request(app).delete('/api/v1/buildings/2')));

  test.each(['tecnico', 'cliente'] as const)('%s → 403 (y no se borra)', async (role) => {
    const res = await del(2, auth[role]);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
    const read = await request(app).get('/api/v1/buildings/2').set('Authorization', auth.admin);
    expect(read.status).toBe(200);
  });

  test('tecnico con id inválido → 403, no 400 (orden del contrato)', async () => {
    const res = await del('abc', auth.tecnico);
    expect(res.status).toBe(403);
  });

  test('no existe → 404', async () => {
    const res = await del(999999);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('de otra org → 404 (y sigue existiendo)', async () => {
    const res = await del(otherOrgBuildingId);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    const { rows } = await pool.query('SELECT 1 FROM buildings WHERE id = $1', [otherOrgBuildingId]);
    expect(rows).toHaveLength(1);
  });

  test('edificio con pisos (Torre Norte) → 409 (y sigue existiendo)', async () => {
    const res = await del(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(HAS_FLOORS);
    const read = await request(app).get('/api/v1/buildings/1').set('Authorization', auth.admin);
    expect(read.body).toEqual(TORRE_NORTE);
  });
});
