# CLAUDE.md — SignalMap

Proyecto universitario (Universidad Mayor, Arquitectura de Desarrollo Web y Móvil): app Android + tiras NFC + plataforma web para medir señal WiFi antes/después de instalar un repetidor. Resumen del Hito 1 en el vault de Obsidian (ver abajo): `SignalMap\Hito 1 - Informe resumido.md`. Propuesta de back-end: `SignalMap\Propuesta Back-End\`.

## Rúbrica del profesor (archivo fijo)

La rúbrica de cada hito es la referencia obligatoria de todo entregable.

- **Ubicación:** vault de Obsidian del equipo en uso, carpeta `SignalMap\Rúbricas\`, un archivo por hito (`Hito N - Rúbrica.md`).
- **Vault según el equipo:**

  | Equipo | Vault de Obsidian |
  |---|---|
  | **Pc-Casa** | `Brain-Environment` |
  | **Pc-Portatil** | `Proyects_Brains` |

- **Ruta:** cambia según el PC. Búscala por el nombre `<vault>\SignalMap\Rúbricas` (con el vault del equipo en uso) o usa `/add-dir` con la carpeta del vault. No escribas rutas absolutas del usuario en este archivo.
- **Hito en curso: Hito 2.** Archivo: `Hito 2 - Rúbrica.md`.

Reglas:
1. Antes de planificar, escribir o revisar cualquier entregable (código, informe, prototipo, presentación), **lee la rúbrica del hito en curso completa**.
2. Contrasta el trabajo con cada criterio y señala cuáles cumple, cuáles cumple parcialmente y cuáles faltan. No des por cumplido un criterio sin evidencia.
3. Si el archivo de la rúbrica no existe, no se puede leer, o tiene `estado: pendiente`, **avisa y pide la rúbrica**; no la inventes ni trabajes suponiéndola.
4. La rúbrica es material privado del curso: **no copies su contenido al repositorio** (que puede ser visible para otros). Dentro del repo solo se referencia su ubicación.
5. Cuando el usuario cambie de hito, actualiza la línea "Hito en curso" de este archivo.

## Decisiones tomadas (Hito 2)
- **TypeScript (2026-11-04):** Node 26 ejecuta los `.ts` directo (type stripping); `tsc` solo revisa tipos (`npm run typecheck`, con `erasableSyntaxOnly`). Costo asumido: sin `enum`/`namespace`/parameter properties y dependencia de la versión de Node. Preparado para migrar a `tsc → dist/` en el Hito 3 si hiciera falta (`rewriteRelativeImportExtensions`). Detalle en `backend/README.md`.
- **Calidad (2026-11-04):** objetivo profesional, no el mínimo de la rúbrica (sin sumar funcionalidades). **CI en GitHub Actions** (typecheck + tests contra PostgreSQL 17, sin dependencias nuevas) + **`/code-review` y `/security-review` al cerrar cada recurso** + auditoría completa al final del hito. Fuera por ahora: ESLint/Prettier y `helmet`/límite de intentos (se reconsideran en la auditoría final).
- **Ramas + Pull Requests y CI (confirmado 2026-11-05):** todo cambio entra a `main` por PR desde una rama. `main` está protegida en GitHub: PR obligatorio, check `test` del CI en verde y rama al día con `main`; las reglas aplican **también al admin**; sin force-push ni borrado. **0 aprobaciones obligatorias** (las aprobaciones son por cuenta de GitHub y los dos PCs usan la misma), pero en **cada PR** se deja un comentario mencionando al compañero (`Gabo-collab`) con qué cambia y cómo se probó, y se le pide revisión. Se une con **Squash and merge**. CI: `.github/workflows/ci.yml`, runner fijado en `ubuntu-26.04`; si `config.ts` o el seed exigen una variable nueva, agregarla al `env:` del workflow y a `.env.example` en el mismo PR. Detalle en `backend/README.md`.
- **Seed (2026-11-04):** `npm run seed` **resetea** (`TRUNCATE ... RESTART IDENTITY`) y recarga; IDs fijos (P-07 = id 7). Se niega con `NODE_ENV=production`. Los tests resiembran `signalmap_test` solos (`globalSetup`).
- **Alcance:** el Hito 2 es solo back-end y API REST. La app Android no se evalúa en este hito (por confirmar con el compañero).
- **Recursos con CRUD completo:** edificios y puntos.
- **Autenticación mínima:** login + JWT con `org_id` y rol.
- **Pisos:** entran por seed; sin CRUD propio en este hito.
- **PostGIS diferida al Hito 3 (decidido 2026-11-04):** en el Hito 2 `x`/`y` son columnas numéricas (metros, 2D por piso); PostGIS se aplica y ejecuta en el Hito 3, junto con las consultas espaciales que la justifiquen (migración: columna `geometry(Point, 0)` generada desde `x`/`y`). Implica en el Hito 3 usar la imagen `postgis/postgis:17` y crear la extensión con un rol con permisos. **Condición de control:** al empezar el Hito 3, antes de instalarla, escribir la consulta espacial concreta que la necesita; si existe, se aplica y se defiende con ese caso; si no, se documenta como decisión revisada ("no hace falta con ~24 puntos por piso"). Nunca instalarla como adorno. No instalarla ni declararla en el Hito 2. Se documenta como cambio respecto al Hito 1 (que decía "se implementa en el Hito 2").
- **PostgreSQL 17 confirmado** (2026-11-04); la propuesta decía 16 y se corrigió. El esquema no usa nada exclusivo de la 17.
- **Stack (firmado en el Hito 1 §5, se mantiene):** Node.js + **Express + TypeScript** (frente a Spring Boot) y **Zod** para validar (un schema por endpoint). Costo asumido: Express da poca estructura; se compensa con las capas `routes/` → `controllers/` → `services/` → `repositories/` y `middlewares/`. Comparativa ampliada (Fastify, NestJS, Hono, Spring Boot) en el vault: `SignalMap\Propuesta Back-End\Justificación de tecnologías.md`. Por decidir: el porqué de `pg`/Vitest frente a alternativas (cómo corre TypeScript: ver la decisión de arriba).
- **Arquitectura:** monolito en capas. El equipo es de **2 personas**: citar ese número en el argumento monolito vs. distribuido.
- **Orden:** el contrato de la API (tabla en `docs/`) se escribe y acuerda antes de programar.
- **Contrato (Bloque 1, cerrado 2026-11-04):**
  - Rutas en inglés con prefijo `/api/v1`, estilo plano: `/buildings`, `/points?floor_id=`, `POST /points` con `floor_id` en el cuerpo, `/points/:id`.
  - Pisos: solo `GET /floors?building_id=` (lectura).
  - **Todo en `snake_case`** (cuerpo, respuesta y parámetros de consulta).
  - IDs enteros autoincrementales, tratados como opacos por el cliente (migración futura a UUID sería `v2`).
  - Edificio: solo `name`, único por organización. Punto: `code` (único por piso), `x`, `y` (metros, 2D por piso, sin `z`), `nfc_uid` único global; x/y dentro de `width_m`/`height_m` del piso. `floor_id` no se cambia con `PATCH` (`400`).
  - Contrato completo: `docs/api-contract.md`.
  - Actualizar solo con `PATCH`. Crear: `201` + `Location` + objeto.
  - Errores `{ "message": "..." }`: `400` formato · `401` · `403` · `404` · `409` conflicto (duplicado, borrar edificio con pisos; sin cascada) · `422` regla de dominio.
  - **Agregados en la base común (2026-11-05, OK del compañero en persona, PR #2):** `404 "Ruta no encontrada"` para ruta o verbo inexistente (sin `405`) · `413` cuerpo > 100 kB · `415` charset/codificación no soportados. El `500` es genérico; el detalle va al log (solo stack). Services lanzan `AppError(kind, message)` sin códigos HTTP. Detalle en `backend/src/middlewares/README.md`.
- **Autenticación (Bloque 2, cerrado 2026-11-04):**
  - **JWT sin librería (2026-11-04):** HS256 implementado con `node:crypto` (`createHmac` + `timingSafeEqual`), sin dependencias nuevas. Costo asumido: la verificación es responsabilidad nuestra → tests obligatorios para `alg` distinto de HS256 (incl. `none`), firma alterada, secreto distinto, vencido y token deforme (siempre `401`, nunca `500`).
  - `POST /api/v1/auth/login` → JWT `{ sub, org_id, role }`, sin refresh. **Duración por rol** desde `.env` (`JWT_EXPIRES_IN_ADMIN=8h`, `_TECNICO=10h`, `_CLIENTE=2h`); la elige el servicio de auth.
  - Edificios: escribe solo `admin`. Puntos: `POST`/`PATCH` `admin` y `tecnico`; `DELETE` solo `admin`. Sin permiso → `403`.
  - Lectura: `admin` y `tecnico` ven todos los edificios de su org; `cliente` solo sus **edificios asignados** (tabla usuario–edificio, uno o más; por seed) y sus pisos/puntos. Fuera de eso → `404`. Las asignaciones se consultan en cada petición (no van en el token).
  - Usuarios solo por seed (1 org, 3 usuarios), **solo desarrollo/demo**; sin endpoint de usuarios. En un entorno real no se corre el seed.
  - Contraseñas del seed desde `.env` (`SEED_*_PASSWORD`) vía `npm run seed`, hasheadas con bcrypt; ninguna clave ni hash en el repo.
  - Recurso de otra organización → `404` (toda consulta filtra por `org_id`). Login fallido → `401` genérico "Credenciales inválidas".
- **Datos (Bloque 3, cerrado 2026-11-04):**
  - **PostgreSQL nativo** en ambos PCs (sin Docker ni nube; Docker diferido → trazabilidad). Fijar versión mínima en el README.
  - **7 tablas** (diagrama en `db/er-diagram.md`): `organizations`, `email_domains`, `users`, `buildings`, `floors`, `points`, `user_buildings`. `org_id` en `users`, `buildings` y `email_domains` (solo corporativos); pisos y puntos llegan a la org por `JOIN` con el edificio.
  - **Emails (2026-11-04):** login solo con `email`; se guarda partido en `users.email_local` + FK a `email_domains` (`domain` único, `kind` `corporativo`/`personal`; corporativo con `org_id` dueña, personal sin dueña). Prioridad del corporativo: si la org tiene dominio corporativo, sus usuarios lo usan (lo aplica `npm run seed`). Todo en minúsculas. Motivo: evitar redundancia del dominio y emails repetidos.
  - **Coordenadas y dimensiones:** `numeric(7,2)`; un único `setTypeParser` global en `pg` las convierte a `number` y un test recorre todas las columnas `numeric` (regla en `backend/src/repositories/README.md`).
  - **Entrada de puntos:** `x`/`y` con más de 2 decimales → `400` (Zod; la base redondearía en silencio). `nfc_uid` se guarda en mayúsculas (el servicio convierte, la base lo exige con `CHECK`).
  - **Borrado:** `ON DELETE RESTRICT` en toda la jerarquía; `CASCADE` solo en `user_buildings`. `UNIQUE (building_id, name)` en pisos.
  - **Acceso a datos:** `pg` con SQL explícito y parámetros, sin ORM; las consultas viven solo en `repositories/`.
  - **`db/`:** `schema.sql` + `seed.sql` (datos de dominio, sin usuarios ni claves) + diagrama ER en Mermaid. Los usuarios los crea `npm run seed` con las claves del `.env`, que también ejecuta `seed.sql`.
- **Bloques 1, 2 y 3 validados** con el compañero (2026-11-04).
- **Dirección hacia Docker (Hito 3):** se migrará a Docker real. En el Hito 2 se diseña "listo para Docker", sin escribir aún `Dockerfile` ni `docker-compose.yml`:
  - Toda configuración por variables de entorno (host de la base incluido); nada de `localhost` ni rutas fijas en el código.
  - `db/schema.sql` ejecutable tal cual por el `initdb` de la imagen oficial de PostgreSQL; seed idempotente.
  - Fijar versión de Node (`.nvmrc` / `engines`) y versión mínima de PostgreSQL.
  - El servicio escucha en `0.0.0.0` y mantiene `GET /health` (sirve para el healthcheck del contenedor).
  - Logs a stdout; sin estado en el disco local.
- **Ejecución y demo (Bloque 4, 2026-11-04):**
  - **Node 26** fijado con `.nvmrc` y `engines` (versión de Pc-Casa por confirmar).
  - **PostgreSQL 17** nativo; rol `signalmap_user` y bases `signalmap` y `signalmap_test` (esta última solo para tests, variable `DB_NAME_TEST`).
  - **Tests (revisado 2026-11-04):** de integración con Vitest + Supertest contra `signalmap_test`, **uno por cada respuesta del contrato** (caso feliz y errores `400`/`401`/`403`/`404`/`409`/`422`). Reemplaza la decisión original "pocos, solo casos de error", por el criterio de calidad profesional.
  - **Postman (demo en vivo):** exactamente **4 peticiones** sobre `/points`, en este orden: `POST /points` → `201` · `PATCH /points/:id` → `200` · `DELETE /points/:id` → `204` · `GET /points/:id` → `404` (error y prueba de que el borrado fue real). El login (admin) se hace antes de la demo y el token queda en una variable de la colección; **por confirmar** que la rúbrica lo acepte. El `403` con rol `cliente` se cubre en los tests, no en la demo. El CRUD de edificios se muestra fuera de las 4 peticiones (pgAdmin o documento).
  - **Ensayo de portabilidad en Pc-Casa:** al terminar el primer recurso (edificios), siguiendo solo el README; repetir en la semana 4.
- **No adelantar trabajo del Hito 3** (mapa de calor, comparación antes/después, trilateración, recomendación, reporte PDF) salvo pedido explícito.
- Detalle y supuestos pendientes: vault, `SignalMap\Propuesta Back-End\Propuesta Back-End.md`.

## Estructura del repositorio (exigida por la rúbrica del Hito 2)
- `backend/` — código del servicio, con capas visibles (ver `backend/README.md`).
- `docs/` — documento técnico (PDF) y tabla de la API.
- `db/` — diagrama del modelo de datos y script que crea la base desde cero.
- `postman/` — colección del cliente de pruebas exportada, lista para importar.
- `.env.example` en la raíz — todas las variables con valores de ejemplo; **nunca datos reales**.
- `.gitignore` — excluye `.env`, `node_modules/`, builds y configuración local.
- `Skills/` — documentación de las skills usadas; las skills viven en `.claude/skills/`.
- Las notas de por qué existe esta estructura están en el vault de Obsidian, no en el repo.

## Seguridad y credenciales
- Nunca subas credenciales, claves, tokens ni archivos `.env`. Si algo así llega a un commit: **rotar la credencial**, no solo borrar el archivo; el historial de git es visible.
- Antes de un commit, revisa `git status` y `git diff --staged` buscando secretos.
- No escribas rutas absolutas del usuario ni datos personales en archivos que se suben.
- El repo puede ser visible para el profesor y otras personas: asume que todo lo que se sube es público.

## Trabajo en dos computadores
- Los equipos se llaman **Pc-Casa** y **Pc-Portatil** (ver tabla de vaults arriba). En las notas del vault y al reportar avances, aclarar en cuál se hizo el trabajo.
- Al empezar: `git switch main` + `git pull`, y crear una rama para el trabajo. Al terminar: `git commit` + `git push` de la rama y PR a `main` (push directo a `main` está bloqueado). Commits pequeños y frecuentes.
- Evita editar el mismo archivo en ambos equipos sin sincronizar; cada trabajo en paralelo va en su propia rama.
- GitHub CLI (`gh`) para PRs y runs del CI. En Pc-Portatil está en `%LOCALAPPDATA%\Programs\gh\bin`; en Pc-Casa, pendiente de instalar.
- Los archivos ignorados (`.env`, configuración local) no viajan por git: se recrean en cada equipo desde `.env.example`.
- El vault de Obsidian está fuera de git y se sincroniza aparte.

## Otras convenciones
- Toda skill nueva se documenta en `Skills/README.md` en el mismo commit que la agrega.
- No hagas commit ni push sin que el usuario lo pida.
- Saltos de línea: `.gitattributes` fuerza LF en todos los PCs (sin depender de `core.autocrlf`). No cambiarlo.
