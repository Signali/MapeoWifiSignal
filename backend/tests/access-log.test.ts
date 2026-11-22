import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { accessLog } from '../src/middlewares/access-log.ts';
import { authenticate } from '../src/middlewares/auth.ts';
import { authRouter } from '../src/routes/auth.ts';
import { errorHandler } from '../src/middlewares/error-handler.ts';
import { signToken } from '../src/services/token.ts';

// Una app mínima con el registro de accesos y el authenticate real; las líneas van a `lines`.
function appWithLog() {
  const lines: string[] = [];
  const app = express();
  app.use(accessLog((line) => lines.push(line)));
  app.use(express.json());
  app.get('/publica', (_req, res) => res.sendStatus(200));
  app.post('/privada', authenticate, (_req, res) => res.sendStatus(204));
  app.use('/api/v1/auth', authRouter); // el login real, contra la base de tests
  app.use(errorHandler);
  return { app, lines };
}

describe('registro de accesos', () => {
  test('una línea por petición: fecha, método, ruta, código, usuario y duración', async () => {
    const { app, lines } = appWithLog();
    await request(app).get('/publica');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^acceso \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z GET \/publica 200 usuario=- \d+ms$/);
  });

  test('con token válido registra el id del usuario', async () => {
    const { app, lines } = appWithLog();
    const token = signToken({ id: 3, orgId: 1, role: 'tecnico' }, 60);
    await request(app).post('/privada').set('Authorization', `Bearer ${token}`);

    expect(lines[0]).toContain('POST /privada 204 usuario=3 ');
  });

  test('un login exitoso registra el id del usuario; uno fallido, sin usuario', async () => {
    const { app, lines } = appWithLog();
    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'admin@demo.cl', password: process.env.SEED_ADMIN_PASSWORD });
    await request(app).post('/api/v1/auth/login').send({ email: 'admin@demo.cl', password: 'clave-incorrecta' });

    expect(lines[0]).toContain(`POST /api/v1/auth/login 200 usuario=${ok.body.user.id} `);
    expect(lines[1]).toContain('POST /api/v1/auth/login 401 usuario=- ');
  });

  test('sin token o con uno inválido queda el 401 sin usuario', async () => {
    const { app, lines } = appWithLog();
    await request(app).post('/privada').set('Authorization', 'Bearer x.y.z');

    expect(lines[0]).toContain('POST /privada 401 usuario=- ');
  });

  test('no escribe el cuerpo, el token ni los parámetros de consulta', async () => {
    const { app, lines } = appWithLog();
    const token = signToken({ id: 3, orgId: 1, role: 'tecnico' }, 60);
    await request(app)
      .post('/privada?reason=Juan%20P%C3%A9rez')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'a@b.cl', password: 'clave-secreta' });

    expect(lines[0]).toContain('POST /privada 204 ');
    for (const secret of ['clave-secreta', 'a@b.cl', 'reason', 'Juan', token]) expect(lines[0]).not.toContain(secret);
  });

  test('también registra el 400 de un JSON mal formado', async () => {
    const { app, lines } = appWithLog();
    await request(app).post('/privada').set('Content-Type', 'application/json').send('{"x": ');

    expect(lines[0]).toContain('POST /privada 400 usuario=- ');
  });
});
