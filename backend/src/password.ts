// Costo de bcrypt: lo usan el seed (al hashear las claves) y el login (hash ficticio
// que iguala el tiempo de respuesta). Deben coincidir para que ambos tarden lo mismo.
export const BCRYPT_ROUNDS = 10;
