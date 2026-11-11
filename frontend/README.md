# Frontend — web de SignalMap

Web del Hito 3 (React + Vite + TypeScript). Inicia sesión contra la API y muestra el piso elegido por edificio, piso y fase (antes/después). Sin librerías de ruteo, estado, UI ni CSS: todo `fetch` vive en `src/api/client.ts`.

## Requisitos
- **Node.js 26** o superior (`node -v`).
- La API del servicio en `http://localhost:3000` con los datos cargados: ver [`backend/README.md`](../backend/README.md).

## Comandos (desde `frontend/`)

| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias |
| `npm run dev` | Servidor de desarrollo en `http://localhost:5173`; redirige `/api` a `:3000`, así que la API debe estar arriba |
| `npm run build` | Revisa los tipos y compila a `dist/` |
| `npm run typecheck` | Revisa los tipos con `tsc` (no genera archivos) |
| `npm run preview` | Sirve `dist/` para revisarlo |

La web no tiene tests automatizados en este hito; el control es `typecheck`, `build` y la prueba a mano.

## Estructura (`src/`)

| Carpeta o archivo | Contenido |
|---|---|
| `api/` | `client.ts` (único `fetch`, errores y `401`), `endpoints.ts` (rutas del contrato), `session.ts` (token en `sessionStorage`), `types.ts` |
| `hooks/useRequest.ts` | Carga con estados de espera y error; ignora respuestas viejas |
| `selection.ts` | Edificio, piso y fase en la URL (`?building_id=1&floor_id=1&phase=antes`): F5 conserva la selección |
| `categories.ts` | Nombre, letra y color de cada categoría (solo presentación; los umbrales viven en el servicio) |
| `components/` | `LoginView`, `FloorView`, `FloorPlan` (plano SVG a escala), `Legend` (leyenda de categorías), `StatusMessage` |
| `styles.css` | Paleta y fuentes del documento técnico (en `assets/fonts/`) |
