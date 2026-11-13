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
| `measurements.ts` | Rutas 15 a 17. `listByFloor`: piso visible (`404`) → un elemento por cada punto del piso con su última medición válida de la fase o `null`. `create`, en el orden del contrato: `client_uuid` ya registrado → la medición guardada (`200`; de otra organización, `409`) → punto visible (`404`) → `measured_at` entre ahora − 30 días y ahora + 5 min (`422`) → guarda solo las lecturas cuyo `ssid` es **exacto** al de la organización (`wifiSsidOf`) → `201`. Si dos envíos iguales llegan a la vez, el que pierde el `INSERT` devuelve la ya guardada. La categoría sale de la lectura más fuerte guardada (`categoryOf`) |
| `signal-category.ts` | `THRESHOLDS` y `categoryOf(bestRssi)`: `buena` (> −65 dBm), `regular` (−65 a −70), `debil` (< −70), `sin_senal` (`null`). **Única fuente** de los umbrales: la app y la web muestran la categoría que devuelve la API |
| `analysis.ts` | Rutas 19 a 21: `heatmapOf`, `emittersOf` y `recommendationOf`. Piso visible (`404 "Piso no encontrado"`) → última medición válida de cada punto en la fase (`latestByFloor` + `readingsOf`) → llama a las funciones puras de abajo. Emisor de referencia de la recomendación: más `points_used`, luego menor `rmse_db`, luego menor `bssid`; siempre con la fase «antes». No guarda nada |
| `analysis-model.ts` | Modelo y constantes del análisis del piso (contrato §4): `predictRssi` (`P0 − 10·n·log10(d)`, d mínima 0,5 m), `gridOf` (celdas de 1 m, hasta 100 por lado) y `cellCenter`. Funciones puras |
| `heatmap.ts` | `buildHeatmap(floor, muestras)`: mapa de calor IDW (potencia 2, radio 8 m; un punto `sin_senal` cuenta como −100 dBm). La categoría de cada celda sale de `categoryOf` sobre el valor redondeado a 1 decimal. Función pura (la ruta 19 la usará en N3) |
| `trilateration.ts` | `fitEmitter(muestras, floor)`: posición del emisor por mínimos cuadrados, sin librerías. Con 3 puntos `n` = 3,0 (`n_fixed`); con 4 o más se ajusta entre 2,0 y 5,0; la posición queda dentro del piso. Determinista. La trilateración siempre vive en TypeScript (PostGIS no ajusta modelos) |
| `recommendation.ts` | `recommend(floor, emisor, puntos)`: ubicación del repetidor entre los centros de la grilla; válida si el emisor le da señal «buena»; gana la que más puntos no «buenos» pasa a «buena». Devuelve `reason` con los tres textos del contrato cuando no hay posición |
| `auth.ts` | `login(email, password)`: normaliza el email, compara con bcrypt (siempre, también si el email no existe), elige la duración del token según el rol y responde `{ token, expires_in, user }`. El costo de bcrypt (`BCRYPT_ROUNDS`) está en `src/password.ts`, compartido con el seed |
