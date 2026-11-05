# Backend — API REST de SignalMap

Servicio del lado del servidor (Hito 2). Stack decidido en el Hito 1: Node.js + Express + TypeScript, con PostgreSQL.

> **Estado:** esqueleto y base común listos (`/health`, configuración desde el entorno, pool de `pg`, seed, errores centralizados, validación con Zod y apagado ordenado, con sus tests). Recursos pendientes.

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

Flujo de una petición: `route → middleware → controller → service → repository → base de datos`.

Errores: un service lanza `AppError(kind, message)` (`src/errors.ts`), sin códigos HTTP; el controller no lo captura y `middlewares/error-handler.ts` responde `{ "message": "..." }` con el código del contrato. Un error inesperado responde `500` genérico y deja el detalle en el log (stderr). Detalle en [`src/middlewares/README.md`](src/middlewares/README.md).

Fuera de `src/`: `scripts/seed.ts` (herramienta de desarrollo, no parte del servicio) y `tests/`.

## Cómo levantar el servicio

### Requisitos
- **Node.js 26** o superior (`node -v`). La versión está fijada en `.nvmrc` y en `engines` de `package.json`.
- **PostgreSQL 17** o superior, con el rol y las dos bases creadas y las tablas cargadas: seguir [`db/README.md`](../db/README.md) (pasos 1 y 2).

### Pasos (desde la raíz del repositorio)
1. Copiar la plantilla de configuración y completar las claves **propias** de este equipo:
   ```bash
   cp .env.example .env
   ```
   `DB_PASSWORD` es la clave de `signalmap_user`; `SEED_*_PASSWORD` serán las claves de los usuarios de prueba. El `.env` nunca se sube.
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

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servicio |
| `npm run dev` | Inicia y se reinicia al guardar un archivo |
| `npm run seed` | Resetea la base `DB_NAME` y carga `db/seed.sql` + los 3 usuarios |
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
