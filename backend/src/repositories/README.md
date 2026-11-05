# repositories/
Acceso a datos. **Las consultas a la base de datos viven solo en esta capa.**

## Regla: `numeric` se convierte en un solo lugar

El driver `pg` devuelve las columnas `numeric` (`x`, `y`, `width_m`, `height_m`) como texto (`"12.50"`). El contrato de la API exige números (`12.5`).

1. **Un único type parser global**, registrado en el módulo que crea el pool de conexiones, antes de la primera consulta:
   ```ts
   import pg from 'pg';
   pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
   ```
2. **Prohibido convertir a mano** en repositorios, servicios o controladores (`parseFloat`, `Number(row.x)`, `+row.x`). Si hace falta convertir, el parser no se cargó: se arregla el parser, no el síntoma.
3. **Test de control obligatorio** (Vitest, contra `signalmap_test`): lee de `information_schema.columns` **todas** las columnas `numeric` del esquema y comprueba que cada una llega como `typeof === 'number'`. Así, una columna `numeric` nueva queda cubierta sin tocar el test, y si alguien quita el parser el test falla.

Alcance: el parser es global (afecta a todo `numeric`). Con `numeric(7,2)` la conversión a `number` es exacta para lo que muestra la API; si en el Hito 3 aparecen sumas o promedios grandes en `numeric`, se revisa esta regla.
