# Backend — API REST de SignalMap

Servicio del lado del servidor (Hito 2). Stack decidido en el Hito 1: Node.js + Express + TypeScript, con PostgreSQL.

> **Estado:** esqueleto listo (`/health`, configuración desde el entorno, pool de `pg`, seed y test del parser de `numeric`). Recursos pendientes.

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
