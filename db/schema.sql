-- =============================================================================
-- SignalMap — esquema de la base de datos (Hitos 2 y 3)
-- Motor: PostgreSQL 17 (versión mínima probada: 17).
-- Modelo y decisiones: db/er-diagram.md · reglas de la API: docs/api-contract.md
--
-- Crea las 9 tablas desde cero en la base a la que se conecta. No crea la base
-- ni el rol (eso lo hace el administrador, ver db/README.md), así puede
-- ejecutarlo tal cual el initdb de la imagen oficial de PostgreSQL (Hito 3).
--
-- Va en una sola transacción: o se crean todas las tablas o ninguna. Si las
-- tablas ya existen, falla sin tocar nada (no borra datos).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- organizations: empresa cliente de SignalMap. Raíz del aislamiento por org_id.
-- wifi_ssid: nombre exacto (distingue mayúsculas) de la red WiFi de la
-- organización; solo se guardan las lecturas de esa red. Lo carga `npm run seed`
-- desde SEED_WIFI_SSID; la API no lo lee ni lo cambia.
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      varchar(100) NOT NULL
        CHECK (name = btrim(name) AND char_length(name) >= 1),
    wifi_ssid varchar(32) NOT NULL
        CHECK (char_length(wifi_ssid) BETWEEN 1 AND 32)
);

-- -----------------------------------------------------------------------------
-- email_domains: cada dominio de email se guarda una sola vez.
--   corporativo -> pertenece a una organización (org_id obligatorio)
--   personal    -> compartido, sin dueña (org_id NULL), ej. gmail.com
-- -----------------------------------------------------------------------------
CREATE TABLE email_domains (
    id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain varchar(255) NOT NULL
        CHECK (domain = lower(btrim(domain)) AND domain LIKE '%_._%' AND domain NOT LIKE '%@%'),
    kind   varchar(20)  NOT NULL
        CHECK (kind IN ('corporativo', 'personal')),
    org_id integer
        REFERENCES organizations (id) ON DELETE RESTRICT,
    CONSTRAINT email_domains_domain_key UNIQUE (domain),
    CONSTRAINT email_domains_owner_chk  CHECK ((kind = 'corporativo') = (org_id IS NOT NULL))
);

-- -----------------------------------------------------------------------------
-- users: solo por seed en el Hito 2. El email se guarda partido:
--   email_local (antes de @) + email_domain_id (FK). Ambos en minúsculas.
-- Reglas que cruzan tablas (las aplica `npm run seed`, no la base):
--   - un dominio corporativo solo lo usan usuarios de su organización;
--   - si la organización tiene dominio corporativo, no se usan personales.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id          integer NOT NULL
        REFERENCES organizations (id) ON DELETE RESTRICT,
    email_local     varchar(64) NOT NULL
        CHECK (email_local = lower(btrim(email_local)) AND char_length(email_local) >= 1
               AND email_local NOT LIKE '%@%'),
    email_domain_id integer NOT NULL
        REFERENCES email_domains (id) ON DELETE RESTRICT,
    password_hash   varchar(100) NOT NULL,          -- bcrypt (60 caracteres); nunca la clave
    role            varchar(20)  NOT NULL
        CHECK (role IN ('admin', 'tecnico', 'cliente')),
    -- Mismo email una sola vez en todo el sistema (el login no recibe organización).
    CONSTRAINT users_email_key UNIQUE (email_local, email_domain_id)
);

-- -----------------------------------------------------------------------------
-- buildings: CRUD completo por la API (solo admin escribe).
-- -----------------------------------------------------------------------------
CREATE TABLE buildings (
    id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id integer NOT NULL
        REFERENCES organizations (id) ON DELETE RESTRICT,
    name   varchar(100) NOT NULL
        CHECK (name = btrim(name) AND char_length(name) >= 1),
    -- 409 "Ya existe un edificio con ese nombre". También sirve de índice para
    -- listar los edificios de una organización (columna líder org_id).
    CONSTRAINT buildings_org_name_key UNIQUE (org_id, name)
);

-- -----------------------------------------------------------------------------
-- floors: solo lectura por la API; se cargan por seed.
-- Dimensiones en metros: los puntos deben caer dentro (regla 422 del servicio).
-- -----------------------------------------------------------------------------
CREATE TABLE floors (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id integer NOT NULL
        REFERENCES buildings (id) ON DELETE RESTRICT,   -- edificio con pisos -> 409
    name        varchar(100) NOT NULL
        CHECK (name = btrim(name) AND char_length(name) >= 1),
    width_m     numeric(7,2) NOT NULL CHECK (width_m  > 0),
    height_m    numeric(7,2) NOT NULL CHECK (height_m > 0),
    CONSTRAINT floors_building_name_key UNIQUE (building_id, name)
);

-- -----------------------------------------------------------------------------
-- points: CRUD completo por la API (admin y tecnico crean/editan; borra admin).
-- x, y: metros desde el borde izquierdo / superior del plano, 2D por piso.
-- numeric(7,2) redondea en silencio un tercer decimal: el 400 por más de 2
-- decimales lo da la validación de la API (Zod), no la base.
-- El tope superior (x <= width_m, y <= height_m) depende de floors: lo valida
-- el servicio (422), porque un CHECK no puede leer otra tabla.
-- -----------------------------------------------------------------------------
CREATE TABLE points (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_id integer NOT NULL
        REFERENCES floors (id) ON DELETE RESTRICT,
    code     varchar(20) NOT NULL
        CHECK (code = btrim(code) AND char_length(code) >= 1),
    x        numeric(7,2) NOT NULL CHECK (x >= 0),
    y        numeric(7,2) NOT NULL CHECK (y >= 0),
    -- Siempre en mayúsculas: el servicio convierte la entrada; la base lo exige.
    nfc_uid  varchar(32) NOT NULL
        CHECK (nfc_uid = upper(nfc_uid) AND char_length(nfc_uid) >= 1),
    -- 409 "Ya existe un punto con ese código en el piso". Índice para listar
    -- los puntos de un piso (columna líder floor_id).
    CONSTRAINT points_floor_code_key UNIQUE (floor_id, code),
    -- 409 "La tira NFC ya está asociada a otro punto" (único en todo el sistema).
    CONSTRAINT points_nfc_uid_key UNIQUE (nfc_uid)
);

-- -----------------------------------------------------------------------------
-- user_buildings: edificios asignados a un usuario cliente (por seed).
-- CASCADE: es solo un vínculo; no debe impedir borrar un edificio sin pisos.
-- -----------------------------------------------------------------------------
CREATE TABLE user_buildings (
    user_id     integer NOT NULL REFERENCES users (id)     ON DELETE CASCADE,
    building_id integer NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, building_id)
);

-- La PK cubre las búsquedas por user_id; este índice cubre las de building_id
-- (borrado en cascada al eliminar un edificio).
CREATE INDEX user_buildings_building_id_idx ON user_buildings (building_id);

-- -----------------------------------------------------------------------------
-- measurements: una medición de un punto en una fase (antes/después de instalar
-- el repetidor). No se borra: el admin la anula con un motivo (voided_*).
-- user_id se guarda por trazabilidad; la API no lo devuelve.
-- measured_at: hora del escaneo (la manda la app) o, si falta, la de recepción.
-- received_at: siempre del servidor.
-- client_uuid: lo genera la app; reenviar el mismo no duplica (200 en la API).
-- -----------------------------------------------------------------------------
CREATE TABLE measurements (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    point_id    integer NOT NULL
        REFERENCES points (id) ON DELETE RESTRICT,      -- punto con mediciones -> 409
    user_id     integer NOT NULL
        REFERENCES users (id) ON DELETE RESTRICT,       -- quién midió (no se devuelve)
    phase       varchar(10) NOT NULL
        CHECK (phase IN ('antes', 'despues')),
    client_uuid uuid NOT NULL,
    measured_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    voided_at   timestamptz,
    void_reason varchar(30)
        CHECK (void_reason IN ('punto_equivocado', 'fase_equivocada', 'condiciones_anomalas')),
    voided_by   integer
        REFERENCES users (id) ON DELETE RESTRICT,
    -- 200 en la API: el mismo client_uuid no crea otra medición (único en todo el sistema).
    CONSTRAINT measurements_client_uuid_key UNIQUE (client_uuid),
    -- Una medición está anulada del todo (fecha, motivo y quién) o no lo está.
    CONSTRAINT measurements_void_chk CHECK (
        (voided_at IS NULL) = (void_reason IS NULL) AND (voided_at IS NULL) = (voided_by IS NULL)
    )
);

-- «Última medición válida por punto y fase» (GET /measurements).
CREATE INDEX measurements_point_phase_idx
    ON measurements (point_id, phase, measured_at DESC, id DESC);

-- -----------------------------------------------------------------------------
-- network_readings: las redes de la organización que captó una medición.
-- CASCADE: una lectura no existe sin su medición.
-- Solo se guardan las del SSID de la organización (minimización de datos).
-- -----------------------------------------------------------------------------
CREATE TABLE network_readings (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    measurement_id integer NOT NULL
        REFERENCES measurements (id) ON DELETE CASCADE,
    bssid          varchar(17) NOT NULL
        CHECK (bssid ~ '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$'),
    ssid           varchar(32) NOT NULL,                -- vacío = red oculta
    rssi_dbm       smallint NOT NULL
        CHECK (rssi_dbm BETWEEN -120 AND 0),
    frequency_mhz  integer NOT NULL
        CHECK (frequency_mhz BETWEEN 2400 AND 7125),
    -- Un BSSID una sola vez por medición; su columna líder también sirve para listar las lecturas.
    CONSTRAINT network_readings_measurement_bssid_key UNIQUE (measurement_id, bssid)
);

COMMIT;
