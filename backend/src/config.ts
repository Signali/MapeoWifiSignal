import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Role } from './roles.ts';

// El .env vive en la raíz del repositorio. Si no existe (por ejemplo en Docker),
// las variables llegan del entorno. Las que ya están en el entorno no se pisan.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Valor de JWT_SECRET en .env.example: es público (está en el repo), así que con él
// cualquiera podría firmar tokens válidos. tests/config.test.ts lo mantiene sincronizado.
const EXAMPLE_JWT_SECRET = 'cambiar_por_un_secreto_largo_y_aleatorio';

// Duración del token: entero + unidad ("8h") → segundos. Con tope: un valor enorme
// daría un `exp` que el verificador rechaza (todo token sería "inválido").
const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86_400 } as const;
const MAX_TOKEN_SECONDS = 30 * 86_400;
const duration = z
  .string()
  .regex(/^[1-9]\d*[smhd]$/, 'debe ser un entero seguido de s, m, h o d (ej. 8h)')
  .transform((value) => Number(value.slice(0, -1)) * SECONDS_PER_UNIT[value.at(-1) as keyof typeof SECONDS_PER_UNIT])
  .refine((seconds) => seconds <= MAX_TOKEN_SECONDS, 'no puede superar 30 días');

// Una variable vacía (TLS_CERT_FILE=) cuenta como no definida.
const optionalPath = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : value.trim()))
  .optional();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive(),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_NAME: z.string().min(1),
    DB_NAME_TEST: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    // HS256 pide una clave de al menos 256 bits (RFC 7518 §3.2).
    JWT_SECRET: z
      .string()
      .min(32, 'debe tener al menos 32 caracteres')
      .refine((secret) => secret !== EXAMPLE_JWT_SECRET, 'no puede ser el valor de ejemplo de .env.example'),
    JWT_EXPIRES_IN_ADMIN: duration,
    JWT_EXPIRES_IN_TECNICO: duration,
    JWT_EXPIRES_IN_CLIENTE: duration,
    // HTTPS opcional: sin estas dos variables el servicio habla HTTP (ver backend/README.md).
    TLS_CERT_FILE: optionalPath,
    TLS_KEY_FILE: optionalPath,
  })
  .refine((env) => (env.TLS_CERT_FILE === undefined) === (env.TLS_KEY_FILE === undefined), {
    message: 'TLS_CERT_FILE y TLS_KEY_FILE van juntas: define las dos o ninguna',
  })
  // Los tests vacían su base: nunca pueden apuntar a la de desarrollo.
  .refine((env) => env.DB_NAME_TEST !== env.DB_NAME, {
    message: 'DB_NAME_TEST debe ser distinta de DB_NAME',
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuración inválida (revisar .env contra .env.example):\n${z.prettifyError(parsed.error)}`);
}
const env = parsed.data;

// Las rutas de los certificados son relativas a la raíz del repositorio (donde vive el .env).
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fromRoot = (path: string) => resolve(repoRoot, path);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  tls: env.TLS_CERT_FILE && env.TLS_KEY_FILE ? { certFile: fromRoot(env.TLS_CERT_FILE), keyFile: fromRoot(env.TLS_KEY_FILE) } : null,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    // Vitest corre con NODE_ENV=test: los tests usan su propia base.
    database: env.NODE_ENV === 'test' ? env.DB_NAME_TEST : env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
  jwt: {
    secret: env.JWT_SECRET,
    // En segundos, por rol: el servicio de auth elige según el rol del usuario.
    expiresIn: {
      admin: env.JWT_EXPIRES_IN_ADMIN,
      tecnico: env.JWT_EXPIRES_IN_TECNICO,
      cliente: env.JWT_EXPIRES_IN_CLIENTE,
    } satisfies Record<Role, number>,
  },
};
