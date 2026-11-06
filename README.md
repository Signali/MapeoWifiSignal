# MapeoWifiSignal

[SignalMapH1-V3.pdf](https://github.com/user-attachments/files/33674569/SignalMapH1-V3.pdf)

## Informe
- [Informe Hito 1](https://www.figma.com/make/GeF2PReF8GgNYtE66CsW4b/Informe-Hito-1-SignalMap?t=2NkAt4R6hcLpgEdY-20&fullscreen=1&preview-route=%2F%23s3)
- [Formato PDF](https://acrobat.adobe.com/id/urn:aaid:sc:US:3780a647-8e7f-4e54-949e-dcd4983e6c32)

## Presentacion
- [Presentación Hito 1 ](https://www.figma.com/make/FIy60xlOH9mtFJnlq3qHQC/Presentaci%C3%B3n-comercial-t%C3%A9cnica?t=Lktr7tHhvJ8Ct3oH-20&fullscreen=1)
## Interfaz y Prototipo (Figma)
A continuacion podra vizualizar el primer prototipo
- [Prototipo Version 1.0](https://www.figma.com/make/DSvQteygbvInD0FsngpKSB/Prototipo-navegable-SignalMap?t=dhTFBYDAmpXw2Hxb-20&fullscreen=1)

## Cómo levantar el back-end desde cero (Hito 2)
1. Instalar **Node.js 26 o superior** y **PostgreSQL 17 o superior** (versión de Node fijada en `backend/.nvmrc`).
2. Crear el rol y las bases, y cargar las tablas: [`db/README.md`](db/README.md), pasos 1 a 3.
3. Crear el `.env` (ver la siguiente sección).
4. `cd backend`, `npm install`, `npm run seed`, `npm start`, y abrir `http://localhost:3000/health`. Detalle y solución de problemas: [`backend/README.md`](backend/README.md).
5. Probar la API con la colección de Postman: [`postman/README.md`](postman/README.md). Contrato de la API: [`docs/api-contract.md`](docs/api-contract.md).

### Cómo crear el `.env`
El `.env` guarda las claves y la configuración de **tu** equipo. No viaja por git (está en `.gitignore`) y **cada persona crea el suyo**: no se comparte ni se manda por chat o correo.

1. En la raíz del repositorio, copiar la plantilla:
   ```bash
   cp .env.example .env
   ```
   En PowerShell: `Copy-Item .env.example .env`.
2. Abrir `.env` y cambiar solo estas variables (las demás se dejan como están):

   | Variable | Qué poner |
   |---|---|
   | `DB_PASSWORD` | La clave que elegiste para `signalmap_user` en `\password signalmap_user` (paso 2, [`db/README.md`](db/README.md)). Tiene que ser la misma |
   | `JWT_SECRET` | Un secreto propio de **al menos 32 caracteres**. Generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` y pegar el resultado. El servicio no arranca con el valor de ejemplo |
   | `SEED_ADMIN_PASSWORD`, `SEED_TECNICO_PASSWORD`, `SEED_CLIENTE_PASSWORD` | Claves que elijas para los tres usuarios de prueba (`admin@demo.cl`, `tecnico@demo.cl`, `cliente@demo.cl`). Son las que se usan para el login, también en Postman |

3. Guardar sin comillas ni espacios alrededor del `=` (`DB_PASSWORD=miClave`). Si falta o está mal una variable, el servicio no arranca y dice cuál es.
4. Si cambiás una clave `SEED_*` después de haber corrido el seed, volver a correr `npm run seed`: la base guarda el hash de la clave que había en ese momento.

Nunca subir el `.env` ni escribir claves reales en `.env.example`, en el README ni en un commit.

## Estructura del repositorio
| Carpeta / archivo | Contenido |
|---|---|
| [`backend/`](backend/README.md) | Código del servicio (API REST) en capas e instrucciones para levantarlo |
| [`docs/`](docs/README.md) | Documento técnico (PDF) y tabla de la API |
| [`db/`](db/README.md) | Modelo de datos y script de creación de la base de datos |
| [`postman/`](postman/README.md) | Colección del cliente de pruebas |
| `.env.example` | Variables de configuración de ejemplo (sin datos reales) |
| [`Skills/`](Skills/README.md) | Skills de Claude Code usadas y declaración de uso |

## Skills
Skills de Claude Code usadas en el proyecto y declaración de uso: [Skills](Skills/README.md)
