import bcrypt from 'bcryptjs';
import { config } from '../config.ts';
import { AppError } from '../errors.ts';
import { BCRYPT_ROUNDS } from '../password.ts';
import * as users from '../repositories/users.ts';
import { signToken } from './token.ts';

// Si el email no existe, igual se compara contra este hash: así las dos respuestas
// 401 tardan lo mismo (~60 ms) y el tiempo no revela qué emails están registrados.
const DUMMY_HASH = bcrypt.hashSync('hash-ficticio-para-igualar-el-tiempo', BCRYPT_ROUNDS);

export async function login(email: string, password: string) {
  const normalized = email.toLowerCase();
  const at = normalized.lastIndexOf('@');
  const user = at > 0 ? await users.findByEmail(normalized.slice(0, at), normalized.slice(at + 1)) : undefined;

  const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  // Mismo mensaje si falla el email o la clave (contrato §6.2).
  if (!user || !matches) throw new AppError('unauthorized', 'Credenciales inválidas');

  const expiresIn = config.jwt.expiresIn[user.role];
  return {
    token: signToken({ id: user.id, orgId: user.org_id, role: user.role }, expiresIn),
    expires_in: expiresIn,
    user: { id: user.id, email: user.email, role: user.role },
  };
}
