import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { app } from '../src/app.ts';

const indexHtml = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));

describe('web servida por Express', () => {
  test('GET /api/v1/no-existe → 404 JSON', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Ruta no encontrada' });
  });

  test('GET /api → 404 JSON', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Ruta no encontrada' });
  });

  test('POST / → 404 JSON', async () => {
    const res = await request(app).post('/');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Ruta no encontrada' });
  });

  // En el CI la web se compila antes, así que nunca se salta.
  test.skipIf(!existsSync(indexHtml))('GET / → 200 con la web (text/html)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
