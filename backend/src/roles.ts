// Roles del sistema (CHECK de users.role en db/schema.sql). Sin `enum`: Node solo
// borra tipos, y un enum genera código.
export const ROLES = ['admin', 'tecnico', 'cliente'] as const;
export type Role = (typeof ROLES)[number];
