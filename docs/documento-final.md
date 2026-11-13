<!-- Borrador de T23: solo las figuras. T24 agrega la tapa, el índice y las secciones, y reubica este material. -->

## Figuras de la arquitectura final

La Figura 1 muestra las tres piezas del sistema y cómo se conectan: la app del técnico y la web consumen la misma API, y esta es la única que habla con la base de datos.

Figura 1. Componentes del sistema: app Android, web y API sobre PostgreSQL

```mermaid
flowchart TB
  subgraph APP["App Android · Kotlin y Compose"]
    direction LR
    UI["ui/"] --> VM["AppViewModel"]
    VM --> DATA["data/<br/>ApiClient · PendingQueue<br/>TagCache · SessionStore"]
    VM --> DEV["device/<br/>NfcReader · WifiScanner<br/>ScanBudget"]
  end
  subgraph WEB["Web · React y Vite"]
    direction LR
    COMP["components/"] --> HOOK["hooks/useRequest"] --> CLIENT["api/<br/>client · endpoints · session"]
  end
  subgraph EXP["Proceso Express · backend/src/"]
    direction LR
    ROUTES["routes/ y middlewares/"] --> CTRL["controllers/"] --> SVC["services/"] --> REPO["repositories/"]
  end
  STATIC["express.static<br/>frontend/dist"]
  DB[("PostgreSQL 17")]
  APP -->|"HTTP + JSON · Bearer JWT"| EXP
  WEB -->|"/api/v1"| EXP
  STATIC -.->|"sirve la web compilada"| WEB
  EXP -->|"SQL parametrizado (pg)"| DB
```

La Figura 2 sigue una medición con conexión, desde que el técnico acerca el teléfono a la tira hasta que la web la muestra en el plano.

Figura 2. Una medición con conexión: de la tira NFC al plano de la web

```mermaid
sequenceDiagram
  autonumber
  participant T as Técnico y tira NFC
  participant A as App (AppViewModel)
  participant API as API (routes, controllers, services)
  participant DB as PostgreSQL
  participant W as Web (api/endpoints.ts)
  T->>A: acerca el teléfono (NfcReader, onTag)
  A->>API: GET /api/v1/points/by-tag/uid
  API->>DB: busca el punto (repositories/points.ts)
  API-->>A: 200 con el punto (404 si la tira no está registrada)
  T->>A: pulsa «Medir WiFi» (measure)
  Note over A: ScanBudget, WifiScanner, client_uuid y measured_at<br/>la medición se guarda en PendingQueue
  A->>API: POST /api/v1/measurements (flush, sendMeasurement)
  Note over API: authenticate, requireRole, validate<br/>services/measurements.create<br/>solo guarda las lecturas del SSID de la organización
  API->>DB: INSERT en measurements y network_readings
  API-->>A: 201 con la categoría (200 si el client_uuid ya existía)
  A-->>T: tarjeta de resultado (se quita de PendingQueue)
  W->>API: GET /api/v1/measurements?floor_id=1&phase=antes
  API-->>W: última medición válida de cada punto
```

La Figura 3 muestra qué ocurre cuando falta la conexión: la medición no se pierde, queda en la cola de la app y se envía después.

Figura 3. Una medición sin conexión: la cola de la app y el reenvío

```mermaid
sequenceDiagram
  autonumber
  participant T as Técnico y tira NFC
  participant A as App (AppViewModel)
  participant Q as PendingQueue
  participant API as API
  T->>A: acerca el teléfono a la tira (onTag)
  A->>API: GET /api/v1/points/by-tag/uid
  API--xA: sin conexión (ApiResult.Offline)
  Note over A: usa TagCache para mostrar el código<br/>la medición lleva el nfc_uid y queda sin pointId
  T->>A: pulsa «Medir WiFi» (measure)
  A->>Q: add(PendingMeasurement) en pending-measurements.json
  A->>API: POST /api/v1/measurements
  API--xA: sin conexión: queda en Pendientes
  Note over A,API: vuelve la red (onAvailable), se abre la app o se pulsa «Enviar ahora»
  A->>API: flush: GET by-tag y luego POST /api/v1/measurements
  API-->>A: 201 (o 200 si el client_uuid ya llegó)
  A->>Q: remove(client_uuid)
```

La Figura 4 muestra las nueve tablas de la base de datos, tal como las crea `db/schema.sql`; es el mismo diagrama de `db/er-diagram.md`.

Figura 4. Modelo de datos: las 9 tablas y sus relaciones

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
    points ||--o{ measurements : "se mide en"
    users ||--o{ measurements : "midio"
    users |o--o{ measurements : "anulo"
    measurements ||--o{ network_readings : "capta"

    organizations {
        integer id PK "identity"
        varchar name "NOT NULL"
        varchar wifi_ssid "NOT NULL, 1-32, nombre exacto de la red de la organizacion"
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
        jsonb outline "contorno real [[x,y],...], 3 o más vértices; NULL = rectángulo"
        varchar plan_url "imagen del plano, /plans/..., NULL = sin imagen"
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

    measurements {
        integer id PK "identity"
        integer point_id FK "NOT NULL"
        integer user_id FK "NOT NULL, quien midio (la API no lo devuelve)"
        varchar phase "NOT NULL: antes, despues"
        uuid client_uuid UK "NOT NULL, lo genera la app"
        timestamptz measured_at "NOT NULL, hora del escaneo o de recepcion"
        timestamptz received_at "NOT NULL, siempre del servidor"
        timestamptz voided_at "NULL si la medicion vale"
        varchar void_reason "NULL o punto_equivocado, fase_equivocada, condiciones_anomalas"
        integer voided_by FK "NULL si la medicion vale"
    }

    network_readings {
        integer id PK "identity"
        integer measurement_id FK "NOT NULL, UK con bssid"
        varchar bssid "NOT NULL, aa:bb:cc:dd:ee:ff en minusculas"
        varchar ssid "NOT NULL, 0-32, vacio = red oculta"
        smallint rssi_dbm "NOT NULL, -120 a 0"
        integer frequency_mhz "NOT NULL, 2400 a 7125"
    }
```
