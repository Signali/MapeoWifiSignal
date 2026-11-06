import { z } from 'zod';
import { bodyId, INVISIBLE_LETTERS, squish, textId } from './common.ts';

const FLOOR_ID = 'floor_id es obligatorio y debe ser entero';
const CODE_REQUIRED = 'code es obligatorio (1 a 20 caracteres)';
const CODE_CHARS = 'code solo admite letras, números, espacios y - _ . /';
const NFC_REQUIRED = 'nfc_uid es obligatorio (1 a 32 caracteres hexadecimales)';

// GET /points?floor_id= (contrato §6.9).
export const pointsQuery = z.strictObject({ floor_id: textId(FLOOR_ID) });

// Código del punto (contrato §4), normalizado antes de guardarlo: así "p-07", " P-07 " y
// "Ｐ－０７" son el mismo código (→ 409 en el piso). Letras, números, espacio y - _ . /;
// deja fuera control (un \u0000 haría fallar a PostgreSQL con un 500) y rellenos invisibles.
// 1) `squish`: NFKC + trim + espacios juntos (el CHECK de la base exige code = btrim(code)).
// 2) Mayúsculas y NFKC otra vez (por si una mayúscula se escribe con una marca suelta).
// 3) Caracteres permitidos y largo, sobre lo que se guarda.
const code = z
  .string({ error: CODE_REQUIRED })
  .transform((value) => squish(value).toUpperCase().normalize('NFKC'))
  .pipe(
    z
      .string()
      .regex(/^[\p{L}\p{N} ._/-]*$/u, CODE_CHARS)
      .refine((value) => !INVISIBLE_LETTERS.test(value), CODE_CHARS)
      .min(1, CODE_REQUIRED)
      .max(20, CODE_REQUIRED),
  );

// UID de la tira NFC: hexadecimal (es lo que lee Android), en mayúsculas para que
// "04a2…" y "04A2…" sean la misma tira (único en todo el sistema → 409).
const nfcUid = z
  .string({ error: NFC_REQUIRED })
  .trim()
  .regex(/^[0-9A-Fa-f]{1,32}$/, NFC_REQUIRED)
  .transform((value) => value.toUpperCase());

// Metros con hasta 2 decimales: numeric(7,2) redondearía en silencio un tercero. Un entero
// nunca tiene decimales: se acepta directo, porque con enteros enormes (1e21) la cuenta en
// coma flotante no da exacta y respondería 400 en vez de 422. Los límites del piso
// (0 ≤ x ≤ width_m) son regla de dominio (422): los revisa el service.
const coordinate = (name: 'x' | 'y') => {
  const message = `${name} debe ser un número con hasta 2 decimales`;
  return z
    .number({ error: message })
    .refine((value) => Number.isInteger(value) || Math.round(value * 100) / 100 === value, message);
};

export const createPointBody = z.strictObject({
  floor_id: bodyId(FLOOR_ID),
  code,
  x: coordinate('x'),
  y: coordinate('y'),
  nfc_uid: nfcUid,
});

// PATCH: los mismos campos, opcionales; al menos uno. floor_id no se cambia (contrato
// §6.12): para mover un punto se borra y se crea de nuevo.
export const updatePointBody = z
  .strictObject({
    floor_id: z.never({ error: 'floor_id no se puede modificar' }).optional(),
    code: code.optional(),
    x: coordinate('x').optional(),
    y: coordinate('y').optional(),
    nfc_uid: nfcUid.optional(),
  })
  .refine(
    (body) => [body.code, body.x, body.y, body.nfc_uid].some((value) => value !== undefined),
    'Debe enviar al menos un campo: code, x, y o nfc_uid',
  );
