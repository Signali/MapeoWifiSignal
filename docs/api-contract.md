# Contrato de la API — SignalMap (Hito 2)

> **Estado:** acordado y validado entre los integrantes del equipo (2026-11-04).
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
| `409 Conflict` | Duplicado (`nfc_uid`, `code` en el piso, `name` del edificio en la organización) · borrar un edificio que tiene pisos |
| `422 Unprocessable Entity` | Formato correcto, pero viola una regla de dominio: coordenadas fuera del piso |
| `500 Internal Server Error` | Error inesperado. Mensaje genérico, sin detalles internos |

**Orden de verificación:** `401` → `403` → `400` → `404` → `409` / `422`. Ejemplo: un cliente que intenta crear un punto con el cuerpo mal formado recibe `403`, no `400`.

## 3. Roles y permisos

| Acción | `admin` | `tecnico` | `cliente` |
|---|:-:|:-:|:-:|
| Leer edificios, pisos y puntos | ✅ todos los de la org | ✅ todos los de la org | ✅ **solo sus edificios asignados** (otros → `404`) |
| Crear, editar y borrar edificios | ✅ | ❌ `403` | ❌ `403` |
| Crear y editar puntos | ✅ | ✅ | ❌ `403` |
| Borrar puntos | ✅ | ❌ `403` | ❌ `403` |

- Los usuarios no se crean por la API: vienen del script de datos de prueba (solo desarrollo y demo).
- Un `cliente` puede tener **uno o más edificios asignados** (tabla de asignaciones usuario–edificio). Las asignaciones también vienen de los datos de prueba; no hay endpoint para gestionarlas en este hito.
- La lista de edificios asignados **no va en el token**: el servicio la consulta en cada petición, así que un cambio de asignación aplica de inmediato.
- Un `cliente` sin edificios asignados recibe listas vacías (`200 []`).

## 4. Recursos

### Edificio (`building`)
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo asigna el servidor |
| `name` | texto | Obligatorio al crear · 1 a 100 caracteres (sin espacios al borde) · único dentro de la organización → `409` |

### Piso (`floor`) — solo lectura
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | — |
| `building_id` | entero | Edificio al que pertenece |
| `name` | texto | Ej. `"Piso 3"` |
| `width_m` | número | Ancho del piso en metros (> 0) |
| `height_m` | número | Largo del piso en metros (> 0) |

Los pisos se cargan con los datos de prueba; no tienen creación, edición ni borrado en este hito.

### Punto de medición (`point`)
| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo asigna el servidor |
| `floor_id` | entero | Obligatorio al crear · el piso debe existir en la organización → si no, `404` · **no se puede cambiar** con `PATCH` → `400` |
| `code` | texto | Obligatorio al crear · 1 a 20 caracteres (ej. `"P-07"`) · único dentro del piso → `409` |
| `x` | número | Obligatorio al crear · metros desde el borde izquierdo del plano · `0 ≤ x ≤ width_m` del piso → si no, `422` |
| `y` | número | Obligatorio al crear · metros desde el borde superior del plano · `0 ≤ y ≤ height_m` del piso → si no, `422` |
| `nfc_uid` | texto | Obligatorio al crear · 1 a 32 caracteres · identificador de la tira NFC · único en todo el sistema → `409` |

Coordenadas 2D por piso (sin altura). Un valor no numérico en `x`/`y` es `400` (formato); un número fuera del piso es `422` (regla de dominio).

## 5. Tabla de endpoints

| # | Verbo | Ruta | Roles | Parámetros | Éxito | Errores |
|---|---|---|---|---|---|---|
| 1 | `GET` | `/health` | público | — | `200` | — |
| 2 | `POST` | `/api/v1/auth/login` | público | cuerpo: `email`, `password` | `200` | `400` · `401` |
| 3 | `GET` | `/api/v1/buildings` | todos | — | `200` | `401` |
| 4 | `GET` | `/api/v1/buildings/:id` | todos | ruta: `id` | `200` | `400` · `401` · `404` |
| 5 | `POST` | `/api/v1/buildings` | `admin` | cuerpo: `name` | `201` + `Location` | `400` · `401` · `403` · `409` |
| 6 | `PATCH` | `/api/v1/buildings/:id` | `admin` | ruta: `id` · cuerpo: `name` | `200` | `400` · `401` · `403` · `404` · `409` |
| 7 | `DELETE` | `/api/v1/buildings/:id` | `admin` | ruta: `id` | `204` | `400` · `401` · `403` · `404` · `409` |
| 8 | `GET` | `/api/v1/floors` | todos | consulta: `building_id` (obligatorio) | `200` | `400` · `401` · `404` |
| 9 | `GET` | `/api/v1/points` | todos | consulta: `floor_id` (obligatorio) | `200` | `400` · `401` · `404` |
| 10 | `GET` | `/api/v1/points/:id` | todos | ruta: `id` | `200` | `400` · `401` · `404` |
| 11 | `POST` | `/api/v1/points` | `admin`, `tecnico` | cuerpo: `floor_id`, `code`, `x`, `y`, `nfc_uid` | `201` + `Location` | `400` · `401` · `403` · `404` · `409` · `422` |
| 12 | `PATCH` | `/api/v1/points/:id` | `admin`, `tecnico` | ruta: `id` · cuerpo: `code`, `x`, `y`, `nfc_uid` (al menos uno) | `200` | `400` · `401` · `403` · `404` · `409` · `422` |
| 13 | `DELETE` | `/api/v1/points/:id` | `admin` | ruta: `id` | `204` | `400` · `401` · `403` · `404` |

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
- El token lleva `sub` (id del usuario), `org_id` y `role`. No hay renovación: al vencer, `401` y nuevo login.

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
`admin` y `tecnico` reciben todos los edificios de su organización; `cliente`, solo los que tiene asignados. Sin edificios → `200 []`.

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
{ "name": "Bodega Sur" }

// 201 Created
// Location: /api/v1/buildings/3
{ "id": 3, "name": "Bodega Sur" }
```
| Caso | Respuesta |
|---|---|
| Falta `name`, vacío o > 100 caracteres | `400 { "message": "name es obligatorio (1 a 100 caracteres)" }` |
| Rol `tecnico` o `cliente` | `403 { "message": "No tiene permiso para esta acción" }` |
| Ya existe un edificio con ese nombre en la organización | `409 { "message": "Ya existe un edificio con ese nombre" }` |

### 6. `PATCH /api/v1/buildings/:id`
```json
// Petición
{ "name": "Torre Norte (remodelada)" }

// 200 OK
{ "id": 1, "name": "Torre Norte (remodelada)" }
```
| Caso | Respuesta |
|---|---|
| Cuerpo vacío o campo desconocido | `400` |
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
  { "id": 1, "building_id": 1, "name": "Piso 3", "width_m": 40.0, "height_m": 25.0 }
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
| Falta `floor_id` o no es entero | `400` |
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
| Rol `cliente` | `403` |
| El piso no existe o es de otra organización | `404 { "message": "Piso no encontrado" }` |
| `nfc_uid` ya registrado (en cualquier organización) | `409 { "message": "La tira NFC ya está asociada a otro punto" }` |
| `code` ya existe en ese piso | `409 { "message": "Ya existe un punto con ese código en el piso" }` |
| `x` o `y` fuera de las dimensiones del piso (ej. `x = 45` en un piso de 40 m) | `422 { "message": "Las coordenadas quedan fuera del piso (40 x 25 m)" }` |

### 12. `PATCH /api/v1/points/:id`
```json
// Petición
{ "x": 13.0, "y": 8.5 }

// 200 OK
{ "id": 7, "floor_id": 1, "code": "P-07", "x": 13.0, "y": 8.5, "nfc_uid": "04A23B1C5D8080" }
```
| Caso | Respuesta |
|---|---|
| Cuerpo vacío, campo desconocido o incluye `floor_id` | `400 { "message": "floor_id no se puede modificar" }` (para `floor_id`) |
| Rol `cliente` | `403` |
| No existe o es de otra organización | `404` |
| `nfc_uid` o `code` nuevos chocan con otro punto | `409` |
| Coordenadas nuevas fuera del piso | `422` |

> Para mover un punto a otro piso: borrarlo (`admin`) y crearlo de nuevo.

### 13. `DELETE /api/v1/points/:id`
```
204 No Content
```
| Caso | Respuesta |
|---|---|
| Rol `tecnico` o `cliente` | `403` |
| No existe o es de otra organización | `404` |

## 7. Respuestas comunes a todas las rutas protegidas

| Caso | Respuesta |
|---|---|
| Sin cabecera `Authorization` | `401 { "message": "Token requerido" }` |
| Token mal formado o con firma inválida | `401 { "message": "Token inválido" }` |
| Token vencido | `401 { "message": "Token vencido" }` |
| JSON mal formado en el cuerpo | `400 { "message": "JSON mal formado" }` |
| Error inesperado | `500 { "message": "Error interno del servidor" }` |

## 8. Fuera de este contrato (próximos hitos)

- Creación y gestión de usuarios y de sus edificios asignados (hoy solo por datos de prueba).
- Creación y edición de pisos y planos.
- Mediciones, campañas, mapa de calor, comparación antes/después, recomendación y reporte (Hito 3).
- Renovación de token (refresh) y vencimiento según turno laboral.
