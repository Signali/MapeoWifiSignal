# Modelo de datos — SignalMap (Hito 2)

> **Estado:** validado (2026-11-04). 7 tablas. Motor: PostgreSQL 17.
> Fuente de las reglas: `docs/api-contract.md` (contrato acordado el 2026-11-04).

## Diagrama ER

```mermaid
erDiagram
    organizations ||--o{ users : "tiene"
    organizations ||--o{ buildings : "posee"
    organizations |o--o{ email_domains : "es duena de (corporativo)"
    email_domains ||--o{ users : "dominio del email"
    buildings ||--o{ floors : "tiene"
    floors ||--o{ points : "tiene"
    users ||--o{ user_buildings : "se le asignan"
    buildings ||--o{ user_buildings : "se asigna a"

    organizations {
        integer id PK "identity"
        varchar name "NOT NULL"
    }

    email_domains {
        integer id PK "identity"
        varchar domain UK "NOT NULL, minusculas, ej. demo.cl"
        varchar kind "NOT NULL: corporativo, personal"
        integer org_id FK "NULL si es personal; obligatorio si es corporativo"
    }

    users {
        integer id PK "identity"
        integer org_id FK "NOT NULL"
        varchar email_local "NOT NULL, minusculas, parte antes de @"
        integer email_domain_id FK "NOT NULL, UK con email_local"
        varchar password_hash "NOT NULL, bcrypt"
        varchar role "NOT NULL: admin, tecnico, cliente"
    }

    buildings {
        integer id PK "identity"
        integer org_id FK "NOT NULL"
        varchar name "NOT NULL, 1-100, UK con org_id"
    }

    floors {
        integer id PK "identity"
        integer building_id FK "NOT NULL"
        varchar name "NOT NULL, ej. Piso 3, UK con building_id"
        numeric width_m "numeric(7,2), NOT NULL, mayor que 0"
        numeric height_m "numeric(7,2), NOT NULL, mayor que 0"
    }

    points {
        integer id PK "identity"
        integer floor_id FK "NOT NULL, inmutable"
        varchar code "NOT NULL, 1-20, UK con floor_id"
        numeric x "numeric(7,2), NOT NULL, metros, mayor o igual a 0"
        numeric y "numeric(7,2), NOT NULL, metros, mayor o igual a 0"
        varchar nfc_uid UK "NOT NULL, 1-32, unico global, mayusculas"
    }

    user_buildings {
        integer user_id PK, FK
        integer building_id PK, FK
    }
```

## Relaciones y comportamiento al borrar

| Relación | Cardinalidad | `ON DELETE` | Por qué |
|---|---|---|---|
| `organizations` → `users` | 1 a N | `RESTRICT` | No se borra una organización con usuarios |
| `organizations` → `buildings` | 1 a N | `RESTRICT` | Ídem |
| `organizations` → `email_domains` | 1 a N (solo corporativos) | `RESTRICT` | Un dominio corporativo pertenece a una sola organización |
| `email_domains` → `users` | 1 a N | `RESTRICT` | No se borra un dominio con usuarios que lo usan |
| `buildings` → `floors` | 1 a N | `RESTRICT` | Contrato: borrar un edificio con pisos es `409`, sin cascada |
| `floors` → `points` | 1 a N | `RESTRICT` | Ídem; no se pierden puntos por borrar un piso |
| `users` ↔ `buildings` (`user_buildings`) | N a M | `CASCADE` en ambas FK | Es solo un vínculo de asignación: no debe impedir borrar un edificio sin pisos (`204`) |

## Emails: corporativos primero, personales separados

El login sigue siendo solo con `email` y `password` (el contrato no cambia). El email se guarda **partido** en `email_local` + `email_domain_id`, y el dominio vive una sola vez en `email_domains`, con su tipo:

| Tipo | Ejemplo | `org_id` | Regla |
|---|---|---|---|
| `corporativo` | `demo.cl` | **Obligatorio**: la organización dueña del dominio | Dominio exclusivo de una organización |
| `personal` | `gmail.com` | `NULL` | Dominio compartido por usuarios de cualquier organización |

- **Prioridad del corporativo:** si la organización tiene un dominio corporativo, sus usuarios **deben** usarlo; un email personal solo se acepta si la organización no tiene dominio corporativo.
- **Sin repeticiones:** `UNIQUE (email_local, email_domain_id)` impide el mismo email dos veces en todo el sistema; `UNIQUE (domain)` impide registrar el mismo dominio dos veces. Todo se guarda en minúsculas (`CHECK`), así `Admin@Demo.cl` y `admin@demo.cl` son el mismo.
- **Login:** el servicio parte el email en el último `@`, pasa ambas partes a minúsculas y el repositorio busca con `JOIN email_domains`. La respuesta arma el email de nuevo (`email_local || '@' || domain`).

| Regla de email | Quién la garantiza |
|---|---|
| Dominio corporativo con dueño; personal sin dueño | Base: `CHECK ((kind = 'corporativo') = (org_id IS NOT NULL))` |
| Email y dominio únicos, en minúsculas | Base: `UNIQUE` + `CHECK (x = lower(x))` |
| Usuario con dominio corporativo pertenece a la org dueña del dominio | `npm run seed` (único camino que crea usuarios en este hito) |
| Si la org tiene dominio corporativo, no se usan personales | `npm run seed` |

> Las dos últimas reglas cruzan tablas y un `CHECK` no puede consultarlas. Cuando exista un endpoint de usuarios, pasan a su servicio.

## Números: `numeric` en la base, `number` en la API

`x`, `y`, `width_m` y `height_m` son `numeric(7,2)` (exactos al centímetro, hasta 99 999,99 m). El driver `pg` devuelve `numeric` como **texto** (`"12.50"`), pero el contrato exige números en el JSON (`12.5`). Regla obligatoria en `backend/src/repositories/README.md`.

## Reglas que cumple la base y reglas que cumple el servicio

| Regla del contrato | Quién la garantiza |
|---|---|
| `name` de edificio único por organización (`409`) | Base: `UNIQUE (org_id, name)` |
| `name` de piso único por edificio | Base: `UNIQUE (building_id, name)` (los pisos entran por seed; sin endpoint de escritura, así que no genera `409` por la API) |
| `code` único por piso (`409`) | Base: `UNIQUE (floor_id, code)` |
| `nfc_uid` único global (`409`) | Base: `UNIQUE (nfc_uid)` |
| `nfc_uid` en mayúsculas | **Servicio** convierte la entrada; base: `CHECK (nfc_uid = upper(nfc_uid))` |
| `x`, `y` con máximo 2 decimales (`400`) | **API (Zod)**: `numeric(7,2)` redondea antes de cualquier `CHECK`, así que la base no puede rechazarlo |
| Rol válido | Base: `CHECK (role IN ('admin','tecnico','cliente'))` |
| Dimensiones del piso `> 0`; `x`, `y` `>= 0` | Base: `CHECK` |
| `x <= width_m` e `y <= height_m` del piso (`422`) | **Servicio**: depende de otra tabla; un `CHECK` no puede consultarla |
| Aislamiento por organización (`404`) | **Repositorio**: `JOIN` con `buildings` y filtro por `org_id` |
| Visibilidad del `cliente` (`404`) | **Repositorio**: `JOIN` con `user_buildings` en cada consulta |

## Fuera de este modelo (Hito 3)

Campañas, mediciones y lecturas de red (parte del modelo del Hito 1) y la columna `geometry(Point, 0)` de PostGIS (ver decisión en `CLAUDE.md`). No se crean tablas vacías por adelantado.
