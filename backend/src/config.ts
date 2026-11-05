import { existsSync } from 'node:fs';
import { z } from 'zod';

// El .env vive en la raíz del repositorio. Si no existe (por ejemplo en Docker),
// las variables llegan del entorno. Las que ya están en el entorno no se pisan.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive(),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_NAME: z.string().min(1),
    DB_NAME_TEST: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
  })
  // Los tests vacían su base: nunca pueden apuntar a la de desarrollo.
  .refine((env) => env.DB_NAME_TEST !== env.DB_NAME, {
    message: 'DB_NAME_TEST debe ser distinta de DB_NAME',
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuración inválida (revisar .env contra .env.example):\n${z.prettifyError(parsed.error)}`);
}
const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    // Vitest corre con NODE_ENV=test: los tests usan su propia base.
    database: env.NODE_ENV === 'test' ? env.DB_NAME_TEST : env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
};
