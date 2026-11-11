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
| `buildings.ts` | CRUD de edificios. Decide el **alcance de lectura** (`readScope`): `admin` y `tecnico` ven toda su organización; un `cliente`, solo sus edificios asignados (`user_buildings`, consultado en cada petición). El repositorio aplica ese alcance en la misma consulta. No existe, es de otra organización o no está asignado → el mismo `404 "Edificio no encontrado"`. Las escrituras van siempre filtradas por la organización del token |
| `floors.ts` | `GET /floors?building_id=`: si el edificio no es visible → `404 "Edificio no encontrado"`; si lo es y no tiene pisos → `[]` |
| `points.ts` | CRUD de puntos con el mismo `readScope` de edificios. Crear y editar: lee el piso (o el piso del punto) → `404` si no es visible → `422` si las coordenadas quedan fuera (`0 ≤ x ≤ width_m`, `0 ≤ y ≤ height_m`, solo las que llegan) → escribe (`409` lo da la base). El `422` gana al `409` |
| `measurements.ts` | Rutas 15 y 17. `create`, en el orden del contrato: `client_uuid` ya registrado → la medición guardada (`200`; de otra organización, `409`) → punto visible (`404`) → `measured_at` entre ahora − 30 días y ahora + 5 min (`422`) → guarda solo las lecturas cuyo `ssid` es **exacto** al de la organización (`wifiSsidOf`) → `201`. Si dos envíos iguales llegan a la vez, el que pierde el `INSERT` devuelve la ya guardada. La categoría sale de la lectura más fuerte guardada (`categoryOf`) |
| `signal-category.ts` | `THRESHOLDS` y `categoryOf(bestRssi)`: `buena` (> −65 dBm), `regular` (−65 a −70), `debil` (< −70), `sin_senal` (`null`). **Única fuente** de los umbrales: la app y la web muestran la categoría que devuelve la API |
| `auth.ts` | `login(email, password)`: normaliza el email, compara con bcrypt (siempre, también si el email no existe), elige la duración del token según el rol y responde `{ token, expires_in, user }`. El costo de bcrypt (`BCRYPT_ROUNDS`) está en `src/password.ts`, compartido con el seed |
