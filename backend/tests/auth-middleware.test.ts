import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { authenticate, requireRole } from '../src/middlewares/auth.ts';
import { errorHandler } from '../src/middlewares/error-handler.ts';
import { validate } from '../src/middlewares/validate.ts';
import { signToken } from '../src/services/token.ts';

// Mini app con authenticate, requireRole, validate y errorHandler reales: todavía no
// hay rutas protegidas en la API. Estas rutas existen solo en este test.
const testApp = express();
testApp.use(express.json());
testApp.get('/privada', authenticate, (req, res) => {
  res.json({ user: req.user });
});
const body = z.strictObject({ name: z.string({ error: 'name es obligatorio' }).min(1) });
testApp.post('/solo-admin', authenticate, requireRole('admin'), validate({ body }), (_req, res) => {
  res.status(201).json({ ok: true });
});
testApp.post('/admin-o-tecnico', authenticate, requireRole('admin', 'tecnico'), (_req, res) => {
  res.status(201).json({ ok: true });
});
testApp.use(errorHandler);

// Tokens armados a mano, como los fabricaría un atacante.
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const hmac = (data: string, secret = config.jwt.secret, algorithm = 'sha256') =>
  createHmac(algorithm, secret).update(data).digest('base64url');
const now = () => Math.floor(Date.now() / 1000);
const HS256 = { alg: 'HS256', typ: 'JWT' };
const claims = (extra: object = {}) => ({ sub: '1', org_id: 1, role: 'admin', exp: now() + 3600, ...extra });

function craft(header: unknown, payload: unknown, secret?: string): string {
  const data = `${b64(header)}.${b64(payload)}`;
  return `${data}.${hmac(data, secret)}`;
}

const bearer = (token: string) => `Bearer ${token}`;

async function expect401(authorization: string | undefined, message: string) {
  const req = request(testApp).get('/privada');
  if (authorization !== undefined) req.set('Authorization', authorization);
  const res = await req;
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ message });
  expect(res.headers['www-authenticate']).toBe('Bearer');
}

describe('authenticate: token válido', () => {
  test('token armado con HS256 y el secreto → 200 y req.user', async () => {
    const res = await request(testApp).get('/privada').set('Authorization', bearer(craft(HS256, claims())));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: 1, orgId: 1, role: 'admin' } });
  });

  test('token de signToken → 200', async () => {
    const token = signToken({ id: 2, orgId: 1, role: 'tecnico' }, 60);
    const res = await request(testApp).get('/privada').set('Authorization', bearer(token));
    expect(res.body).toEqual({ user: { id: 2, orgId: 1, role: 'tecnico' } });
  });

  test('token del login real → 200', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cliente@demo.cl', password: process.env.SEED_CLIENTE_PASSWORD });
    const res = await request(testApp).get('/privada').set('Authorization', bearer(login.body.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: 3, orgId: 1, role: 'cliente' } });
  });

  test('esquema en minúsculas ("bearer") se acepta (RFC 7235)', async () => {
    const res = await request(testApp).get('/privada').set('Authorization', `bearer ${craft(HS256, claims())}`);
    expect(res.status).toBe(200);
  });
});

describe('authenticate: cabecera Authorization', () => {
  test('sin cabecera → "Token requerido"', () => expect401(undefined, 'Token requerido'));
  test('cabecera vacía → "Token requerido"', () => expect401('', 'Token requerido'));

  test.each([
    ['otro esquema', () => `Basic ${craft(HS256, claims())}`],
    ['Bearer mal escrito', () => `Barer ${craft(HS256, claims())}`],
    ['sin esquema', () => craft(HS256, claims())],
    ['Bearer sin token', () => 'Bearer'],
    ['Bearer con espacio y sin token', () => 'Bearer '],
    ['dos espacios', () => `Bearer  ${craft(HS256, claims())}`],
    ['dos tokens', () => `Bearer ${craft(HS256, claims())} otro`],
  ])('%s → "Token inválido"', (_caso, header) => expect401(header(), 'Token inválido'));
});

describe('authenticate: tokens falsificados o alterados → siempre 401', () => {
  test('alg "none" sin firma', () => {
    const data = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims())}`;
    return expect401(bearer(`${data}.`), 'Token inválido');
  });

  test('alg "none" con una firma HS256 válida del resto', () =>
    expect401(bearer(craft({ alg: 'none', typ: 'JWT' }, claims())), 'Token inválido'));

  test('alg HS512 firmado con el secreto real', () => {
    const data = `${b64({ alg: 'HS512', typ: 'JWT' })}.${b64(claims())}`;
    return expect401(bearer(`${data}.${hmac(data, config.jwt.secret, 'sha512')}`), 'Token inválido');
  });

  test('alg RS256 (confusión de algoritmo)', () =>
    expect401(bearer(craft({ alg: 'RS256', typ: 'JWT' }, claims())), 'Token inválido'));

  test('cabecera con campos extra (kid)', () =>
    expect401(bearer(craft({ ...HS256, kid: '../../dev/null' }, claims())), 'Token inválido'));

  test('firma alterada', () => {
    const token = craft(HS256, claims());
    const last = token.at(-1) === 'A' ? 'B' : 'A';
    return expect401(bearer(token.slice(0, -1) + last), 'Token inválido');
  });

  test('firma con caracteres extra al final', () => expect401(bearer(`${craft(HS256, claims())}x`), 'Token inválido'));

  // El decodificador base64url de Node ignora caracteres fuera del alfabeto: decodificada,
  // esta firma da los mismos bytes que la buena. Solo comparar el texto la rechaza.
  test('firma con un carácter fuera de base64url ("!")', () =>
    expect401(bearer(`${craft(HS256, claims())}!`), 'Token inválido'));

  test('payload alterado (cliente → admin) con la firma original', () => {
    const original = craft(HS256, claims({ role: 'cliente' }));
    const [header, , signature] = original.split('.');
    return expect401(bearer(`${header}.${b64(claims({ role: 'admin' }))}.${signature}`), 'Token inválido');
  });

  test('firmado con otro secreto', () =>
    expect401(bearer(craft(HS256, claims(), 'otro-secreto-de-al-menos-32-caracteres!!')), 'Token inválido'));

  test('vencido → "Token vencido"', () => expect401(bearer(craft(HS256, claims({ exp: now() - 10 }))), 'Token vencido'));

  test('exp igual a ahora → "Token vencido"', () => expect401(bearer(craft(HS256, claims({ exp: now() }))), 'Token vencido'));

  test('vencido y con firma alterada → "Token inválido" (la firma se revisa primero)', () => {
    const token = craft(HS256, claims({ exp: now() - 10 }), 'otro-secreto-de-al-menos-32-caracteres!!');
    return expect401(bearer(token), 'Token inválido');
  });
});

describe('authenticate: tokens deformes → "Token inválido", nunca 500', () => {
  test.each([
    ['una parte', 'abc'],
    ['dos partes', 'abc.def'],
    ['cuatro partes', 'a.b.c.d'],
    ['solo puntos', '..'],
  ])('%s', (_caso, token) => expect401(bearer(token), 'Token inválido'));

  // Firmados con el secreto real: solo falla el contenido del payload.
  const signedRaw = (payloadSegment: string) => {
    const data = `${b64(HS256)}.${payloadSegment}`;
    return `${data}.${hmac(data)}`;
  };

  test.each([
    ['payload que no es base64 JSON', signedRaw('no-es-json')],
    ['payload null', craft(HS256, null)],
    ['payload arreglo', craft(HS256, [1, 2])],
    ['sin role', craft(HS256, { sub: '1', org_id: 1, exp: now() + 60 })],
    ['sin exp', craft(HS256, { sub: '1', org_id: 1, role: 'admin' })],
    ['role desconocido', craft(HS256, claims({ role: 'superadmin' }))],
    ['sub numérico', craft(HS256, claims({ sub: 1 }))],
    ['sub no entero', craft(HS256, claims({ sub: 'abc' }))],
    ['org_id texto', craft(HS256, claims({ org_id: '1' }))],
    ['exp texto', craft(HS256, claims({ exp: String(now() + 60) }))],
    ['campo extra', craft(HS256, claims({ is_admin: true }))],
  ])('%s', (_caso, token) => expect401(bearer(token), 'Token inválido'));
});

describe('requireRole (orden del contrato: 401 → 403 → 400)', () => {
  const tokenFor = (role: string) => bearer(craft(HS256, claims({ role })));

  test('admin con cuerpo válido → 201', async () => {
    const res = await request(testApp).post('/solo-admin').set('Authorization', tokenFor('admin')).send({ name: 'x' });
    expect(res.status).toBe(201);
  });

  test.each(['tecnico', 'cliente'])('%s en ruta de admin → 403', async (role) => {
    const res = await request(testApp).post('/solo-admin').set('Authorization', tokenFor(role)).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'No tiene permiso para esta acción' });
  });

  test('ruta admin o tecnico: tecnico → 201, cliente → 403', async () => {
    const ok = await request(testApp).post('/admin-o-tecnico').set('Authorization', tokenFor('tecnico'));
    expect(ok.status).toBe(201);
    const denied = await request(testApp).post('/admin-o-tecnico').set('Authorization', tokenFor('cliente'));
    expect(denied.status).toBe(403);
  });

  test('cliente con cuerpo inválido → 403, no 400', async () => {
    const res = await request(testApp).post('/solo-admin').set('Authorization', tokenFor('cliente')).send({ nmae: 1 });
    expect(res.status).toBe(403);
  });

  test('sin token y con cuerpo inválido → 401, no 403 ni 400', async () => {
    const res = await request(testApp).post('/solo-admin').send({ nmae: 1 });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token requerido' });
  });

  test('admin con cuerpo inválido → 400', async () => {
    const res = await request(testApp).post('/solo-admin').set('Authorization', tokenFor('admin')).send({ nmae: 1 });
    expect(res.status).toBe(400);
  });
});
