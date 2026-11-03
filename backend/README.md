# Backend — API REST de SignalMap

Servicio del lado del servidor (Hito 2). Stack decidido en el Hito 1: Node.js + Express + TypeScript, con PostgreSQL.

> **Estado:** estructura de carpetas creada; implementación pendiente.

## Capas (`src/`)

| Carpeta | Responsabilidad | Regla |
|---|---|---|
| `middlewares/` | Autenticación (JWT), validación de entrada, manejo de errores | No contiene lógica de negocio |
| `routes/` | Define rutas y verbos HTTP y las conecta a controladores | Solo ruteo |
| `controllers/` | Lee la petición, llama a un servicio y arma la respuesta HTTP con su código de estado | **Sin lógica de negocio** |
| `services/` | Lógica de negocio | No conoce HTTP ni escribe SQL |
| `repositories/` | Acceso a datos | **Las consultas viven solo aquí** |

Flujo de una petición: `route → middleware → controller → service → repository → base de datos`.

## Cómo levantar el servicio
*(Completar con los pasos exactos: requisitos, instalar dependencias, crear la base con `db/`, copiar `.env.example` a `.env`, iniciar. Debe poder seguirse en otro equipo sin adivinar.)*
