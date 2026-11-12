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
| `categories.ts` | Nombre, letra, color (variable de tema) y umbral de texto de cada categoría (solo presentación; el cálculo vive en el servicio, y el texto de los umbrales repite a mano `backend/src/services/signal-category.ts`) |
| `theme.ts` | Tema claro u oscuro: sigue al sistema y el botón del encabezado guarda la elección en el navegador |
| `components/` | `LoginView`, `FloorView` (cabecera y pantalla del piso), `FloorPlan` (plano SVG a escala, con ejes en metros), `PhaseSwitch` (antes o después), `Legend` (leyenda con umbrales), `Summary` (cobertura buena y zonas débiles), `PointChips` (elegir un punto), `PointDetail` (detalle de un punto; Escape lo cierra), `AnalysisPanel`, `ThemeToggle`, `StatusMessage` |
| `styles.css` | Paleta «aurora» del documento técnico en tema claro y oscuro, con Lexend (texto), Bricolage Grotesque (títulos) y JetBrains Mono (códigos), autoalojadas en `assets/fonts/` |
