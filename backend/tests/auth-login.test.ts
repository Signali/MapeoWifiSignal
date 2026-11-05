import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';

// Contra la app real y la base de tests (resembrada en global-setup: admin = 1,
// tecnico = 2, cliente = 3, todos de la organización 1).
afterEach(() => vi.restoreAllMocks());

const passwords = {
  admin: process.env.SEED_ADMIN_PASSWORD,
  tecnico: process.env.SEED_TECNICO_PASSWORD,
  cliente: process.env.SEED_CLIENTE_PASSWORD,
};

function login(body: unknown) {
  return request(app).post('/api/v1/auth/login').send(body as object);
}

function decodePayload(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

describe('POST /api/v1/auth/login: éxito', () => {
  test.each([
    ['admin', 1],
    ['tecnico', 2],
    ['cliente', 3],
  ] as const)('%s → 200 con token, expires_in de su rol y user', async (role, id) => {
    const res = await login({ email: `${role}@demo.cl`, password: passwords[role] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: expect.any(String),
      expires_in: config.jwt.expiresIn[role],
      user: { id, email: `${role}@demo.cl`, role },
    });

    const payload = decodePayload(res.body.token);
    const now = Math.floor(Date.now() / 1000);
    expect(payload).toEqual({ sub: String(id), org_id: 1, role, exp: expect.any(Number) });
    expect(payload.exp - now).toBeGreaterThanOrEqual(config.jwt.expiresIn[role] - 5);
    expect(payload.exp - now).toBeLessThanOrEqual(config.jwt.expiresIn[role]);
  });

  test('el email se normaliza: espacios al borde y mayúsculas', async () => {
    const res = await login({ email: '  ADMIN@Demo.CL ', password: passwords.admin });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@demo.cl');
  });
});

describe('POST /api/v1/auth/login: 400', () => {
  test.each([
    ['falta email', { password: 'x' }],
    ['falta password', { email: 'admin@demo.cl' }],
    ['email no es texto', { email: 123, password: 'x' }],
    ['password no es texto', { email: 'admin@demo.cl', password: true }],
    ['email vacío', { email: '   ', password: 'x' }],
    ['password vacía', { email: 'admin@demo.cl', password: '' }],
    ['cuerpo vacío', {}],
  ])('%s → 400 con el mensaje del contrato', async (_caso, body) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'email y password son obligatorios' });
  });

  test('campo desconocido → 400', async () => {
    const res = await login({ email: 'admin@demo.cl', password: passwords.admin, org_id: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('org_id');
  });
});

describe('POST /api/v1/auth/login: 401 genérico', () => {
  test.each([
    ['clave incorrecta', { email: 'admin@demo.cl', password: 'clave-incorrecta' }],
    ['email inexistente', { email: 'nadie@demo.cl', password: 'clave-incorrecta' }],
    ['dominio inexistente', { email: 'admin@otro.cl', password: passwords.admin }],
    ['email sin @', { email: 'admin', password: passwords.admin }],
    ['clave de otro usuario', { email: 'admin@demo.cl', password: passwords.tecnico }],
  ])('%s → 401 "Credenciales inválidas" + WWW-Authenticate', async (_caso, body) => {
    const res = await login(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas' });
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  // El tiempo no debe revelar si el email existe: bcrypt (~60 ms) corre en ambos casos.
  test.each([
    ['email inexistente', 'nadie@demo.cl'],
    ['email existente', 'admin@demo.cl'],
  ])('%s → se ejecuta bcrypt.compare igual', async (_caso, email) => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const res = await login({ email, password: 'clave-incorrecta' });
    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
  });
});
