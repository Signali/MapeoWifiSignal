# db/

Modelo de datos y scripts de la base de datos (PostgreSQL 17).

| Archivo | Contenido |
|---|---|
| `er-diagram.md` | Diagrama entidad-relación (Mermaid), relaciones, comportamiento al borrar y qué regla garantiza la base y cuál el servicio |
| `schema.sql` | Crea las 7 tablas **desde cero** en una base vacía |
| `seed.sql` | *(pendiente)* Datos de dominio de ejemplo; lo ejecuta `npm run seed` |

## Requisitos

- **PostgreSQL 17** o superior, con las herramientas de línea de comandos (`psql`).
- En Windows, `psql` está en `C:\Program Files\PostgreSQL\17\bin`. Agregar esa carpeta al PATH o escribir la ruta completa.

## Crear la base desde cero

### 1. Rol y bases (una sola vez, como superusuario `postgres`)

```sql
CREATE ROLE signalmap_user LOGIN;
\password signalmap_user
CREATE DATABASE signalmap      OWNER signalmap_user;
CREATE DATABASE signalmap_test OWNER signalmap_user;
```

- La clave que se escribe en `\password` es la que va en `DB_PASSWORD` del `.env` (copiado de `.env.example`).
- La app nunca usa `postgres`: `signalmap_user` solo es dueño de sus dos bases.

### 2. Tablas (como `signalmap_user`)

Desde la raíz del repositorio:

```bash
psql -h localhost -U signalmap_user -d signalmap      -v ON_ERROR_STOP=1 -f db/schema.sql
psql -h localhost -U signalmap_user -d signalmap_test -v ON_ERROR_STOP=1 -f db/schema.sql
```

Salida esperada: `BEGIN`, siete `CREATE TABLE`, un `CREATE INDEX` y `COMMIT`.

### 3. Verificar

```bash
psql -h localhost -U signalmap_user -d signalmap -c "\dt"
```

Debe listar: `buildings`, `email_domains`, `floors`, `organizations`, `points`, `user_buildings`, `users`.

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
