# SignalMap

**SignalMap mide con NFC la señal WiFi punto por punto, la muestra en el plano de cada piso y estima cómo quedaría la cobertura al instalar un repetidor.**

## Integrantes
Orden alfabético por apellido.

| Integrante | Usuario de GitHub |
|---|---|
| Maximiliano Alvarado | [@Signali](https://github.com/Signali) |
| Gabriel Díaz | [@Gabo-collab](https://github.com/Gabo-collab) |

## Informes
- Documento final del Hito 3 (PDF): se publica en `docs/` el 16/11.
- [Documento técnico del Hito 2 (PDF)](docs/SignalMap-Hito2-Documento-Tecnico.pdf) · fuente: [`docs/documento-tecnico.md`](docs/documento-tecnico.md)
- [Contrato de la API](docs/api-contract.md)
- [Informe Hito 1](https://www.figma.com/make/GeF2PReF8GgNYtE66CsW4b/Informe-Hito-1-SignalMap?t=2NkAt4R6hcLpgEdY-20&fullscreen=1&preview-route=%2F%23s3)
- [Informe Hito 1 en PDF](https://acrobat.adobe.com/id/urn:aaid:sc:US:3780a647-8e7f-4e54-949e-dcd4983e6c32) · [SignalMapH1-V3.pdf](https://github.com/user-attachments/files/33674569/SignalMapH1-V3.pdf)

## Video y presentación
- Video promocional (2 minutos): se publica el 15/11.
- [Presentación Hito 1](https://www.figma.com/make/FIy60xlOH9mtFJnlq3qHQC/Presentaci%C3%B3n-comercial-t%C3%A9cnica?t=Lktr7tHhvJ8Ct3oH-20&fullscreen=1)

## Interfaz y prototipo (Figma)
A continuación podrá visualizar el primer prototipo:
- [Prototipo versión 1.0](https://www.figma.com/make/DSvQteygbvInD0FsngpKSB/Prototipo-navegable-SignalMap?t=dhTFBYDAmpXw2Hxb-20&fullscreen=1)

## Instalación (resumen)
Manual completo, con datos de prueba y fallas frecuentes: [`docs/manual.md`](docs/manual.md).

1. **Requisitos:** **Node.js 26 o superior** (fijado en `backend/.nvmrc`) y **PostgreSQL 17 o superior**. Para la app: teléfono Android 10 o superior con NFC y `adb` instalado.
2. **Base de datos:** crear el rol y las bases, y cargar las tablas: [`db/README.md`](db/README.md), pasos 1 a 3.
3. **`.env`:** copiar `.env.example` y completar las claves, incluida `SEED_WIFI_SSID` (nombre exacto de la red WiFi que se mide); ver la siguiente sección.
4. **Datos de prueba:** `cd backend`, `npm install` y `npm run seed`.
5. **Web:** `cd ../frontend`, `npm install` y `npm run build`.
6. **Servicio:** `cd ../backend` y `npm start`. Un solo proceso sirve la web y la API: abrir `http://localhost:3000/` (y `/health` para comprobar). Detalle y solución de problemas: [`backend/README.md`](backend/README.md).
7. **App Android:** instalar el APK de depuración (el del [Release más reciente](https://github.com/Signali/MapeoWifiSignal/releases)) o compilarlo: [`android/README.md`](android/README.md).
8. **Conectar el teléfono:** con el cable USB, `adb reverse tcp:3000 tcp:3000`; la app trae por defecto el servidor `http://127.0.0.1:3000`. Para usarla por WiFi, sin cable, el servicio habla HTTPS: [`backend/README.md`](backend/README.md), sección *HTTPS*.

Para probar solo la API con Postman: [`postman/README.md`](postman/README.md).

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
   | `SEED_WIFI_SSID` | Nombre exacto de la red WiFi que se mide (distingue mayúsculas); el seed solo guarda sus lecturas. En la demo, la red de la sala |
   | `SEED_ADMIN_PASSWORD`, `SEED_TECNICO_PASSWORD`, `SEED_CLIENTE_PASSWORD` | Claves que elijas para los tres usuarios de prueba (`admin@demo.cl`, `tecnico@demo.cl`, `cliente@demo.cl`). Son las que se usan para el login, también en Postman |

3. Guardar sin comillas ni espacios alrededor del `=` (`DB_PASSWORD=miClave`). Si falta o está mal una variable, el servicio no arranca y dice cuál es.
4. Si cambias una clave `SEED_*` después de haber corrido el seed, volver a correr `npm run seed`: la base guarda el hash de la clave que había en ese momento.

Nunca subir el `.env` ni escribir claves reales en `.env.example`, en el README ni en un commit.

## Estructura del repositorio
| Carpeta / archivo | Contenido |
|---|---|
| [`backend/`](backend/README.md) | Código del servicio (API REST) en capas e instrucciones para levantarlo |
| [`docs/`](docs/README.md) | Documento técnico (PDF) y tabla de la API |
| [`db/`](db/README.md) | Modelo de datos y script de creación de la base de datos |
| [`postman/`](postman/README.md) | Colección del cliente de pruebas |
| [`android/`](android/README.md) | App Android del técnico (Kotlin + Compose) |
| [`frontend/`](frontend/README.md) | Web (React + Vite + TypeScript) |
| `.env.example` | Variables de configuración de ejemplo (sin datos reales) |
| [`LICENSE`](LICENSE) | Licencia MIT del proyecto |
| [`Skills/`](Skills/README.md) | Skills de Claude Code usadas y declaración de uso |

## Skills
Skills de Claude Code usadas en el proyecto y declaración de uso: [Skills](Skills/README.md)
