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

## Regla: aislamiento por organización

Toda consulta de un recurso lleva `org_id = <org del token>` en el `WHERE` (pisos y puntos llegan a la org por `JOIN` con `buildings`). Un `UPDATE`/`DELETE` filtra por `id` **y** `org_id` en la misma sentencia y usa `RETURNING`/`rowCount`: si no hay fila, el service responde `404`, sin una lectura previa que abra una carrera. Las lecturas reciben un `ReadScope` (`{ orgId, assignedTo }`) que arma el service. Si `assignedTo` no es `null`, se suma un `EXISTS` sobre `user_buildings`; el `org_id` se exige igual, así que una asignación a un edificio de otra organización no lo hace visible. Las columnas devueltas se listan a mano: nunca `SELECT *` ni `org_id` en la respuesta.

## Regla: conflictos de la base → `409` en un solo lugar

Los repositorios consultan con `query()` de `db.ts`, no con `pool.query`. `query()` traduce una violación `23505` (duplicado) o `23503` (FK) a `AppError('conflict', mensaje)` si la constraint está en el mapa `CONFLICTS`:

| Constraint | Mensaje |
|---|---|
| `buildings_org_name_key` | Ya existe un edificio con ese nombre |
| `floors_building_id_fkey` | No se puede borrar: el edificio tiene pisos asociados |

El mapa usa solo el nombre de la constraint. Una FK da `23503` tanto al borrar el padre como al insertar un hijo con un padre inexistente, así que **solo se mapea una FK cuyo único caso posible por la API sea borrar el padre** (hoy `floors_building_id_fkey`: los pisos no se crean por la API). Para un hijo que sí se crea (p. ej. `points.floor_id`), el service comprueba antes que el padre exista y sea visible (`404`), y la FK no va al mapa.

Una constraint que no está en el mapa sigue siendo un error inesperado (`500`, detalle en el log). Cuando un recurso nuevo tenga un conflicto en el contrato (p. ej. `nfc_uid` de puntos), se agrega su fila aquí y en el mapa.

## Alcance del parser de `numeric`

El parser es global (afecta a todo `numeric`). Con `numeric(7,2)` la conversión a `number` es exacta para lo que muestra la API; si en el Hito 3 aparecen sumas o promedios grandes en `numeric`, se revisa esta regla.
