// JWT HS256 propio con node:crypto, sin librería. Lo firma el login y lo verifica
// el middleware de autenticación. Cada caso de ataque tiene su test
// (tests/auth-middleware.test.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.ts';
import { AppError } from '../errors.ts';
import { ROLES, type Role } from '../roles.ts';

export type TokenUser = { id: number; orgId: number; role: Role };

// La única cabecera que emitimos y aceptamos. Comparar el segmento entero descarta
// cualquier otra (alg "none", HS512, RS256, kid, jku...) sin interpretarla.
const HEADER = toBase64url({ alg: 'HS256', typ: 'JWT' });

// sub es texto (RFC 7519 §4.1.2): el id del usuario como dígitos.
const payloadSchema = z.strictObject({
  sub: z.string().regex(/^[1-9]\d*$/),
  org_id: z.number().int().positive(),
  role: z.enum(ROLES),
  exp: z.number().int().positive(),
});

function toBase64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signature(data: string): string {
  return createHmac('sha256', config.jwt.secret).update(data).digest('base64url');
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

export function signToken(user: TokenUser, expiresInSeconds: number): string {
  const payload = toBase64url({ sub: String(user.id), org_id: user.orgId, role: user.role, exp: nowInSeconds() + expiresInSeconds });
  const data = `${HEADER}.${payload}`;
  return `${data}.${signature(data)}`;
}

// Orden: forma y cabecera → firma (en tiempo constante) → contenido → vencimiento.
// Un token vencido con la firma mala es "inválido": no se revela nada de él.
export function verifyToken(token: string): TokenUser {
  const invalid = () => new AppError('unauthorized', 'Token inválido');

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) throw invalid();
  const [header, payload, given] = parts;

  // Se comparan los textos base64url, no los bytes decodificados: el decodificador
  // de Buffer ignora caracteres sobrantes y aceptaría firmas "casi" iguales.
  const expected = Buffer.from(signature(`${header}.${payload}`));
  const received = Buffer.from(given);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalid();

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  const parsed = payloadSchema.safeParse(claims);
  if (!parsed.success) throw invalid();

  if (parsed.data.exp <= nowInSeconds()) throw new AppError('unauthorized', 'Token vencido');
  return { id: Number(parsed.data.sub), orgId: parsed.data.org_id, role: parsed.data.role };
}
