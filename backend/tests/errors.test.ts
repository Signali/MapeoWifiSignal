import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { app } from '../src/app.ts';
import { AppError, type ErrorKind } from '../src/errors.ts';
import { errorHandler } from '../src/middlewares/error-handler.ts';

afterEach(() => vi.restoreAllMocks());

describe('app real', () => {
  test('GET /health sigue respondiendo 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('ruta inexistente → 404', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Ruta no encontrada' });
  });

  test('verbo no soportado en una ruta existente → 404', async () => {
    const res = await request(app).put('/health');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Ruta no encontrada' });
  });

  test('JSON mal formado → 400', async () => {
    const res = await request(app).post('/api/v1/cualquiera').set('Content-Type', 'application/json').send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'JSON mal formado' });
  });

  test('cuerpo mayor a 100 kB → 413', async () => {
    const res = await request(app)
      .post('/api/v1/cualquiera')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(101 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: 'Cuerpo demasiado grande' });
  });
});

// Mini app con el manejador real: todavía no hay rutas de la API que fallen, y una
// ruta de prueba dentro de app.ts sería código de test en producción.
const testApp = express();
testApp.use(express.json());
const kinds: [ErrorKind, number][] = [
  ['validation', 400],
  ['unauthorized', 401],
  ['forbidden', 403],
  ['not_found', 404],
  ['conflict', 409],
  ['domain_rule', 422],
];
for (const [kind] of kinds) {
  testApp.get(`/app-error/${kind}`, () => {
    throw new AppError(kind, `mensaje de ${kind}`);
  });
}
const internalDetail = 'syntax error at or near "SELEC" in SELECT * FROM users';
testApp.post('/falla', () => {
  throw new Error(internalDetail);
});
testApp.get('/falla-async', async () => {
  await Promise.resolve();
  throw new Error(internalDetail);
});
// Como un error de pg por UNIQUE: `detail` trae valores de la fila.
testApp.get('/falla-pg', () => {
  throw Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code: '23505',
    detail: 'Key (email_local)=(juan.perez) already exists.',
  });
});
// Error 4xx del parser distinto de JSON mal formado: charset no soportado → 415.
testApp.post('/eco', (_req, res) => {
  res.json({});
});
testApp.use(errorHandler);

describe('manejador de errores', () => {
  test.each(kinds)('AppError %s → %i con { message }', async (kind, status) => {
    const res = await request(testApp).get(`/app-error/${kind}`);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ message: `mensaje de ${kind}` });
  });

  test('error inesperado → 500 genérico, sin detalles internos; el detalle va al log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(testApp).post('/falla').send({ email: 'a@b.cl', password: 'clave-secreta' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Error interno del servidor' });
    expect(res.text).not.toContain('SELECT');
    expect(res.text).not.toContain('at ');

    const logged = log.mock.calls.flat().map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join('\n');
    expect(logged).toContain('POST /falla');
    expect(logged).toContain(internalDetail);
    expect(logged).not.toContain('clave-secreta');
  });

  test('el log de un error de pg no incluye los valores de `detail`', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(testApp).get('/falla-pg');
    expect(res.status).toBe(500);
    const logged = log.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('duplicate key');
    expect(logged).not.toContain('juan.perez');
  });

  test('otro error 4xx del parser (charset no soportado) → su código, no 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(testApp)
      .post('/eco')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"name":"x"}');
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ message: 'Petición inválida' });
    expect(log).not.toHaveBeenCalled();
  });

  test('promesa rechazada en un handler async → 500 genérico', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(testApp).get('/falla-async');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Error interno del servidor' });
  });
});
