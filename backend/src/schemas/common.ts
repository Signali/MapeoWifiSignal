import { z } from 'zod';

const BAD_ID = 'El id debe ser un número entero';
// Tope del tipo integer de PostgreSQL: un id mayor llegaría a la base y daría 500.
const MAX_INTEGER = 2147483647;

// `:id` de la ruta: entero de 1 a 2147483647, sin ceros a la izquierda.
export const idParams = z.strictObject({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, BAD_ID)
    .transform(Number)
    .refine((id) => id <= MAX_INTEGER, BAD_ID),
});

// Rutas que no reciben parámetros de consulta: uno desconocido → 400 (contrato §1).
export const noQuery = z.strictObject({});
