# services/
Lógica de negocio. No conocen HTTP (ni `req`/`res`) ni escriben consultas SQL.

Un problema esperado se comunica lanzando un `AppError` (`src/errors.ts`) con su `kind`, nunca un código HTTP:

```ts
throw new AppError('not_found', 'Edificio no encontrado');   // el manejador responde 404
throw new AppError('domain_rule', 'Las coordenadas quedan fuera del piso (40 x 25 m)'); // 422
```

Cualquier otro error (un fallo de la base, un bug) llega al cliente como `500` genérico y su detalle queda en el log.

## Servicios actuales

| Archivo | Qué hace |
|---|---|
| `token.ts` | `signToken` / `verifyToken`: JWT HS256 con `node:crypto`. Lo usan el login (firma) y `middlewares/auth.ts` (verifica) |
| `auth.ts` | `login(email, password)`: normaliza el email, compara con bcrypt (siempre, también si el email no existe), elige la duración del token según el rol y responde `{ token, expires_in, user }`. El costo de bcrypt (`BCRYPT_ROUNDS`) está en `src/password.ts`, compartido con el seed |
