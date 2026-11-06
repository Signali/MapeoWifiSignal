import { z } from 'zod';

const BAD_ID = 'El id debe ser un número entero';
// Tope del tipo integer de PostgreSQL: un id mayor llegaría a la base y daría 500.
const MAX_INTEGER = 2147483647;

// Id que llega como texto (ruta o consulta): entero de 1 a 2147483647, sin ceros a la
// izquierda. Un solo mensaje para falta, tipo (p. ej. repetido: ?a=1&a=1) y formato.
export const textId = (message: string) =>
  z
    .string({ error: message })
    .regex(/^[1-9]\d{0,9}$/, message)
    .transform(Number)
    .refine((id) => id <= MAX_INTEGER, message);

// Id que llega como número en el cuerpo JSON (p. ej. floor_id): misma regla de rango.
export const bodyId = (message: string) => z.number({ error: message }).int(message).min(1, message).max(MAX_INTEGER, message);

// `:id` de la ruta.
export const idParams = z.strictObject({ id: textId(BAD_ID) });

// Rutas que no reciben parámetros de consulta: uno desconocido → 400 (contrato §1).
export const noQuery = z.strictObject({});

// Texto que el servidor normaliza antes de guardar (name de edificios, code de puntos).
// Primer paso común: NFKC (tilde combinada → un carácter; ancho completo, negrita y
// espacios especiales → forma normal), sin espacios al borde y espacios repetidos juntos.
// Cada campo aplica después su propia regla de mayúsculas y de caracteres permitidos.
export const squish = (text: string) => text.normalize('NFKC').trim().replace(/ {2,}/g, ' ');

// Rellenos de Hangul: cuentan como letras (\p{L}) pero no se ven. Se rechazan en todo
// texto normalizado.
export const INVISIBLE_LETTERS = /[ᅟᅠㅤﾠ]/u;
