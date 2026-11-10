# Backend — API REST de SignalMap

Servicio del lado del servidor (Hito 2). Stack decidido en el Hito 1: Node.js + Express + TypeScript, con PostgreSQL.

> **Estado:** esqueleto, base común y autenticación listos (`/health`, configuración desde el entorno, pool de `pg`, seed, errores centralizados, validación con Zod, apagado ordenado, login con JWT y middleware de token y rol, con sus tests). **Edificios y puntos con CRUD completo** (los dos recursos del Hito 2) y **lectura de pisos** (`GET /floors?building_id=`).

## TypeScript sin paso de build

Node 26 ejecuta los `.ts` directamente (borra las anotaciones de tipo al cargar el archivo). `tsc` solo revisa tipos (`npm run typecheck`), no genera archivos.

- Solo se usa sintaxis "borrable": **sin `enum`, `namespace` ni parameter properties** (para los roles, `'admin' | 'tecnico' | 'cliente'`). `erasableSyntaxOnly` en `tsconfig.json` hace que `tsc` lo marque.
- Los imports relativos llevan extensión `.ts` (`import { pool } from './db.ts'`) y los que son solo tipos, `import type`.
- **Correr `npm run typecheck` antes de cada commit:** Vitest acepta sintaxis que `npm start` rechazaría.
- Migración prevista si hiciera falta compilar (Hito 3): quitar `noEmit` y agregar `outDir` en `tsconfig.json`; `rewriteRelativeImportExtensions` ya reescribe `.ts` → `.js`.

## Capas (`src/`)

| Carpeta | Responsabilidad | Regla |
|---|---|---|
| `middlewares/` | Autenticación (JWT), validación de entrada, manejo de errores | No contiene lógica de negocio |
| `routes/` | Define rutas y verbos HTTP y las conecta a controladores | Solo ruteo |
| `controllers/` | Lee la petición, llama a un servicio y arma la respuesta HTTP con su código de estado | **Sin lógica de negocio** |
| `services/` | Lógica de negocio | No conoce HTTP ni escribe SQL |
| `repositories/` | Acceso a datos | **Las consultas viven solo aquí** |
| `schemas/` | Schemas de Zod de cada endpoint (los usa `validate` en la ruta y el controller para sus tipos) | Solo forma de la entrada; sin reglas de negocio |

En la raíz de `src/`: `config.ts` (entorno validado), `errors.ts` (`AppError`) y `roles.ts` (los 3 roles).

Flujo de una petición: `route → middleware → controller → service → repository → base de datos`.

Errores: un service lanza `AppError(kind, message)` (`src/errors.ts`), sin códigos HTTP; el controller no lo captura y `middlewares/error-handler.ts` responde `{ "message": "..." }` con el código del contrato. Un error inesperado responde `500` genérico y deja el detalle en el log (stderr). Detalle en [`src/middlewares/README.md`](src/middlewares/README.md).

Fuera de `src/`: `scripts/seed.ts` (herramienta de desarrollo, no parte del servicio) y `tests/`.

## Cómo levantar el servicio

### Requisitos
- **Node.js 26** o superior (`node -v`). La versión está fijada en `.nvmrc` y en `engines` de `package.json`.
- **PostgreSQL 17** o superior, con el rol y las dos bases creadas y las tablas cargadas: seguir [`db/README.md`](../db/README.md) (pasos 1 y 2).
- **Windows PowerShell:** si `npm` responde «No se puede cargar el archivo ...\npm.ps1 porque la ejecución de scripts está deshabilitada en este sistema», correr una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (solo afecta a tu usuario). Alternativa sin cambiar nada: escribir `npm.cmd` en lugar de `npm`, o usar cmd o Git Bash.

### Pasos (desde la raíz del repositorio)
1. Copiar la plantilla de configuración y completar las claves **propias** de este equipo:
   ```bash
   cp .env.example .env
   ```
   `DB_PASSWORD` es la clave de `signalmap_user`; `SEED_*_PASSWORD` serán las claves de los usuarios de prueba. `JWT_SECRET` se **genera** (mínimo 32 caracteres; el servicio no arranca con el valor de ejemplo, que es público):
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```
   El `.env` nunca se sube.
2. Instalar dependencias:
   ```bash
   cd backend
   npm install
   ```
3. Cargar los datos de ejemplo (**borra y recarga** todos los datos de la base `DB_NAME`; solo desarrollo y demo):
   ```bash
   npm run seed
   ```
   Salida esperada: `Seed cargado en la base "signalmap".`
4. Iniciar:
   ```bash
   npm start
   ```
   Salida esperada: `SignalMap API escuchando en el puerto 3000 (development)`.
5. Verificar: abrir `http://localhost:3000/health` → `{"status":"ok"}`.

Si falta o está mal una variable del `.env`, el servicio no arranca y dice cuál es.

### Detener el servicio (apagado ordenado)

`Ctrl+C` en la terminal (SIGINT) o `SIGTERM` (lo que envía `docker stop`): el servicio deja de aceptar conexiones, espera las peticiones en curso, cierra el pool de PostgreSQL y sale con código 0. Salida esperada:

```
SIGINT recibido: cerrando el servicio...
Servicio cerrado
```

Si una petición no termina en **8 s**, corta las conexiones y sale con código 1 (Docker mata el proceso a los 10 s). Un **segundo `Ctrl+C`** durante el cierre corta al instante (código 1). El test automático de esto (`tests/shutdown.test.ts`) corre solo en Linux (el CI): en Windows una señal enviada por código termina el proceso sin pasar por el manejador, así que ahí se prueba a mano con `Ctrl+C`.

### Usuarios de prueba (creados por `npm run seed`)

| Email | Rol | Clave | Edificios que ve |
|---|---|---|---|
| `admin@demo.cl` | `admin` | `SEED_ADMIN_PASSWORD` | Todos los de la organización |
| `tecnico@demo.cl` | `tecnico` | `SEED_TECNICO_PASSWORD` | Todos los de la organización |
| `cliente@demo.cl` | `cliente` | `SEED_CLIENTE_PASSWORD` | Solo «Torre Norte» |

## Autenticación (JWT)

`POST /api/v1/auth/login` con `{ "email", "password" }` devuelve un token que se envía en cada petición como `Authorization: Bearer <token>` (contrato §6.2 y §7).

- **JWT HS256 propio** con `node:crypto` (`src/services/token.ts`), sin librería. Payload `{ sub, org_id, role, exp }`, con `sub` como texto. Se acepta **solo** la cabecera que emitimos (`{"alg":"HS256","typ":"JWT"}`): `alg: none`, `HS512`, `RS256`, `kid`… → `401`. La firma se compara en tiempo constante (`timingSafeEqual`) y como texto (el decodificador base64url de Node ignora caracteres sobrantes).
- **Duración por rol** desde el `.env` (`JWT_EXPIRES_IN_ADMIN=8h`, `_TECNICO=10h`, `_CLIENTE=2h`; formato entero + `s`/`m`/`h`/`d`). Sin renovación: al vencer, nuevo login.
- **Login fallido:** `401 "Credenciales inválidas"`, el mismo si falla el email o la clave. Si el email no existe, igual se ejecuta bcrypt contra un hash ficticio: así el tiempo de respuesta no revela qué emails están registrados.
- **Middlewares** (`src/middlewares/auth.ts`): `authenticate` (401) y `requireRole(...)` (403), antes de `validate` en cada ruta. Detalle en [`src/middlewares/README.md`](src/middlewares/README.md).
- Limitaciones aceptadas: un token no se puede revocar antes de su `exp`; sin límite de intentos de login (queda para el Hito 3: documento técnico, sección 8.2); bcrypt solo considera los primeros 72 bytes de la clave.

### El secreto en producción (plan para el Hito 3)

Quien conoce `JWT_SECRET` puede fabricar tokens de cualquier rol, así que es la credencial más sensible del servicio. Hoy: fuera del repo, generado por cada equipo, mínimo 32 caracteres y nunca el de ejemplo (`config.ts` lo exige). Cifrar el `.env` no lo protegería: la clave para descifrarlo tendría que estar en el mismo servidor. Para el despliegue con Docker (Hito 3):

- **Docker secrets:** montar el secreto como archivo en memoria (`/run/secrets/jwt_secret`) y leerlo desde una variable `JWT_SECRET_FILE`, en vez de pasarlo como variable de entorno (no aparece en `docker inspect`, en volcados del entorno ni en procesos hijos).
- **Rotación manual:** cambiar `JWT_SECRET` y reiniciar. Todos los tokens emitidos dejan de valer y los usuarios vuelven a hacer login. Se hace ante cualquier sospecha de filtración.

## Edificios (primer recurso)

`/api/v1/buildings` con `GET` (lista y por id), `POST`, `PATCH` y `DELETE` (contrato §5, filas 3 a 7). Recorrido de una petición por las capas:

| Capa | Archivo | Qué hace |
|---|---|---|
| Ruta | `routes/buildings.ts` | `authenticate` → `requireRole('admin')` (solo en las escrituras) → `validate` → controller |
| Schema | `schemas/buildings.ts`, `schemas/common.ts` | `name`: caracteres permitidos y normalización (NFKC, espacios, mayúscula inicial por palabra; contrato §4). `idParams`: `1 … 2147483647`. `noQuery`: sin parámetros de consulta |
| Controller | `controllers/buildings.ts` | `200`, `201` + `Location`, `204`. Sin lógica |
| Service | `services/buildings.ts` | Alcance de lectura según el rol (el `cliente`, solo sus edificios asignados) y `404 "Edificio no encontrado"` |
| Repositorio | `repositories/buildings.ts` | SQL con `org_id` en toda consulta; duplicado y edificio con pisos → `409` vía `query()` de `db.ts` |

- Un edificio de otra organización, inexistente o no asignado al `cliente` responde el **mismo** `404`: no se revela que existe.
- `UNIQUE (org_id, name)` distingue mayúsculas en la base, pero como la API normaliza el nombre, `"torre NORTE"` choca con `"Torre Norte"` (`409`).
- Tests: `tests/buildings.test.ts` (una respuesta del contrato por caso, con los tokens de los 3 roles, más una segunda organización, un cliente sin asignaciones y una asignación cruzada creados por el propio test y borrados al final).

## Puntos (segundo recurso) y pisos (solo lectura)

`/api/v1/points` con `GET ?floor_id=`, `GET /:id`, `POST`, `PATCH` y `DELETE`, y `GET /api/v1/floors?building_id=` (contrato §5, filas 8 a 13). Mismo molde que edificios:

| Capa | Archivo | Qué hace |
|---|---|---|
| Ruta | `routes/points.ts`, `routes/floors.ts` | Leen todos los roles. `POST`/`PATCH`: `requireRole('admin', 'tecnico')`; `DELETE`: `requireRole('admin')`. Siempre antes de `validate` |
| Schema | `schemas/points.ts`, `schemas/floors.ts` | `code`: NFKC, espacios, **mayúsculas**, solo letras, números, espacio y `- _ . /`, 1 a 20 · `nfc_uid`: **hexadecimal**, 1 a 32, a mayúsculas · `x`/`y`: número con hasta 2 decimales · `floor_id`: entero, obligatorio al crear y prohibido en `PATCH` · `PATCH` con al menos un campo · `?floor_id=` y `?building_id=` con `textId`, y `floor_id` del cuerpo con `bodyId` (`schemas/common.ts`). El primer paso de normalización (`squish`: NFKC, trim, espacios) y el rechazo de rellenos invisibles son comunes con `name` de edificios |
| Controller | `controllers/points.ts`, `controllers/floors.ts` | `200`, `201` + `Location`, `204`. `idOf` / `queryIdOf` (`controllers/params.ts`) leen los números ya validados |
| Service | `services/points.ts`, `services/floors.ts` | Mismo alcance que edificios (`readScope`): un piso o punto se ve si se ve su edificio. Lee el piso (o el piso del punto) y responde `404` o `422` (`0 ≤ x ≤ width_m`, `0 ≤ y ≤ height_m`) **antes** de escribir |
| Repositorio | `repositories/points.ts`, `repositories/floors.ts` | `JOIN` con `buildings` y el filtro `VISIBLE` de edificios en lectura; `org_id` del edificio en `UPDATE`/`DELETE`. `code` repetido en el piso y `nfc_uid` repetido → `409` vía `query()` |

- Orden de las respuestas: `401 → 403 → 400 → 404 → 422 → 409`. Si un punto queda fuera del piso y además está repetido, gana el `422` (se valida antes de escribir).
- Los pisos no se crean ni se editan por la API, así que leer sus medidas y después escribir no abre una carrera.
- Tests: `tests/points.test.ts`, con los mismos datos propios que edificios (otra organización, cliente sin asignaciones, asignación cruzada) más un edificio de la organización 1 **no asignado** al cliente, con piso y punto.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servicio |
| `npm run dev` | Inicia y se reinicia al guardar un archivo |
| `npm run seed` | Resetea la base `DB_NAME` y carga `db/seed.sql` + los 3 usuarios |
| `npm run startup-time` | Mide 10 arranques del servicio (hasta que `/health` responde `200`) y muestra mínimo, mediana y máximo. Con el servicio detenido; `/health` no consulta la base |
| `npm run typecheck` | Revisa los tipos con `tsc` (no genera archivos) |
| `npm test` | Resiembra `DB_NAME_TEST` y corre los tests (Vitest). Requiere esa base con las tablas creadas |

## Integración continua (GitHub Actions)

Cada push y cada Pull Request a `main` corre [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) en un servidor de GitHub:

1. Levanta un **PostgreSQL 17** vacío. El superusuario solo crea el rol `signalmap_user` (sin superusuario) y la base `signalmap_test`, como en el paso 1 de [`db/README.md`](../db/README.md).
2. Crea las tablas con `db/schema.sql` (`psql -v ON_ERROR_STOP=1`) como `signalmap_user`.
3. Instala Node (versión de `.nvmrc`) y las dependencias con `npm ci` (exactas, desde `package-lock.json`).
4. Corre `npm run typecheck` y `npm test`.

Las variables de entorno del CI están en el mismo YAML, con **valores falsos** (`ci_*_falsa`). La base existe solo durante el run, así que no hay nada que proteger y no se usan GitHub Secrets. Si `src/config.ts` o el seed empiezan a exigir una variable nueva, hay que agregarla también ahí (y en `.env.example`), o el CI falla al arrancar.

Un PR solo se une a `main` con el CI en verde.

### Cómo leer una falla

En el PR, **Checks → CI → test**, o con `gh run view <id> --log-failed`. El paso marcado con ✗ dice dónde está el problema:

| Paso que falla | Causa probable | Qué hacer |
|---|---|---|
| `Initialize containers` | La imagen de PostgreSQL no levantó | Volver a correr el job; si se repite, revisar el bloque `services` |
| `Crear rol y base` / `Crear tablas` | `db/schema.sql` tiene un error, o pide permisos que `signalmap_user` no tiene | Probarlo localmente en una base vacía (`db/README.md`, paso 2) |
| `npm ci` | `package-lock.json` no coincide con `package.json` | `npm install` local y commitear el lock |
| `npm run typecheck` | Error de tipos o sintaxis no "borrable" | `npm run typecheck` local |
| `npm test` | Un test falló, o falta una variable de entorno (`Configuración inválida ...`) | Leer el `AssertionError`; GitHub también lo anota en la línea del test dentro del PR. Reproducir con `npm test` local |

Ejemplo real (prueba del CI, PR #1): al desactivar el parser de `numeric` en `src/repositories/db.ts`, solo falla `npm test`:

```
AssertionError: floors.height_m: expected 'string' to be 'number'
 ❯ tests/numeric-parser.test.ts:23:46
```
