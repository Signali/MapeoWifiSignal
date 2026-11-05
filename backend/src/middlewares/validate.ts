import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.ts';

// Mensajes de Zod en español para lo que un schema no personaliza. Es global.
z.config(z.locales.es());

type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

// Un schema por endpoint, siempre con z.strictObject (campo desconocido → 400).
// Si algo no pasa, 400 con el mensaje del primer problema.
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      // Sin cuerpo (o sin Content-Type JSON) req.body es undefined: se valida como {}
      // para que el cliente reciba el mensaje del campo que falta.
      const input = part === 'body' ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(input);
      if (!result.success) throw new AppError('validation', result.error.issues[0].message);
      // El controller lee los datos ya validados y convertidos. defineProperty porque
      // en Express 5 req.query es un getter de solo lectura (no admite `req.query = ...`).
      Object.defineProperty(req, part, { value: result.data, writable: true, enumerable: true, configurable: true });
    }
    next();
  };
}
