# SignalMap · Hito 2 — Motor back-end y API REST

**Documento técnico** · Universidad Mayor, Facultad de Ciencias, Ingeniería y Tecnología · Arquitectura de Desarrollo (Web y Móvil) · Docente: Carlos Mauricio Muñoz
**Equipo:** Maximiliano Alvarado (`Signali`) · Gabriel Díaz (`Gabo-collab`) · Santiago, noviembre de 2026
**Repositorio:** https://github.com/Signali/MapeoWifiSignal

<!-- BORRADOR. Secciones marcadas «Pendiente» todavía no se escriben. -->

## Resumen

*Pendiente: se escribe al final, cuando el resto esté cerrado.*

---

## 1. Introducción y alcance

El Hito 1 planteó el problema: las empresas que instalan o amplían su red WiFi no saben con certeza si la señal llega a cada puesto ni si el repetidor que agregan funciona. SignalMap lo resuelve con tiras NFC en puntos fijos del edificio, una app Android que mide la señal en esos puntos y una plataforma web que muestra el resultado antes y después de instalar el repetidor.

Este documento cubre **solo el servidor**: la API REST que esas dos aplicaciones van a usar, sus capas y la base de datos. La app y la web no se construyen en este hito.

| Qué entrega el Hito 2 | Detalle |
|---|---|
| Recursos con CRUD completo | Edificios y puntos de medición |
| Lectura | Pisos (se cargan por seed) |
| Autenticación | Login con JWT; tres roles: `admin`, `tecnico`, `cliente` |
| Interfaz | 13 endpoints bajo `/api/v1` (contrato completo en el Anexo A) |
| Persistencia | PostgreSQL 17, 7 tablas, script que crea la base desde cero |
| Ejecución | Node.js 26 + Express + TypeScript; se levanta con el README en otro equipo |

```mermaid
flowchart LR
  C["Cliente HTTP<br/>(hoy Postman · Hito 3: app y web)"] -->|"HTTP + JSON<br/>Bearer JWT"| A["API REST SignalMap<br/>Node.js · Express · TypeScript"]
  A -->|"SQL parametrizado"| D[("PostgreSQL 17")]
```

**Fuera de alcance en este hito:** campañas y mediciones, mapa de calor, comparación antes/después, trilateración, recomendación del repetidor, reporte PDF, app Android y web. Todo eso queda para el Hito 3 (sección 2).

---

## 2. Qué cambió desde el Hito 1

El Hito 1 fijó la arquitectura y el plan; al construir el servidor se ajustaron cosas. Esta sección dice qué se mantuvo, qué cambió y qué se movió al Hito 3, con su motivo y su efecto.

### 2.1 Lo que se mantiene

| Decisión del Hito 1 | Estado |
|---|---|
| Un solo back-end para la app y la web (cliente-servidor multicapa) | Se mantiene: monolito en capas (sección 3) |
| Node.js + Express + TypeScript, con Zod en cada endpoint | Se mantiene |
| PostgreSQL relacional, con la jerarquía organización → edificio → piso → punto | Se mantiene |
| Tres roles (técnico, administrador, cliente final) y JWT | Se mantiene |
| `nfc_uid` único por punto | Se mantiene, y ahora es único en todo el sistema |

### 2.2 Lo que cambió

| Hito 1 decía | Hito 2 tiene | Motivo | Efecto |
|---|---|---|---|
| Capas: middlewares, rutas y controladores juntos, servicios, repositorios (4 niveles) | 5 carpetas: `routes`, `controllers`, `services`, `repositories`, `middlewares`, más `schemas` (Zod) | Separar ruta y controlador deja ver que el controlador no tiene lógica de negocio | Cada regla de capa se revisa por archivo (sección 3) |
| Modelo de 9 entidades | 7 tablas: se agregan `email_domains` y `user_buildings` | El email se guarda partido (sin repetir el dominio) · el cliente ve solo los edificios que tiene asignados | El acceso del cliente se decide en la base, no en el token |
| Piso con «plano y dimensiones de grilla» | Piso con `width_m` y `height_m` (metros), sin imagen | No hay subida de planos en este hito | Un punto fuera del piso responde `422` |
| Punto con `x`, `y`, `nfc_uid` | Se agrega `code` (ej. `P-07`), único por piso; `nfc_uid` en hexadecimal y en mayúsculas | Identificar el punto en terreno y evitar duplicados por formato (`04a2…` = `04A2…`) | Un duplicado responde `409` |
| Errores con código propio (`404 TAG_UNKNOWN`, `409 CAMPAIGN_CLOSED`) | Código HTTP + `{ "message": "..." }` | Simplificar: el código HTTP ya dice la clase de error y el mensaje la explica | Un solo formato en toda la API. Queda abierto sumar un campo `code` con nombre junto a `message` si la app necesita distinguir dos errores con el mismo código HTTP; agregar un campo no rompe a quien solo lee `message` |
| Token vencido: `401` y renovación automática | `401` sin renovación; duración por rol (admin 8 h, técnico 10 h, cliente 2 h) | Autenticación mínima en este hito | El cliente vuelve a hacer login al vencer |
| JWT (sin detalle) | HS256 implementado con `node:crypto`, sin librería | Cero dependencias nuevas para la pieza más sensible | La verificación es nuestra: tests para cada ataque conocido (sección 6) |
| Rutas `GET /points/by-tag/:nfcUid` y `POST /measurements` | Rutas bajo `/api/v1`, todo en `snake_case`; esas dos no existen todavía | Las usa la app al medir, que es del Hito 3 | El contrato las lista como próximas |

### 2.3 Lo que se posterga

| Planteado en el Hito 1 | Ahora | Motivo | Condición para retomarlo |
|---|---|---|---|
| Ingesta real de mediciones y app con NFC y WiFi reales (ubicadas en el Hito 2) | Hito 3 | El Hito 2 se acota al servidor y su API | Contrato de campañas y mediciones acordado antes de programar |
| PostGIS (el Hito 1 la declaraba «para implementar en el Hito 2») | Hito 3, con condición | Ninguna consulta de este hito la necesita; el propio Hito 1 reconocía que no es imprescindible con ~24 puntos por piso | Se instala solo si se escribe la consulta espacial que la exige; si no, se documenta que no hace falta |
| Volumen de planos en Docker (en la arquitectura, sin hito) | Hito 3 | Sin planos ni Docker en este hito; la base corre nativa | El servicio ya está preparado: configuración por variables de entorno, escucha en `0.0.0.0` y `GET /health` |
| Gestión de usuarios por el administrador (`/admin/users`, en el mapa del producto) | Sin fecha | No es uno de los recursos de este hito; los 3 usuarios de prueba salen del seed | Se decide al planificar el Hito 3 |

---

## 3. Arquitectura: monolito en capas

Un solo servicio (Node.js + Express + TypeScript, unas 1.000 líneas en `backend/src/`) y una sola base PostgreSQL. Por dentro, cada petición atraviesa capas con una responsabilidad cada una; ninguna capa salta a otra que no le corresponde.

### 3.1 Las capas y su regla

| Capa (`backend/src/`) | Hace | No puede | Cómo se comprobó |
|---|---|---|---|
| `routes/` | Asocia verbo y ruta con la cadena de middlewares y el controlador | Tener lógica | Revisión: cada archivo es una lista de rutas |
| `middlewares/` | Token (`authenticate`), rol (`requireRole`), formato (`validate` con Zod), traducción de errores a HTTP | Reglas de negocio | Revisión de código |
| `schemas/` | Forma de la entrada y normalización (`code` a mayúsculas, `nfc_uid` hexadecimal) | Consultar la base | No importa nada de `repositories/` |
| `controllers/` | Lee la petición ya validada, llama a un servicio y elige el código de éxito | Lógica de negocio · acceso a datos | Ningún controlador importa `repositories/` |
| `services/` | Reglas de negocio: qué puede ver cada rol, punto dentro del piso, «no existe» | Conocer HTTP · escribir SQL | Ningún servicio importa `express` ni usa `res` · lanzan `AppError(tipo, mensaje)`, sin códigos HTTP |
| `repositories/` | SQL parametrizado; traduce un duplicado de la base a conflicto | Decidir permisos | **Todo el SQL del servicio está aquí**: fuera de esta carpeta no hay ninguna consulta |

Las comprobaciones de la última columna que no dicen «revisión» se hicieron con búsquedas sobre el código (resultado: cero casos), no por lectura.

Dos piezas cruzan todas las capas: `errors.ts` define seis tipos de error de negocio (`validation`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `domain_rule`) y `middlewares/error-handler.ts` es el **único lugar** que los convierte en código HTTP (`400`, `401`, `403`, `404`, `409`, `422`). Por eso ningún error puede salir con `200`.

### 3.2 Una petición de punta a punta: `POST /api/v1/points`

Es la primera petición de la demostración. Cada capa responde una pregunta y, si la respuesta es «no», corta con su código:

```mermaid
sequenceDiagram
  participant C as Cliente
  participant R as routes + middlewares
  participant Ct as controller
  participant S as service
  participant Rp as repository
  participant DB as PostgreSQL
  C->>R: POST /api/v1/points + Bearer
  Note over R: ¿token válido? → 401<br/>¿rol admin o tecnico? → 403<br/>¿cuerpo con el formato? → 400
  R->>Ct: cuerpo validado y normalizado
  Ct->>S: create(usuario, punto)
  S->>Rp: ¿el piso existe y lo ve este usuario?
  Rp->>DB: SELECT (filtrado por organización)
  Note over S: no lo ve → 404<br/>x, y fuera del piso → 422
  S->>Rp: create(punto)
  Rp->>DB: INSERT … RETURNING
  Note over Rp: code o nfc_uid repetido → 409
  Rp-->>Ct: punto creado
  Ct-->>C: 201 + Location: /api/v1/points/25
```

El controlador de esa petición (`controllers/points.ts`, sin las anotaciones de tipo) tiene dos líneas y ninguna decisión:

```ts
export async function create(req, res) {
  const point = await pointsService.create(req.user!, req.body);
  res.status(201).location(`${req.baseUrl}/${point.id}`).json(point);
}
```

El orden de las preguntas es deliberado: un punto fuera del piso y además duplicado responde `422`, porque el servicio valida antes de escribir. El contrato fija ese orden (`401 → 403 → 400 → 404 → 422 → 409`).

### 3.3 Monolito o distribuido

Se eligió **monolito en capas**. Para entender el costo de cada opción se consultó a Fowler (2015), que observa que los sistemas de microservicios exitosos casi siempre empezaron como un monolito que se dividió después, cuando los límites entre servicios ya estaban claros. La decisión, sin embargo, se apoya en los datos de este proyecto:

| Criterio | Situación de SignalMap | Qué implica |
|---|---|---|
| Tamaño del equipo | 2 personas, un semestre | Varios servicios multiplican despliegue, configuración y depuración para las mismas dos personas |
| Carga esperada | ~24 puntos por piso; el técnico mide un punto a la vez y Android limita a 4 escaneos WiFi cada 2 minutos (Hito 1, §8.2) | No hay una parte del sistema que necesite escalar por separado |
| Costo de operación | Hoy: un proceso Node y una base. Hito 3: dos contenedores (API y PostgreSQL) | Un solo servicio que vigilar, con un solo `GET /health` |
| Complejidad de despliegue | Se levanta en otro equipo siguiendo un README | Con servicios separados habría que coordinar versiones y una red entre ellos |

Hay un quinto argumento propio del dominio: los datos son una jerarquía con integridad referencial (organización → edificio → piso → punto, y en el Hito 3 campaña → medición). Repartirlos entre servicios con bases distintas obligaría a garantizar esa integridad por código, que es justo lo que se eligió PostgreSQL para no hacer.

**Costo asumido:** todo escala junto y un error grave puede tumbar el servicio entero. Se acepta porque la carga es baja.

**Cuándo se revisaría:** si el análisis del Hito 3 (mapa de calor, trilateración) consumiera tanta CPU que retrasara el registro de mediciones, o si se sumaran muchas organizaciones con carga simultánea. En ese caso, lo primero que se separaría es el módulo de análisis, porque solo lee datos.

## 4. Diseño de la API REST
*Pendiente.* Convenciones, tabla de los 13 endpoints, códigos de error y permisos por rol.

## 5. Datos y persistencia
*Pendiente.* Modelo de 7 tablas, borrado, qué garantiza la base y qué el servicio.

## 6. Configuración, credenciales y seguridad
*Pendiente.* Variables de entorno, manejo de secretos, JWT y portabilidad.

## 7. Decisiones de tecnología
*Pendiente.* Fichas: Express, `pg` sin ORM, JWT propio, PostgreSQL nativo, Vitest.

## 8. Calidad, riesgos y deuda técnica
*Pendiente.* Pruebas, CI, revisiones, y lo que queda pendiente con su plan.

## Referencias
*Pendiente: solo fuentes citadas y verificadas.*

## Anexos
*Pendiente.* A: contrato de la API · B: modelo de datos y script · C: instalación.
