import type { Role } from '../roles.ts';
import { query } from './db.ts';

export type UserWithHash = { id: number; org_id: number; role: Role; email: string; password_hash: string };

// El email se guarda partido (users.email_local + email_domains.domain), en minúsculas.
export async function findByEmail(emailLocal: string, domain: string): Promise<UserWithHash | undefined> {
  const { rows } = await query<UserWithHash>(
    `SELECT u.id, u.org_id, u.role, u.email_local || '@' || d.domain AS email, u.password_hash
       FROM users u
       JOIN email_domains d ON d.id = u.email_domain_id
      WHERE u.email_local = $1 AND d.domain = $2`,
    [emailLocal, domain],
  );
  return rows[0];
}
