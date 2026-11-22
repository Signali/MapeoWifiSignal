import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { seedEnvSchema } from '../scripts/seed.ts';

// Los valores de SEED_*_PASSWORD que trae .env.example (públicos en el repo).
const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const exampleOf = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(example)?.[1];

const valid = {
  SEED_ADMIN_PASSWORD: 'clave-propia-admin',
  SEED_TECNICO_PASSWORD: 'clave-propia-tecnico',
  SEED_CLIENTE_PASSWORD: 'clave-propia-cliente',
  SEED_WIFI_SSID: 'SignalMap Demo',
};

describe('variables del seed', () => {
  test('claves propias se aceptan', () => {
    expect(seedEnvSchema.safeParse(valid).success).toBe(true);
  });

  test.each(['SEED_ADMIN_PASSWORD', 'SEED_TECNICO_PASSWORD', 'SEED_CLIENTE_PASSWORD'])(
    '%s con el valor de .env.example se rechaza',
    (name) => {
      const value = exampleOf(name);
      expect(value).toBeTruthy();
      const result = seedEnvSchema.safeParse({ ...valid, [name]: value });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('.env.example');
    },
  );
});
