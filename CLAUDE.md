# CLAUDE.md — SignalMap

Proyecto universitario (Universidad Mayor, Arquitectura de Desarrollo Web y Móvil): app Android + tiras NFC + plataforma web para medir señal WiFi antes/después de instalar un repetidor. Resumen del Hito 1 en el vault de Obsidian (ver abajo).

## Rúbrica del profesor (archivo fijo)

La rúbrica de cada hito es la referencia obligatoria de todo entregable.

- **Ubicación:** vault de Obsidian `Brain-Environment`, carpeta `SignalMap\Rúbricas\`, un archivo por hito (`Hito N - Rúbrica.md`).
- **Ruta:** cambia según el PC. Búscala por el nombre `Brain-Environment\SignalMap\Rúbricas` o usa `/add-dir` con la carpeta del vault. No escribas rutas absolutas del usuario en este archivo.
- **Hito en curso: Hito 2.** Archivo: `Hito 2 - Rúbrica.md`.

Reglas:
1. Antes de planificar, escribir o revisar cualquier entregable (código, informe, prototipo, presentación), **lee la rúbrica del hito en curso completa**.
2. Contrasta el trabajo con cada criterio y señala cuáles cumple, cuáles cumple parcialmente y cuáles faltan. No des por cumplido un criterio sin evidencia.
3. Si el archivo de la rúbrica no existe, no se puede leer, o tiene `estado: pendiente`, **avisa y pide la rúbrica**; no la inventes ni trabajes suponiéndola.
4. La rúbrica es material privado del curso: **no copies su contenido al repositorio** (que puede ser visible para otros). Dentro del repo solo se referencia su ubicación.
5. Cuando el usuario cambie de hito, actualiza la línea "Hito en curso" de este archivo.

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
- Al empezar: `git pull`. Al terminar: `git commit` + `git push`. Commits pequeños y frecuentes.
- Evita editar el mismo archivo en ambos equipos sin sincronizar; usa ramas para trabajo en paralelo con el compañero.
- Los archivos ignorados (`.env`, configuración local) no viajan por git: se recrean en cada equipo desde `.env.example`.
- El vault de Obsidian está fuera de git y se sincroniza aparte.

## Otras convenciones
- Toda skill nueva se documenta en `Skills/README.md` en el mismo commit que la agrega.
- No hagas commit ni push sin que el usuario lo pida.
