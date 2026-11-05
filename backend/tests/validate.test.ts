import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/middlewares/error-handler.ts';
import { validate } from '../src/middlewares/validate.ts';

// Mini app con el validador y el manejador reales: todavía no hay rutas de la API
// que validen. Las rutas y schemas de abajo existen solo en este test.
const body = z.strictObject({
  name: z.string({ error: 'name es obligatorio (1 a 100 caracteres)' }).trim().min(1).max(100),
});
const params = z.strictObject({
  id: z.string().regex(/^\d+$/, 'El id debe ser un número entero').transform(Number),
});
// En Zod 4, el `error` de z.string({ error }) cubre todos los problemas del campo
// (falta, tipo, largo, formato): un solo mensaje por campo, como en el contrato.
const query = z.strictObject({
  floor_id: z.string({ error: 'floor_id es obligatorio y debe ser entero' }).regex(/^\d+$/).transform(Number),
});

const testApp = express();
testApp.use(express.json());
testApp.post('/items', validate({ body }), (req, res) => {
  res.json({ body: req.body });
});
testApp.get('/items/:id', validate({ params }), (req, res) => {
  res.json({ id: req.params.id, type: typeof req.params.id });
});
testApp.get('/points', validate({ query }), (req, res) => {
  res.json({ floor_id: req.query.floor_id, type: typeof req.query.floor_id });
});
testApp.use(errorHandler);

describe('validate: cuerpo', () => {
  test('cuerpo válido → el controller recibe los datos ya validados', async () => {
    const res = await request(testApp).post('/items').send({ name: '  Bodega Sur  ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { name: 'Bodega Sur' } });
  });

  test('campo desconocido → 400, con el mensaje de Zod en español', async () => {
    const res = await request(testApp).post('/items').send({ name: 'Bodega Sur', nmae: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Llave desconocida: "nmae"' });
  });

  test('cadena vacía → 400 con el mensaje del schema', async () => {
    const res = await request(testApp).post('/items').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'name es obligatorio (1 a 100 caracteres)' });
  });

  test('tipo incorrecto → 400 con el mensaje del schema', async () => {
    const res = await request(testApp).post('/items').send({ name: 42 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'name es obligatorio (1 a 100 caracteres)' });
  });

  test('sin cuerpo → 400 con el mensaje del campo que falta (no 500)', async () => {
    const res = await request(testApp).post('/items');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'name es obligatorio (1 a 100 caracteres)' });
  });

  test('cuerpo que no es JSON (form-data) → mismo 400', async () => {
    const res = await request(testApp).post('/items').type('form').send({ name: 'Bodega Sur' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'name es obligatorio (1 a 100 caracteres)' });
  });
});

describe('validate: params', () => {
  test('id válido → llega convertido a número', async () => {
    const res = await request(testApp).get('/items/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, type: 'number' });
  });

  test('id no entero → 400', async () => {
    const res = await request(testApp).get('/items/abc');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'El id debe ser un número entero' });
  });
});

describe('validate: query', () => {
  test('query válida → llega convertida (req.query es de solo lectura en Express 5)', async () => {
    const res = await request(testApp).get('/points?floor_id=3');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ floor_id: 3, type: 'number' });
  });

  test('falta el parámetro obligatorio → 400', async () => {
    const res = await request(testApp).get('/points');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'floor_id es obligatorio y debe ser entero' });
  });

  test('parámetro de consulta desconocido → 400', async () => {
    const res = await request(testApp).get('/points?floor_id=3&color=rojo');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('color');
  });
});
