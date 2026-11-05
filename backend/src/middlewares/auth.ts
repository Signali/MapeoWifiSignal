import type { RequestHandler } from 'express';
import { AppError } from '../errors.ts';
import type { Role } from '../roles.ts';
import { type TokenUser, verifyToken } from '../services/token.ts';

// req.user existe en las rutas que pasan por authenticate.
declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenUser;
  }
}

// Exactamente "Bearer <token>"; el esquema no distingue mayúsculas (RFC 7235 §2.1).
const BEARER = /^Bearer (\S+)$/i;

// 401 si falta el token o no es válido. Va antes de requireRole y de validate
// (contrato §2: 401 → 403 → 400).
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header) throw new AppError('unauthorized', 'Token requerido');
  const match = BEARER.exec(header);
  if (!match) throw new AppError('unauthorized', 'Token inválido');
  req.user = verifyToken(match[1]);
  next();
};

// 403 si el rol del token no está entre los permitidos.
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    // Sin req.user, la ruta se armó sin authenticate: es un bug (500), no un 403.
    if (!req.user) throw new Error('requireRole se usó sin authenticate antes');
    if (!roles.includes(req.user.role)) throw new AppError('forbidden', 'No tiene permiso para esta acción');
    next();
  };
}
