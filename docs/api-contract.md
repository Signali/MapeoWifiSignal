# Contrato de la API — SignalMap (Hitos 2 y 3)

> **Estado:** Hito 2 acordado y validado entre los integrantes del equipo (2026-11-04). **Hito 3** (rutas 14 a 18, recursos de medición y un caso nuevo en la ruta 13): propuesto el 2026-11-10 (con `measured_at` opcional para la cola sin conexión de la app, sumado el mismo día), unido a `main` el 2026-11-11 tras la revisión de Maximiliano; **la revisión de Gabriel sigue pendiente** (cualquier ajuste entra por un PR nuevo). **Análisis del piso** (rutas 19 a 21: mapa de calor, emisores estimados y ubicación recomendada del repetidor): acordadas las rutas con Gabriel el 2026-11-11 (PR #26, unido sin su aprobación en GitHub); el mismo día se agregó el **contorno real del piso** (`outline` y `plan_url`, §4), que **Gabriel debe revisar**.
> Versión de la API: `v1`. Toda ruta lleva el prefijo `/api/v1` (salvo `/health`).

## 1. Convenciones generales

| Tema | Regla |
|---|---|
| URL base (local) | `http://localhost:3000/api/v1` (el puerto sale de `PORT` en `.env`) |
| Formato | JSON en cuerpo y respuesta. Las peticiones con cuerpo envían `Content-Type: application/json` |
| Nombres | `snake_case` en todo: cuerpo, respuesta y parámetros de consulta (`?floor_id=`) |
| Identificadores | Enteros autoincrementales (`/buildings/1`). El cliente los trata como **opacos**: no calcula ni ordena por ellos. Así se deja abierta una migración futura a UUID, que cambiaría el tipo de `number` a `string` y por eso saldría como `v2` |
| Autenticación | Cabecera `Authorization: Bearer <token>` en todas las rutas salvo `POST /auth/login` y `GET /health` |
| Aislamiento | Toda consulta se filtra por la organización (`org_id`) del token; quien llama nunca envía `org_id`. Además, un usuario con rol `cliente` solo ve los **edificios que tiene asignados** (y sus pisos y puntos) |
| Actualizar | Solo `PATCH` (parcial). No hay `PUT` |
| Crear | `201 Created` + cabecera `Location` con la URL del recurso + el objeto creado |
| Borrar | `204 No Content`, sin cuerpo |
| Listas | Arreglo JSON simple, ordenado por `id` ascendente. Sin paginación (volumen bajo: ~24 puntos por piso) |
| Campos desconocidos | Un campo que la ruta no acepta → `400` |

## 2. Errores

Todo error responde con el código HTTP que corresponde y este cuerpo:

```json
{ "message": "Descripción clara del problema" }
```

**Nunca se responde `200` con un error.**

| Código | Cuándo |
|---|---|
| `400 Bad Request` | Formato inválido: JSON mal formado, campo faltante, tipo incorrecto, campo desconocido, cuerpo de `PATCH` vacío, `id` de la ruta que no es entero |
| `401 Unauthorized` | Sin token, token inválido o vencido · login con credenciales incorrectas |
| `403 Forbidden` | El rol del token no tiene permiso para la acción |
| `404 Not Found` | El recurso no existe, **pertenece a otra organización** o, para un `cliente`, **está en un edificio que no tiene asignado** (en ningún caso se revela que existe) |
| `409 Conflict` | Duplicado (`nfc_uid`, `code` en el piso, `name` del edificio en la organización) · borrar un edificio que tiene pisos · borrar un punto que tiene mediciones · `client_uuid` ya usado en otra organización · anular una medición ya anulada |
| `413 Content Too Large` | Cuerpo de la petición mayor a 100 kB |
| `415 Unsupported Media Type` | Charset o codificación del cuerpo no soportados (ej. `charset=latin1`) |
| `422 Unprocessable Content` | Formato correcto, pero viola una regla de dominio: coordenadas fuera del piso · fecha de medición fuera de rango |
| `500 Internal Server Error` | Error inesperado. Mensaje genérico, sin detalles internos |

**Orden de verificación:** `401` → `403` → `400` → `404` → `422` → `409`. Ejemplo: un cliente que intenta crear un punto con el cuerpo mal formado recibe `403`, no `400`. Un punto fuera del piso **y** con `code` repetido recibe `422`: las coordenadas se validan antes de escribir. En `POST /measurements`, un `client_uuid` ya registrado se resuelve después del `400` y antes del `404` (§6.15): un reenvío desde la cola de la app recibe la medición guardada aunque su fecha ya haya salido del rango.

## 3. Roles y permisos

| Acción | `admin` | `tecnico` | `cliente` |
|---|:-:|:-:|:-:|
| Leer edificios, pisos y puntos | ✅ todos los de la org | ✅ todos los de la org | ✅ **solo sus edificios asignados** (otros → `404`) |
| Crear, editar y borrar edificios | ✅ | ❌ `403` | ❌ `403` |
| Crear y editar puntos | ✅ | ✅ | ❌ `403` |
| Borrar puntos | ✅ | ❌ `403` | ❌ `403` |
| Resolver una tira NFC y ver mediciones | ✅ todos los de la org | ✅ todos los de la org | ✅ **solo sus edificios asignados** (otros → `404`) |
| Registrar mediciones | ✅ | ✅ | ❌ `403` |
| Anular mediciones | ✅ | ❌ `403` | ❌ `403` |
| Ver el mapa de calor, los emisores estimados y la ubicación recomendada | ✅ todos los de la org | ✅ todos los de la org | ✅ **solo sus edificios asignados** (otros → `404`) |

- Los usuarios no se crean por la API: vienen del script de datos de prueba (solo desarrollo y demo).
- Un `cliente` puede tener **uno o más edificios asignados** (tabla de asignaciones usuario–edificio). Las asignaciones también vienen de los datos de prueba; no hay endpoint para gestionarlas en este hito.
- La lista de edificios asignados **no va en el token**: el servicio la consulta en cada petición, así que un cambio de asignación aplica de inmediato.
- Un `cliente` sin edificios asignados recibe listas vacías (`200 []`).

## 4. Recursos

### Edificio (`building`)
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo asigna el servidor |
| `name` | texto | Obligatorio al crear · 1 a 100 caracteres · solo letras (con tildes y `ñ`), números, espacios y `. , - ' ( ) / #` → si no, `400` · el servidor lo **normaliza** antes de guardarlo (ver abajo) · único dentro de la organización → `409` |

**Normalización del nombre** (al crear y al editar), en este orden: forma Unicode NFKC (una tilde combinada pasa a ser un solo carácter; letras de ancho completo o de estilo matemático y espacios especiales pasan a su forma normal) · sin espacios al borde y espacios repetidos juntos · mayúscula la primera letra de cada palabra y el resto en minúscula (una palabra empieza al inicio o después de un espacio o un signo; después de un apóstrofo, solo si antes hay una sola letra) · los caracteres permitidos y el largo se revisan sobre el resultado. Los rellenos invisibles de Hangul (U+115F, U+1160, U+3164, U+FFA0) no se admiten. Ejemplos: `"  torre   NORTE "` y `"Ｔｏｒｒｅ Ｎｏｒｔｅ"` → `"Torre Norte"` (choca con la existente → `409`) · `"edificio o'higgins"` → `"Edificio O'Higgins"` · `"children's"` → `"Children's"` · `"3er piso-anexo"` → `"3er Piso-Anexo"` · las siglas no se conservan: `"Sede TI"` → `"Sede Ti"`. Normalizar dos veces da lo mismo, así que el nombre que devuelve la API siempre se puede volver a enviar. Por la API no entran dos nombres que solo difieren en mayúsculas, espacios o variantes de una letra.

### Piso (`floor`) — solo lectura
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | — |
| `building_id` | entero | Edificio al que pertenece |
| `name` | texto | Ej. `"Piso 3"` · único dentro del edificio (lo garantiza la base) |
| `width_m` | número | Ancho del piso en metros (> 0) |
| `height_m` | número | Largo del piso en metros (> 0) |
| `outline` | arreglo | **Contorno real del edificio**: vértices `{ "x": 0, "y": 0 }` en metros, con el mismo origen que los puntos (esquina superior izquierda, `y` hacia abajo), en orden alrededor del contorno, 3 o más, dentro de `[0, width_m] × [0, height_m]`. Un edificio con forma de L, con patios o con esquinas cortadas se describe aquí. **Siempre viene**: si el piso no tiene un contorno cargado, es el rectángulo completo (`(0,0)`, `(width_m,0)`, `(width_m,height_m)`, `(0,height_m)`) |
| `plan_url` | texto o `null` | Imagen del plano (por ejemplo `"/plans/torre-norte-p3.svg"`), en la misma URL de la web. Debe empezar con `/plans/` (solo letras, números, `.`, `_` y `-` después) y cubre el rectángulo `width_m × height_m`, con esa proporción. `null` = el piso no tiene imagen: la web dibuja solo el contorno |

Los pisos se cargan con los datos de prueba; no tienen creación, edición ni borrado en este hito. **Los puntos se validan contra el rectángulo** (`0 ≤ x ≤ width_m`, `0 ≤ y ≤ height_m`), no contra el contorno: una tira fuera del contorno pero dentro del rectángulo se acepta. Los cálculos de §4 «Análisis del piso» sí usan el contorno.

### Punto de medición (`point`)
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo asigna el servidor |
| `floor_id` | entero | Obligatorio al crear · el piso debe existir en la organización → si no, `404` · **no se puede cambiar** con `PATCH` → `400` |
| `code` | texto | Obligatorio al crear · 1 a 20 caracteres (ej. `"P-07"`) · solo letras, números, espacios y `- _ . /` → si no, `400` · el servidor lo **normaliza**: forma Unicode NFKC, sin espacios al borde, espacios repetidos juntos y **en mayúsculas** (`" p-07 "` y `"Ｐ－０７"` → `"P-07"`; los caracteres permitidos y el largo se revisan sobre el resultado) · único dentro del piso → `409` |
| `x` | número | Obligatorio al crear · metros desde el borde izquierdo del plano · máximo 2 decimales (centímetros) → si no, `400` · `0 ≤ x ≤ width_m` del piso → si no, `422` |
| `y` | número | Obligatorio al crear · metros desde el borde superior del plano · máximo 2 decimales (centímetros) → si no, `400` · `0 ≤ y ≤ height_m` del piso → si no, `422` |
| `nfc_uid` | texto | Obligatorio al crear · identificador de la tira NFC en **hexadecimal** (`0-9`, `A-F`), 1 a 32 caracteres, sin separadores (`04A23B1C5D8080`, no `04:A2:3B…`) → si no, `400` · sin espacios al borde · el servidor lo guarda y lo devuelve **en mayúsculas** (`04a2…` y `04A2…` son la misma tira) · único en todo el sistema → `409` |

Coordenadas 2D por piso (sin altura). Un valor no numérico en `x`/`y`, o con más de 2 decimales (`12.345`), es `400` (formato); un número fuera del piso es `422` (regla de dominio).

### Red de la organización
Cada organización tiene **un SSID** (`wifi_ssid`, 1 a 32 caracteres): el nombre de su red WiFi. Lo carga `npm run seed` desde la variable `SEED_WIFI_SSID` del `.env`; no hay ruta para leerlo ni cambiarlo. Define qué lecturas se guardan y cuál da el color de un punto. Un repetidor que extiende la red usa el mismo SSID con otro BSSID.

### Medición (`measurement`)
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo asigna el servidor |
| `point_id` | entero | Obligatorio · el punto debe existir en la organización (y, para `cliente`, en un edificio asignado) → si no, `404` |
| `phase` | texto | Obligatorio · `"antes"` o `"despues"` (sin tilde) → si no, `400` |
| `client_uuid` | texto | Obligatorio · UUID (`8-4-4-4-12` hexadecimal) generado por la app; el servidor lo guarda en minúsculas · único en todo el sistema: reenviar el mismo **no duplica** (§6.15) |
| `readings` | arreglo | Obligatorio al crear · 1 a 100 lecturas → si no, `400` · se validan **todas**, pero el servidor **guarda solo las del SSID de la organización** (comparación exacta, distingue mayúsculas): las de otras redes se descartan sin error (minimización de datos) |
| `measured_at` | fecha ISO 8601 | **Opcional** al crear: el momento en que el teléfono hizo el escaneo, con zona horaria (`2026-11-12T12:04:05-03:00` o `…Z`) → si no, `400` · entre los últimos 30 días y 5 minutos en el futuro (margen por relojes desfasados) → si no, `422` · sin él, el servidor usa la hora en que la recibe. La respuesta la devuelve siempre en UTC (`…Z`). Existe porque la app guarda las mediciones tomadas **sin conexión** y las envía cuando vuelve la red: la fecha debe ser la del escaneo, no la del envío. La hora de recepción también se guarda (trazabilidad), pero la API no la devuelve |
| `category` | texto | La calcula el servidor con la lectura más fuerte guardada: `"buena"` (> −65 dBm) · `"regular"` (−65 a −70 dBm, ambos incluidos) · `"debil"` (< −70 dBm) · `"sin_senal"` (no se captó la red de la organización) |
| `best_rssi_dbm` | entero o `null` | La lectura más fuerte guardada; `null` si `sin_senal` |
| `voided` | objeto o `null` | `null` si la medición vale; si fue anulada: `{ "reason": "...", "at": "<fecha>" }` (quién la anuló se guarda, pero la API no lo devuelve) |

Quién midió (`user_id`) se guarda para trazabilidad, pero la API no lo devuelve.

### Lectura (`reading`), dentro de `readings`
| Campo | Tipo | Reglas |
|---|---|---|
| `bssid` | texto | Obligatorio · `aa:bb:cc:dd:ee:ff` (6 pares hexadecimales separados por `:`; acepta mayúsculas, el servidor lo guarda en minúsculas) · no se repite dentro de una medición → si no, `400` |
| `ssid` | texto | Obligatorio · 0 a 32 caracteres (vacío = red oculta) |
| `rssi_dbm` | entero | Obligatorio · −120 a 0 |
| `frequency_mhz` | entero | Obligatorio · 2400 a 7125 (bandas de 2,4, 5 y 6 GHz) |

**Anulación.** Una medición mal hecha no se borra: el `admin` la **anula** con un motivo de esta lista cerrada:
- `punto_equivocado`: se leyó la tira de otro punto o el técnico no estaba junto a ella;
- `fase_equivocada`: se envió como «antes» siendo «después», o al revés (se anula y se mide de nuevo en la fase correcta);
- `condiciones_anomalas`: el router o el repetidor estaba reiniciándose o apagado, o había una interferencia fuera de lo normal.

Una medición anulada deja de contar: en el plano vuelve a verse la anterior válida de ese punto y fase. No se puede «des-anular». Una medición tomada en las condiciones normales del lugar, aunque dé señal débil, **no** está mal hecha: es el dato.

### Análisis del piso (mapa de calor, emisores y recomendación)
Las rutas 19 a 21 **calculan** a partir de las mediciones; no guardan nada. Para cada punto del piso usan su **última medición válida** (no anulada) de la fase, igual que la ruta 16. Los cálculos son **deterministas**: los mismos datos dan siempre el mismo resultado. Las constantes son fijas y no se envían en la petición:

| Constante | Valor | Para qué |
|---|---|---|
| Lado de celda (`cell_m`) | 1 m. Si el lado mayor del piso supera 100 m, `ceil(lado_mayor / 100)` m | Grilla del mapa de calor y posiciones candidatas del repetidor. Limita la respuesta a unas 10 000 celdas |
| Potencia del IDW | 2 | Cada muestra pesa `1 / d²` |
| Radio máximo | 8 m | Solo cuentan las muestras a esa distancia o menos del centro de la celda |
| RSSI de un punto `sin_senal` | −100 dBm | Valor que se usa como muestra de ese punto (no se captó la red: es información de cobertura, no un vacío) |
| Distancia mínima del modelo | 0,5 m | Una distancia menor se toma como 0,5 m (evita `log10(0)`) |
| Exponente `n` | 3,0 fijo con 3 puntos; con 4 o más puntos se ajusta entre 2,0 y 5,0 | Ver la ruta 20 |
| Mínimo de puntos por emisor | 3 | Ver la ruta 20 |

**Mapa de calor (IDW, distancia inversa ponderada).** El valor de una celda es `Σ(vᵢ / dᵢ²) / Σ(1 / dᵢ²)` sobre las muestras a ≤ 8 m del centro de la celda, con `vᵢ` el `best_rssi_dbm` de cada punto (o −100 dBm si es `sin_senal`) y `dᵢ` la distancia en metros. Si una muestra está a menos de 1 cm del centro, su valor se toma tal cual. Una celda sin ninguna muestra a ≤ 8 m queda **sin datos** (`null`). El valor se redondea a 1 decimal y la categoría se calcula con esos umbrales (los mismos de la medición, aplicados al valor redondeado): `"buena"` (> −65), `"regular"` (−65 a −70, ambos incluidos), `"debil"` (< −70). Una celda interpolada **nunca** es `"sin_senal"`.

**Emisor (trilateración).** La posición del teléfono se conoce por la tira NFC; lo desconocido es la posición del emisor. Con el modelo `RSSI(d) = P0 − 10·n·log10(d)` (`P0`: señal a 1 m; `n`: exponente de pérdida) se ajustan por mínimos cuadrados la posición `(x, y)` del emisor, `P0` y, con 4 o más puntos, `n`. Con 3 puntos hay más incógnitas que ecuaciones, así que `n` se fija en 3,0. La posición se limita al **contorno** del piso (`outline`; el rectángulo, si no tiene uno propio): si el emisor real está fuera, la estimación queda en el punto del contorno que mejor ajusta.

**Ubicación recomendada del repetidor.** Se prueban como candidatas los centros de la grilla **que caen dentro del contorno del piso** (el repetidor se instala dentro del edificio). Una candidata solo es válida si el modelo (con el `P0` y el `n` del emisor de referencia) predice, desde el emisor, señal `"buena"` en ese lugar: así el repetidor se alimenta bien. Entre las válidas se elige la que **más puntos mejora**: de los puntos medidos en «antes» cuya categoría **no** es `"buena"`, cuenta cuántos pasarían a `"buena"` con el repetidor (misma potencia y mismo entorno que el emisor). En empate gana la candidata con mayor señal predicha desde el emisor; luego la de menor `y`; luego la de menor `x`.

**Límites del modelo (por eso el resultado es una estimación).** No ve paredes ni pisos distintos; supone un repetidor con la misma potencia (`P0`) y el mismo exponente (`n`) que el emisor; con puntos en línea recta hay dos posiciones simétricas igual de buenas y el resultado no distingue cuál es la real; la precisión depende de cuántos puntos se midieron y de cuánto ruido hay en las lecturas (el error medido en el piso real se informa en el documento final, no aquí). Toda respuesta de las rutas 20 y 21 se presenta como **estimada**.

## 5. Tabla de endpoints

| # | Verbo | Ruta | Roles | Parámetros | Éxito | Errores |
|---|---|---|---|---|---|---|
| 1 | `GET` | `/health` | público | — | `200` | — |
| 2 | `POST` | `/api/v1/auth/login` | público | cuerpo: `email`, `password` | `200` | `400` · `401` |
| 3 | `GET` | `/api/v1/buildings` | todos | — | `200` | `400` · `401` |
| 4 | `GET` | `/api/v1/buildings/:id` | todos | ruta: `id` | `200` | `400` · `401` · `404` |
| 5 | `POST` | `/api/v1/buildings` | `admin` | cuerpo: `name` | `201` + `Location` | `400` · `401` · `403` · `409` |
| 6 | `PATCH` | `/api/v1/buildings/:id` | `admin` | ruta: `id` · cuerpo: `name` | `200` | `400` · `401` · `403` · `404` · `409` |
| 7 | `DELETE` | `/api/v1/buildings/:id` | `admin` | ruta: `id` | `204` | `400` · `401` · `403` · `404` · `409` |
| 8 | `GET` | `/api/v1/floors` | todos | consulta: `building_id` (obligatorio) | `200` | `400` · `401` · `404` |
| 9 | `GET` | `/api/v1/points` | todos | consulta: `floor_id` (obligatorio) | `200` | `400` · `401` · `404` |
| 10 | `GET` | `/api/v1/points/:id` | todos | ruta: `id` | `200` | `400` · `401` · `404` |
| 11 | `POST` | `/api/v1/points` | `admin`, `tecnico` | cuerpo: `floor_id`, `code`, `x`, `y`, `nfc_uid` | `201` + `Location` | `400` · `401` · `403` · `404` · `409` · `422` |
| 12 | `PATCH` | `/api/v1/points/:id` | `admin`, `tecnico` | ruta: `id` · cuerpo: `code`, `x`, `y`, `nfc_uid` (al menos uno) | `200` | `400` · `401` · `403` · `404` · `409` · `422` |
| 13 | `DELETE` | `/api/v1/points/:id` | `admin` | ruta: `id` | `204` | `400` · `401` · `403` · `404` · `409` |
| 14 | `GET` | `/api/v1/points/by-tag/:nfc_uid` | todos | ruta: `nfc_uid` | `200` | `400` · `401` · `404` |
| 15 | `POST` | `/api/v1/measurements` | `admin`, `tecnico` | cuerpo: `point_id`, `phase`, `client_uuid`, `readings`, `measured_at` (opcional) | `201` + `Location` (o `200` si el `client_uuid` ya existe) | `400` · `401` · `403` · `404` · `409` · `422` |
| 16 | `GET` | `/api/v1/measurements` | todos | consulta: `floor_id`, `phase` (obligatorios) | `200` | `400` · `401` · `404` |
| 17 | `GET` | `/api/v1/measurements/:id` | todos | ruta: `id` | `200` | `400` · `401` · `404` |
| 18 | `DELETE` | `/api/v1/measurements/:id` | `admin` | ruta: `id` · consulta: `reason` (obligatorio) | `204` | `400` · `401` · `403` · `404` · `409` |
| 19 | `GET` | `/api/v1/heatmap` | todos | consulta: `floor_id`, `phase` (obligatorios) | `200` | `400` · `401` · `404` |
| 20 | `GET` | `/api/v1/emitters` | todos | consulta: `floor_id`, `phase` (obligatorios) | `200` | `400` · `401` · `404` |
| 21 | `GET` | `/api/v1/recommendation` | todos | consulta: `floor_id` (obligatorio) | `200` | `400` · `401` · `404` |

## 6. Detalle y ejemplos

### 1. `GET /health`
Comprueba que el servicio está arriba. No requiere token.

```json
200 OK
{ "status": "ok" }
```

### 2. `POST /api/v1/auth/login`
```json
// Petición
{ "email": "admin@demo.cl", "password": "<clave del .env>" }

// 200 OK
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 28800,
  "user": { "id": 1, "email": "admin@demo.cl", "role": "admin" }
}
```
- `expires_in` en segundos; depende del rol (admin 8 h, técnico 10 h, cliente 2 h, configurable en `.env`).
- El token lleva `sub` (id del usuario, como texto: `"1"`, según RFC 7519), `org_id`, `role` y `exp`. No hay renovación: al vencer, `401` y nuevo login.
- El email no distingue mayúsculas ni espacios al borde (`" Admin@Demo.cl"` = `admin@demo.cl`).

| Caso | Respuesta |
|---|---|
| Falta `email` o `password`, o no son texto | `400 { "message": "email y password son obligatorios" }` |
| Email inexistente **o** clave incorrecta | `401 { "message": "Credenciales inválidas" }` (el mismo mensaje en ambos casos) |

### 3. `GET /api/v1/buildings`
```json
200 OK
[
  { "id": 1, "name": "Torre Norte" },
  { "id": 2, "name": "Oficinas Centro" }
]
```
`admin` y `tecnico` reciben todos los edificios de su organización; `cliente`, solo los que tiene asignados. Sin edificios → `200 []`. No recibe parámetros de consulta: uno desconocido (`?x=1`) → `400`.

### 4. `GET /api/v1/buildings/:id`
```json
200 OK
{ "id": 1, "name": "Torre Norte" }
```
| Caso | Respuesta |
|---|---|
| `id` no es entero (`/buildings/abc`) | `400 { "message": "El id debe ser un número entero" }` |
| No existe, es de otra organización o (para `cliente`) no lo tiene asignado | `404 { "message": "Edificio no encontrado" }` |

### 5. `POST /api/v1/buildings`
```json
// Petición
{ "name": "  bodega   sur " }

// 201 Created
// Location: /api/v1/buildings/3
{ "id": 3, "name": "Bodega Sur" }
```
| Caso | Respuesta |
|---|---|
| Falta `name`, no es texto, vacío o > 100 caracteres | `400 { "message": "name es obligatorio (1 a 100 caracteres)" }` |
| `name` con caracteres no permitidos (emojis, símbolos, saltos de línea…) | `400 { "message": "name solo admite letras, números, espacios y . , - ' ( ) / #" }` |
| Parámetro de consulta o campo desconocido | `400` |
| Rol `tecnico` o `cliente` | `403 { "message": "No tiene permiso para esta acción" }` |
| Ya existe un edificio con ese nombre en la organización | `409 { "message": "Ya existe un edificio con ese nombre" }` |

### 6. `PATCH /api/v1/buildings/:id`
```json
// Petición
{ "name": "Torre Norte (remodelada)" }

// 200 OK (nombre normalizado, §4)
{ "id": 1, "name": "Torre Norte (Remodelada)" }
```
| Caso | Respuesta |
|---|---|
| Cuerpo vacío, campo desconocido, `name` inválido (mismas reglas que al crear) o `id` no entero | `400` |
| Rol distinto de `admin` | `403` |
| No existe o es de otra organización | `404` |
| El nombre nuevo ya lo usa otro edificio de la organización | `409` |

### 7. `DELETE /api/v1/buildings/:id`
```
204 No Content
```
| Caso | Respuesta |
|---|---|
| Rol distinto de `admin` | `403` |
| No existe o es de otra organización | `404` |
| El edificio tiene pisos (no hay borrado en cascada) | `409 { "message": "No se puede borrar: el edificio tiene pisos asociados" }` |

> Como los pisos solo se cargan con los datos de prueba, un edificio creado por la API (sin pisos) se puede borrar (`204`); uno de los datos de prueba responde `409`.

### 8. `GET /api/v1/floors?building_id=1`
```json
200 OK
[
  { "id": 1, "building_id": 1, "name": "Piso 3", "width_m": 40.0, "height_m": 25.0,
    "outline": [ { "x": 0, "y": 0 }, { "x": 40, "y": 0 }, { "x": 40, "y": 25 }, { "x": 0, "y": 25 } ],
    "plan_url": null }
]
```
| Caso | Respuesta |
|---|---|
| Falta `building_id` o no es entero | `400 { "message": "building_id es obligatorio y debe ser entero" }` |
| El edificio no existe, es de otra organización o (para `cliente`) no lo tiene asignado | `404 { "message": "Edificio no encontrado" }` |

### 9. `GET /api/v1/points?floor_id=1`
```json
200 OK
[
  { "id": 7, "floor_id": 1, "code": "P-07", "x": 12.5, "y": 8.0, "nfc_uid": "04A23B1C5D8080" }
]
```
| Caso | Respuesta |
|---|---|
| Falta `floor_id` o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| El piso no existe, es de otra organización o (para `cliente`) es de un edificio no asignado | `404 { "message": "Piso no encontrado" }` |

### 10. `GET /api/v1/points/:id`
```json
200 OK
{ "id": 7, "floor_id": 1, "code": "P-07", "x": 12.5, "y": 8.0, "nfc_uid": "04A23B1C5D8080" }
```
| Caso | Respuesta |
|---|---|
| `id` no es entero | `400` |
| No existe, es de otra organización o (para `cliente`) es de un edificio no asignado | `404 { "message": "Punto no encontrado" }` |

### 11. `POST /api/v1/points`
```json
// Petición
{ "floor_id": 1, "code": "P-25", "x": 30.0, "y": 12.5, "nfc_uid": "04B11C22D3E480" }

// 201 Created
// Location: /api/v1/points/25
{ "id": 25, "floor_id": 1, "code": "P-25", "x": 30.0, "y": 12.5, "nfc_uid": "04B11C22D3E480" }
```
| Caso | Respuesta |
|---|---|
| Falta un campo, tipo incorrecto (`"x": "doce"`) o campo desconocido | `400` |
| `floor_id` falta o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| `code` falta, vacío o > 20 caracteres | `400 { "message": "code es obligatorio (1 a 20 caracteres)" }` |
| `code` con caracteres no permitidos | `400 { "message": "code solo admite letras, números, espacios y - _ . /" }` |
| `x` (o `y`) no es número o tiene más de 2 decimales | `400 { "message": "x debe ser un número con hasta 2 decimales" }` |
| `nfc_uid` falta, vacío, > 32 caracteres o no es hexadecimal | `400 { "message": "nfc_uid es obligatorio (1 a 32 caracteres hexadecimales)" }` |
| Rol `cliente` | `403` |
| El piso no existe o es de otra organización | `404 { "message": "Piso no encontrado" }` |
| `nfc_uid` ya registrado (en cualquier organización) | `409 { "message": "La tira NFC ya está asociada a otro punto" }` |
| `code` ya existe en ese piso | `409 { "message": "Ya existe un punto con ese código en el piso" }` |
| `x` o `y` fuera de las dimensiones del piso (ej. `x = 45` en un piso de 40 m, o negativo) | `422 { "message": "Las coordenadas quedan fuera del piso (40 x 25 m)" }` (también si además hay un duplicado) |

### 12. `PATCH /api/v1/points/:id`
```json
// Petición
{ "x": 13.0, "y": 8.5 }

// 200 OK
{ "id": 7, "floor_id": 1, "code": "P-07", "x": 13.0, "y": 8.5, "nfc_uid": "04A23B1C5D8080" }
```
| Caso | Respuesta |
|---|---|
| Cuerpo vacío | `400 { "message": "Debe enviar al menos un campo: code, x, y o nfc_uid" }` |
| Incluye `floor_id` (aunque sea el mismo) | `400 { "message": "floor_id no se puede modificar" }` |
| Campo desconocido o campo inválido (mismas reglas que al crear) | `400` |
| Rol `cliente` | `403` |
| No existe o es de otra organización | `404 { "message": "Punto no encontrado" }` |
| `nfc_uid` o `code` nuevos chocan con otro punto | `409` (mensajes de §6.11) |
| Coordenadas nuevas fuera del piso | `422` (con las medidas del piso del punto) |

> Para mover un punto a otro piso: borrarlo (`admin`) y crearlo de nuevo.

### 13. `DELETE /api/v1/points/:id`
```
204 No Content
```
| Caso | Respuesta |
|---|---|
| Rol `tecnico` o `cliente` | `403` |
| No existe o es de otra organización | `404` |
| El punto tiene mediciones (aunque estén anuladas) | `409 { "message": "El punto tiene mediciones y no se puede borrar" }` |

### 14. `GET /api/v1/points/by-tag/:nfc_uid`
La usa la app al acercar el teléfono a una tira. El `nfc_uid` se acepta en minúsculas o mayúsculas (sin separadores).
```json
200 OK
{ "id": 7, "floor_id": 1, "code": "P-07", "x": 12.5, "y": 8.0, "nfc_uid": "04A23B1C5D8080",
  "floor": { "id": 1, "name": "Piso 3" }, "building": { "id": 1, "name": "Torre Norte" } }
```
| Caso | Respuesta |
|---|---|
| `nfc_uid` con más de 32 caracteres o no hexadecimal | `400 { "message": "nfc_uid debe tener de 1 a 32 caracteres hexadecimales" }` (sin UID, `/points/by-tag/` no llega a esta ruta: responde como `/points/:id`, `400 "El id debe ser un número entero"`) |
| Ningún punto tiene esa tira, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Tira NFC no registrada" }` |

### 15. `POST /api/v1/measurements`
```json
// Petición (la app manda todo lo que captó)
{ "point_id": 7, "phase": "antes", "client_uuid": "3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f809a1b",
  "measured_at": "2026-11-12T12:04:05-03:00",
  "readings": [
    { "bssid": "a4:2b:b0:11:22:33", "ssid": "Inmobiliaria Norte", "rssi_dbm": -74, "frequency_mhz": 5180 },
    { "bssid": "a4:2b:b0:11:22:34", "ssid": "Inmobiliaria Norte", "rssi_dbm": -79, "frequency_mhz": 2437 },
    { "bssid": "10:fe:ed:aa:bb:cc", "ssid": "Vecino 5G", "rssi_dbm": -60, "frequency_mhz": 5240 }
  ] }

// 201 Created
// Location: /api/v1/measurements/31
{ "id": 31, "point_id": 7, "phase": "antes", "measured_at": "2026-11-12T15:04:05.000Z",
  "category": "debil", "best_rssi_dbm": -74, "voided": null,
  "readings": [
    { "bssid": "a4:2b:b0:11:22:33", "ssid": "Inmobiliaria Norte", "rssi_dbm": -74, "frequency_mhz": 5180 },
    { "bssid": "a4:2b:b0:11:22:34", "ssid": "Inmobiliaria Norte", "rssi_dbm": -79, "frequency_mhz": 2437 }
  ] }
```
(La red «Vecino 5G» se validó y se descartó: no es la de la organización.) `readings` de la respuesta va ordenado de la señal más fuerte a la más débil. `measured_at` vuelve en UTC (`12:04:05-03:00` = `15:04:05Z`).

**Sin conexión.** Si el envío falla por falta de red, la app guarda la medición en el teléfono (con su `client_uuid` y su `measured_at`) y la envía cuando vuelve la conexión, mientras la app está abierta. Si el primer envío sí llegó y solo se perdió la respuesta, el reenvío recibe `200` y no se duplica.

| Caso | Respuesta |
|---|---|
| Falta un campo, tipo incorrecto o campo desconocido (en la medición o en una lectura) | `400` |
| `point_id` falta o no es entero | `400 { "message": "point_id es obligatorio y debe ser entero" }` |
| `phase` falta o no es `antes`/`despues` | `400 { "message": "phase debe ser antes o despues" }` |
| `client_uuid` falta o no es un UUID | `400 { "message": "client_uuid es obligatorio y debe ser un UUID" }` |
| `readings` falta, vacío o con más de 100 lecturas | `400 { "message": "readings debe tener entre 1 y 100 lecturas" }` |
| `bssid` con otro formato | `400 { "message": "bssid debe tener el formato aa:bb:cc:dd:ee:ff" }` |
| `ssid` con más de 32 caracteres | `400 { "message": "ssid debe tener hasta 32 caracteres" }` |
| `rssi_dbm` no entero o fuera de rango | `400 { "message": "rssi_dbm debe ser un entero entre -120 y 0" }` |
| `frequency_mhz` no entero o fuera de rango | `400 { "message": "frequency_mhz debe ser un entero entre 2400 y 7125" }` |
| Un `bssid` repetido en la misma medición | `400 { "message": "Hay un bssid repetido en readings" }` |
| `measured_at` no es texto o no es una fecha ISO 8601 con zona horaria | `400 { "message": "measured_at debe ser una fecha ISO 8601 con zona horaria" }` |
| `measured_at` con más de 30 días o más de 5 minutos en el futuro | `422 { "message": "measured_at debe estar entre los últimos 30 días y ahora" }` |
| Rol `cliente` | `403` |
| El `client_uuid` ya se registró en la organización | `200` con la medición que ya estaba guardada (**no se crea otra**; el servidor no compara el cuerpo) |
| El `client_uuid` ya se usó en otra organización | `409 { "message": "client_uuid ya fue usado" }` |
| El punto no existe o es de otra organización | `404 { "message": "Punto no encontrado" }` |
| Ninguna lectura es de la red de la organización | **No es error**: `201` con `readings: []`, `category: "sin_senal"` y `best_rssi_dbm: null` |

### 16. `GET /api/v1/measurements?floor_id=1&phase=antes`
Para pintar el plano: un elemento por **cada punto del piso**, ordenado por `point_id`, con su **última medición válida** (no anulada) en esa fase, o `null` si no tiene.
```json
200 OK
[
  { "point_id": 7, "measurement": { "id": 31, "point_id": 7, "phase": "antes", "measured_at": "2026-11-12T15:04:05.000Z",
      "category": "debil", "best_rssi_dbm": -74, "voided": null, "readings": [ … ] } },
  { "point_id": 8, "measurement": null }
]
```
«Última» = la de `measured_at` más reciente (a igual fecha, la de mayor `id`).

| Caso | Respuesta |
|---|---|
| Falta `floor_id` o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| Falta `phase` o no es `antes`/`despues` | `400 { "message": "phase debe ser antes o despues" }` |
| Parámetro de consulta desconocido | `400` |
| El piso no existe, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Piso no encontrado" }` |

### 17. `GET /api/v1/measurements/:id`
Devuelve la medición con el mismo formato de §6.15, **también si está anulada** (con `voided` completo).
| Caso | Respuesta |
|---|---|
| `id` no es entero | `400` |
| No existe, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Medición no encontrada" }` |

### 18. `DELETE /api/v1/measurements/:id?reason=punto_equivocado`
Anula la medición (no la borra).
```
204 No Content
```
| Caso | Respuesta |
|---|---|
| Rol `tecnico` o `cliente` | `403` |
| `id` no es entero | `400` |
| Falta `reason` o no es un motivo de la lista | `400 { "message": "reason es obligatorio: punto_equivocado, fase_equivocada o condiciones_anomalas" }` |
| No existe o es de otra organización | `404 { "message": "Medición no encontrada" }` |
| Ya estaba anulada | `409 { "message": "La medición ya está anulada" }` |

### 19. `GET /api/v1/heatmap?floor_id=1&phase=antes`
Mapa de calor del piso en esa fase (IDW, ver «Análisis del piso» en §4). Devuelve **todas** las celdas de la grilla cuyo centro cae dentro del **contorno** del piso (`outline`), ordenadas por fila (`y` ascendente) y, dentro de la fila, por `x` ascendente. En un edificio que no es un rectángulo, las celdas de afuera no se devuelven: `cols` y `rows` describen la grilla del rectángulo completo, y la cantidad de celdas puede ser menor que `cols × rows`. El ejemplo es el Piso 3 (40 × 25 m, sin contorno propio, es decir rectángulo) con 3 puntos medidos; `cells` se acorta aquí, pero la respuesta real trae las 1 000 celdas (40 × 25).
```json
200 OK
{
  "floor_id": 1, "phase": "antes",
  "cell_m": 1, "cols": 40, "rows": 25,
  "points_used": 3,
  "cells": [
    { "x": 0.5,  "y": 0.5, "rssi_dbm": null,  "category": null },
    { "x": 12.5, "y": 8.5, "rssi_dbm": -73.6, "category": "debil" },
    { "x": 13.5, "y": 8.5, "rssi_dbm": -66.2, "category": "regular" },
    { "x": 14.5, "y": 8.5, "rssi_dbm": -61.0, "category": "buena" }
  ]
}
```
- `x` e `y` son el **centro** de la celda, en metros, con el mismo origen que los puntos (esquina superior izquierda, `y` hacia abajo). `cols` y `rows` son las columnas y filas de la grilla.
- `points_used` es el número de puntos del piso con una medición válida en la fase (incluidos los `sin_senal`). Con `0`, todas las celdas traen `rssi_dbm: null` y `category: null`.
- `rssi_dbm` (número con 1 decimal) y `category` son `null` en una celda sin datos.
- La categoría se calcula solo en el servidor; la web no aplica umbrales.

| Caso | Respuesta |
|---|---|
| Falta `floor_id` o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| Falta `phase` o no es `antes`/`despues` | `400 { "message": "phase debe ser antes o despues" }` |
| Parámetro de consulta desconocido | `400` |
| El piso no existe, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Piso no encontrado" }` |
| El piso no tiene puntos o ninguno tiene medición en la fase | **No es error**: `200` con `points_used: 0` y todas las celdas sin datos |

### 20. `GET /api/v1/emitters?floor_id=1&phase=antes`
Posición estimada de cada emisor (cada BSSID de la red de la organización) en el piso y la fase, por trilateración (ver «Análisis del piso» en §4). Entra un emisor solo si al menos **3 puntos** del piso tienen, en su última medición válida de la fase, una lectura de ese BSSID. Ordenados por `points_used` descendente y, en empate, por `bssid` ascendente.
```json
200 OK
[
  { "bssid": "a4:2b:b0:11:22:33", "ssid": "Inmobiliaria Norte", "frequency_mhz": 5180,
    "x": 8.4, "y": 5.1, "p0_dbm": -38.2, "n": 3.0, "n_fixed": true,
    "rmse_db": 2.4, "points_used": 3, "estimated": true }
]
```
- `x`, `y` (metros, 1 decimal): posición estimada, dentro del contorno del piso.
- `p0_dbm` y `n` (1 decimal): parámetros del modelo ajustados. `n_fixed` es `true` cuando `n` se fijó en 3,0 por haber solo 3 puntos.
- `rmse_db` (1 decimal): error cuadrático medio, en dB, entre las lecturas y lo que predice el modelo. Cuanto menor, mejor ajusta; el cliente puede mostrarlo como confianza.
- `points_used`: puntos que aportaron una lectura de ese BSSID.
- `frequency_mhz` y `ssid`: los de la lectura más fuerte de ese BSSID.
- `estimated` es siempre `true`.
- Sin ningún BSSID con 3 puntos, la respuesta es `200 []` (no es error).

| Caso | Respuesta |
|---|---|
| Falta `floor_id` o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| Falta `phase` o no es `antes`/`despues` | `400 { "message": "phase debe ser antes o despues" }` |
| Parámetro de consulta desconocido | `400` |
| El piso no existe, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Piso no encontrado" }` |

### 21. `GET /api/v1/recommendation?floor_id=1`
Ubicación recomendada para instalar el repetidor (ver «Análisis del piso» en §4). Siempre se calcula con las mediciones de la fase **«antes»**: es la decisión previa a instalar. Las mediciones «después» sirven para comprobar el resultado en el mapa de calor. El **emisor de referencia** es el de la ruta 20 (fase «antes») con más `points_used`; en empate, el de menor `rmse_db`; en empate, el de `bssid` menor.
```json
200 OK
{
  "floor_id": 1,
  "position": { "x": 17.5, "y": 6.5 },
  "emitter_bssid": "a4:2b:b0:11:22:33",
  "target_points": 8,
  "covered_points": 5,
  "reason": null,
  "estimated": true
}
```
- `position`: centro de la celda elegida (metros).
- `target_points`: puntos medidos en «antes» cuya categoría no es `"buena"` (los que hay que mejorar).
- `covered_points`: cuántos de ellos pasarían a `"buena"` con el repetidor en `position`.
- `emitter_bssid`: el emisor de referencia.
- `estimated` es siempre `true`.
- Si no hay recomendación posible, **no es error**: `200` con `position: null` y `reason` con **uno** de estos textos (`reason` es `null` cuando sí hay posición):

| `reason` | Cuándo | `emitter_bssid` · `target_points` · `covered_points` |
|---|---|---|
| `"Faltan puntos medidos para estimar el emisor (mínimo 3)."` | La ruta 20 (fase «antes») no devuelve ningún emisor | `null` · `null` · `null` |
| `"Todos los puntos medidos ya tienen señal buena."` | `target_points` es 0 | el emisor · `0` · `0` |
| `"Ninguna ubicación del piso mejora la señal de los puntos medidos."` | No hay candidata válida (con señal «buena» desde el emisor) o la mejor cubre 0 puntos | el emisor · el número real · `0` |

| Caso | Respuesta |
|---|---|
| Falta `floor_id` o no es entero | `400 { "message": "floor_id es obligatorio y debe ser entero" }` |
| Parámetro de consulta desconocido (incluido `phase`) | `400` |
| El piso no existe, es de otra organización o (para `cliente`) de un edificio no asignado | `404 { "message": "Piso no encontrado" }` |

## 7. Respuestas comunes a todas las rutas protegidas

| Caso | Respuesta |
|---|---|
| Sin cabecera `Authorization` | `401 { "message": "Token requerido" }` |
| Token mal formado o con firma inválida | `401 { "message": "Token inválido" }` |
| Token vencido | `401 { "message": "Token vencido" }` |
| Todo `401` (token o login fallido) | Lleva la cabecera `WWW-Authenticate: Bearer` (RFC 9110 §15.5.2, RFC 6750 §3) |
| Rol sin permiso | `403 { "message": "No tiene permiso para esta acción" }` |
| JSON mal formado en el cuerpo | `400 { "message": "JSON mal formado" }` |
| Cuerpo mayor a 100 kB | `413 { "message": "Cuerpo demasiado grande" }` |
| Charset o codificación del cuerpo no soportados | `415 { "message": "Petición inválida" }` |
| URL con un escape inválido en un parámetro (ej. `/api/v1/buildings/%ZZ`) | `400 { "message": "Petición inválida" }` (con o sin token) |
| Ruta o verbo inexistente (ej. `PUT /api/v1/buildings`) | `404 { "message": "Ruta no encontrada" }` |
| Error inesperado | `500 { "message": "Error interno del servidor" }` |

## 8. Fuera de este contrato (próximos hitos)

- Creación y gestión de usuarios y de sus edificios asignados (hoy solo por datos de prueba).
- Creación y edición de pisos, de su contorno (`outline`) y de la imagen del plano (`plan_url`), y del SSID de la organización (hoy por datos de prueba). Un contorno cóncavo con vértices que se cruzan no se valida: lo carga quien prepara los datos.
- Reporte PDF del piso (se agrega al contrato solo si se implementa).
- Parámetros de consulta para ajustar el análisis (radio, potencia del IDW, tamaño de celda): hoy son constantes fijas (§4).
- Renovación de token (refresh) y vencimiento según turno laboral.
- Envío de la cola sin conexión con la app cerrada (en segundo plano): hoy la app envía las pendientes solo mientras está abierta.
