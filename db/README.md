# db/

Modelo de datos y scripts de la base de datos (PostgreSQL 17).

| Archivo | Contenido |
|---|---|
| `er-diagram.md` | Diagrama entidad-relación (Mermaid), relaciones, comportamiento al borrar y qué regla garantiza la base y cuál el servicio |
| `schema.sql` | Crea las 9 tablas **desde cero** en una base vacía |
| `seed.sql` | Datos de dominio de ejemplo (sin usuarios ni claves). **Vacía las tablas** y recarga. Lo ejecuta `npm run seed` (ver [`backend/README.md`](../backend/README.md)), que además crea los usuarios con las claves del `.env` |

## Requisitos

- **PostgreSQL 17** o superior, con las herramientas de línea de comandos (`psql`).
- En Windows, `psql` está en `C:\Program Files\PostgreSQL\17\bin` (el número cambia según la versión instalada). **El instalador no la agrega al PATH:** agregarla en *Variables de entorno* → `Path` del usuario → *Nuevo*, y abrir una terminal nueva. O escribir la ruta completa.
- En Windows, al entrar a `psql` aparece una advertencia de que la página de códigos de la consola (850) difiere de la de Windows (1252). Es esperable y no afecta a estos pasos.

## Crear la base desde cero

### 1. Rol y bases (una sola vez, como superusuario `postgres`)

Abrir `psql` con `psql -U postgres`: pide la clave de `postgres` elegida al instalar PostgreSQL. **Al escribir una clave en `psql` no se ve nada** (ni asteriscos); es normal, se escribe y se presiona Enter. Luego, en el prompt `postgres=#`:

```sql
CREATE ROLE signalmap_user LOGIN;
\password signalmap_user
CREATE DATABASE signalmap      OWNER signalmap_user;
CREATE DATABASE signalmap_test OWNER signalmap_user;
```

- La clave que se escribe en `\password` es la que va en `DB_PASSWORD` del `.env` (copiado de `.env.example`).
- La app nunca usa `postgres`: `signalmap_user` solo es dueño de sus dos bases.

### 2. Tablas (como `signalmap_user`)

Desde la raíz del repositorio. Cada comando pide la clave de `signalmap_user`.

**En Windows, antes de estos comandos**, indicar que el archivo está en UTF-8 (vale para esa terminal):

- PowerShell: `$env:PGCLIENTENCODING = "UTF8"`
- cmd: `set PGCLIENTENCODING=UTF8`

Sin esto, `psql` lee `schema.sql` como WIN1252 y se detiene en la sexta tabla con `carácter con secuencia de bytes 0x8d en codificación «WIN1252» no tiene equivalente en la codificación «UTF8»`. No queda ninguna tabla creada (ver «Todo o nada» abajo), así que basta con fijar la variable y repetir.

```bash
psql -h localhost -U signalmap_user -d signalmap      -v ON_ERROR_STOP=1 -f db/schema.sql
psql -h localhost -U signalmap_user -d signalmap_test -v ON_ERROR_STOP=1 -f db/schema.sql
```

Salida esperada: `BEGIN`, nueve `CREATE TABLE`, dos `CREATE INDEX` y `COMMIT`.

### 3. Verificar

```bash
psql -h localhost -U signalmap_user -d signalmap -c "\dt"
```

Debe listar 9 tablas: `buildings`, `email_domains`, `floors`, `measurements`, `network_readings`, `organizations`, `points`, `user_buildings`, `users`.

Para cargar los datos de ejemplo (`npm run seed`) el `.env` necesita además `SEED_WIFI_SSID`, el nombre exacto de la red WiFi de la organización (ver `.env.example`).

## Comportamiento del script

- **Todo o nada:** corre en una transacción. Si algo falla, no queda ninguna tabla a medias.
- **No borra datos:** si las tablas ya existen, se detiene con `relation "organizations" already exists` y no cambia nada.
- **No crea la base ni el rol:** así lo puede ejecutar tal cual el `initdb` de la imagen oficial de PostgreSQL (migración a Docker prevista para el Hito 3).

### Recrear la base (solo desarrollo)

Borra **todos** los datos de esa base. Como `postgres`:

```sql
DROP DATABASE signalmap;
CREATE DATABASE signalmap OWNER signalmap_user;
```

Después, repetir el paso 2.

### Pasar al esquema del Hito 3 (bases ya creadas)

Si tus bases se crearon con el esquema del Hito 2 (7 tablas), hay que **recrearlas**: `schema.sql` es el único script desde cero y no hay migración. Se pierden los datos de esas bases, que son de ejemplo (el seed los vuelve a cargar). Con el servicio detenido, como `postgres`:

```sql
DROP DATABASE signalmap;
DROP DATABASE signalmap_test;
CREATE DATABASE signalmap      OWNER signalmap_user;
CREATE DATABASE signalmap_test OWNER signalmap_user;
```

Luego:
1. Repetir el paso 2 (`schema.sql` en las dos bases).
2. Agregar `SEED_WIFI_SSID` a tu `.env` (está en `.env.example`).
3. Correr `npm run seed` en `backend/`.
