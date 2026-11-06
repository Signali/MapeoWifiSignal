import { z } from 'zod';
import { INVISIBLE_LETTERS, squish } from './common.ts';

const NAME_REQUIRED = 'name es obligatorio (1 a 100 caracteres)';
const NAME_CHARS = "name solo admite letras, números, espacios y . , - ' ( ) / #";

// Letras (con tildes y ñ), números, espacio y . , - ' ( ) / #. Deja fuera emojis,
// símbolos y caracteres de control (un \u0000 haría fallar a PostgreSQL con un 500).
const ALLOWED = /^[\p{L}\p{N} .,'()/#-]*$/u;

// Mayúscula si ocupa un solo carácter; si no ('ß' → 'SS'), la letra queda igual, así
// normalizar dos veces da lo mismo.
const upperFirst = (letter: string) => {
  const upper = letter.toUpperCase();
  return upper.length === letter.length ? upper : letter;
};
// Una palabra empieza al inicio o después de algo que no es letra, marca, número ni
// apóstrofo. Tras un apóstrofo, solo si antes hay una sola letra: O'Higgins, D'Agostino,
// pero Children's.
const WORD_START = /(?<=^|[^\p{L}\p{M}\p{N}'])\p{L}/gu;
const AFTER_ELISION = /(?<=(?:^|[^\p{L}\p{M}\p{N}'])\p{L}')\p{L}/gu;
const capitalizeWords = (name: string) => name.toLowerCase().replace(WORD_START, upperFirst).replace(AFTER_ELISION, upperFirst);

// Nombre de edificio, normalizado antes de guardarlo (contrato §4): así por la API no
// entran dos nombres que solo difieren en mayúsculas, espacios o variantes de una letra
// ("torre NORTE", "Ｔｏｒｒｅ Ｎｏｒｔｅ" → "Torre Norte" → 409).
// 1) y 2) `squish`: NFKC (tilde combinada → un carácter; ancho completo y negrita → letra
// normal), trim y espacios repetidos juntos. 3) mayúsculas (y NFKC otra vez, por si quedó una
// marca suelta: 'İ' en minúscula es 'i' + punto). 4) caracteres permitidos y largo,
// sobre lo que se guarda.
const buildingName = z
  .string({ error: NAME_REQUIRED })
  .transform(squish)
  .transform((name) => capitalizeWords(name).normalize('NFKC'))
  .pipe(
    z
      .string()
      .regex(ALLOWED, NAME_CHARS)
      .refine((name) => !INVISIBLE_LETTERS.test(name), NAME_CHARS)
      .min(1, NAME_REQUIRED)
      .max(100, NAME_REQUIRED),
  );

// POST y PATCH usan el mismo cuerpo: el edificio solo tiene `name`.
export const buildingBody = z.strictObject({ name: buildingName });
