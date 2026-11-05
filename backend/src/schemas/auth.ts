import { z } from 'zod';

// Un solo mensaje para falta, tipo incorrecto o vacío (contrato §6.2).
const required = 'email y password son obligatorios';

export const loginBody = z.strictObject({
  email: z.string({ error: required }).trim().min(1),
  password: z.string({ error: required }).min(1),
});
