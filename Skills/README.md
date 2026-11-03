# Skills

Este apartado documenta las *skills* de Claude Code que usa el proyecto SignalMap: qué son, cuáles están instaladas, qué hacen y bajo qué condiciones se usan.

Una skill es un archivo `SKILL.md` con instrucciones que Claude Code carga para guiar su comportamiento en cierto tipo de tarea. Las skills del proyecto viven en [`.claude/skills/`](../.claude/skills/) y quedan disponibles para quien clone el repositorio.

## Skills instaladas

| Skill | Archivo | Origen | Licencia |
|---|---|---|---|
| `karpathy-guidelines` | [`.claude/skills/karpathy-guidelines/SKILL.md`](../.claude/skills/karpathy-guidelines/SKILL.md) | [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills), basado en observaciones de Andrej Karpathy sobre errores comunes de los LLM al programar | MIT |

## `karpathy-guidelines`

Reglas de comportamiento para reducir errores típicos de un asistente de IA al escribir, revisar o refactorizar código. Se aplica cuando se trabaja código. Sus cuatro principios:

1. **Pensar antes de codificar.** Declarar suposiciones, presentar las alternativas cuando hay ambigüedad en vez de elegir en silencio, y preguntar si algo no está claro.
2. **Simplicidad primero.** El mínimo código que resuelve el problema: sin funciones no pedidas, sin abstracciones para un solo uso, sin configurabilidad innecesaria.
3. **Cambios quirúrgicos.** Tocar solo lo necesario, respetar el estilo existente y no "mejorar" código vecino. Cada línea modificada debe tener relación con lo pedido.
4. **Ejecución guiada por metas.** Convertir las tareas en criterios verificables (por ejemplo, escribir un test que reproduzca el bug y hacerlo pasar) y avanzar con un plan corto con verificación en cada paso.

Compromiso declarado por la propia skill: prioriza la cautela sobre la velocidad. En tareas triviales se usa criterio.

**Por qué en este proyecto:** SignalMap tendrá un backend, una app Android y una web que se desarrollan entre dos personas (Hitos 2 y 3). Estas reglas buscan diffs pequeños y revisables, menos reescrituras y preguntas antes de implementar, no después.

## Declaración de uso de skills

- Este proyecto usa **Claude Code** como asistente de desarrollo y documentación, apoyado en las skills listadas arriba.
- Las skills no ejecutan código ni acceden a datos por sí mismas: solo añaden instrucciones de comportamiento al asistente.
- Las skills que usa el proyecto están versionadas en este repositorio, en `.claude/skills/`. Toda skill nueva debe agregarse a este documento (nombre, origen, licencia y propósito) en el mismo commit que la incorpora.
- Las skills de terceros se usan conservando su atribución y licencia. El contenido de `karpathy-guidelines` es de sus autores originales y se distribuye bajo licencia MIT.
- El contenido generado con ayuda del asistente es revisado por el equipo antes de integrarse; la responsabilidad del código y los documentos entregados es de los integrantes del equipo.
- Las skills personales de cada integrante (instaladas en su carpeta de usuario `~/.claude/skills/`) no forman parte del repositorio y no se consideran parte de la declaración, salvo que se agreguen aquí.
