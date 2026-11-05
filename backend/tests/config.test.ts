import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { envSchema } from '../src/config.ts';

// Entorno mínimo válido: cada test cambia una sola variable.
const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'signalmap',
  DB_NAME_TEST: 'signalmap_test',
  DB_USER: 'signalmap_user',
  DB_PASSWORD: 'x',
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN_ADMIN: '8h',
  JWT_EXPIRES_IN_TECNICO: '10h',
  JWT_EXPIRES_IN_CLIENTE: '2h',
};

// El valor de JWT_SECRET que trae .env.example (público en el repo).
const exampleSecret = /^JWT_SECRET=(.*)$/m.exec(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'))?.[1];

describe('config: duración del token por rol', () => {
  test('"8h", "10h", "2h" se convierten a segundos', () => {
    const env = envSchema.parse(base);
    expect(env.JWT_EXPIRES_IN_ADMIN).toBe(28_800);
    expect(env.JWT_EXPIRES_IN_TECNICO).toBe(36_000);
    expect(env.JWT_EXPIRES_IN_CLIENTE).toBe(7_200);
  });

  test.each([
    ['30s', 30],
    ['90m', 5_400],
    ['1d', 86_400],
  ])('"%s" → %i s', (value, seconds) => {
    expect(envSchema.parse({ ...base, JWT_EXPIRES_IN_ADMIN: value }).JWT_EXPIRES_IN_ADMIN).toBe(seconds);
  });

  test('30d se acepta; 31d y 9999999999999999s se rechazan (tope de 30 días)', () => {
    expect(envSchema.safeParse({ ...base, JWT_EXPIRES_IN_ADMIN: '30d' }).success).toBe(true);
    expect(envSchema.safeParse({ ...base, JWT_EXPIRES_IN_ADMIN: '31d' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, JWT_EXPIRES_IN_ADMIN: '9999999999999999s' }).success).toBe(false);
  });

  test.each(['8', 'h', '0h', '8 h', '8H', '1.5h', '-1h', '08h', ''])('"%s" se rechaza', (value) => {
    expect(envSchema.safeParse({ ...base, JWT_EXPIRES_IN_ADMIN: value }).success).toBe(false);
  });
});

describe('config: JWT_SECRET', () => {
  test('32 caracteres se acepta', () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  test('31 caracteres se rechaza', () => {
    expect(envSchema.safeParse({ ...base, JWT_SECRET: 'a'.repeat(31) }).success).toBe(false);
  });

  test('el valor de ejemplo de .env.example se rechaza', () => {
    expect(exampleSecret).toBeTruthy();
    const result = envSchema.safeParse({ ...base, JWT_SECRET: exampleSecret });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('.env.example');
  });
});
