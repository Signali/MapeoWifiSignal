# docs/

Documentación entregable del proyecto.

## Contenido esperado (Hito 2)
- **Documento técnico del back-end** en PDF (máximo 30 páginas sin anexos), con la sección de cambios respecto al Hito 1.
- **Tabla de la API**: rutas, verbos, parámetros, cuerpo de ejemplo y códigos de estado de éxito y de error. También va dentro del documento.

## Archivos
- [`manual.md`](manual.md) — manual de uso e instalación (Hito 3): requisitos, pasos, usuarios y datos de prueba, recorrido y fallas frecuentes. Las capturas están en `img/`.
- [`api-contract.md`](api-contract.md) — contrato de la API (tabla de endpoints, ejemplos y errores). Acordado entre los integrantes (2026-11-04).
- [`documento-tecnico.md`](documento-tecnico.md) — fuente del documento técnico (Markdown). El PDF se genera desde acá.
- [`build-pdf.mjs`](build-pdf.mjs) — genera el PDF: `node docs/build-pdf.mjs` (o `node docs/build-pdf.mjs otra-ruta.pdf`). No usa dependencias del repo, pero necesita Edge o Chrome instalado e **internet**: marked y mermaid se cargan de jsDelivr, con versión fija, y las fuentes (Bricolage Grotesque, IBM Plex Sans y JetBrains Mono) de Google Fonts.
- [`SignalMap-Hito2-Documento-Tecnico.pdf`](SignalMap-Hito2-Documento-Tecnico.pdf) — el documento técnico en PDF.
- [`presentacion/presentacion.html`](presentacion/presentacion.html) — presentación de 7 minutos (8 diapositivas). Se abre en el navegador, sin internet; hay que llevar la carpeta `presentacion/fonts/` junto al archivo. `?` muestra los atajos y `P` abre la ventana del presentador con las notas y el cronómetro.

> **Estado:** contrato acordado, documento técnico y PDF en el repositorio.
