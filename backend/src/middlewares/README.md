# middlewares/
Autenticación (JWT), validación de entrada y manejo centralizado de errores. Sin lógica de negocio.

## `error-handler.ts`: errores centralizados

Único lugar donde un error se convierte en respuesta HTTP. Toda respuesta de error es `{ "message": "..." }` (contrato §2).

| Error que llega | Respuesta |
|---|---|
| `AppError` (ver `src/errors.ts`) | El código de su `kind`: `validation` 400 · `unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `domain_rule` 422, con su `message` |
| JSON mal formado (`express.json`) | `400 "JSON mal formado"` |
| Cuerpo mayor a 100 kB | `413 "Cuerpo demasiado grande"` |
| Otro error 4xx del parser (charset o codificación no soportados → `415`, subida cortada → `400`) | Su código, con `"Petición inválida"` |
| Cualquier otro (inesperado) | `500 "Error interno del servidor"`. Al log (`console.error`) van método, ruta y **solo el stack**: ni el objeto entero (un error de pg trae en `detail` valores de la fila, como emails o `nfc_uid`) ni el cuerpo (el login trae la clave) |

`notFound` va después de todas las rutas: ruta o verbo inexistente → `404 "Ruta no encontrada"`.

En `app.ts`, las rutas de la API van **antes** de `notFound` y `errorHandler`.

## `validate.ts`: validación con Zod

Un schema por endpoint, para `params`, `query` y/o `body`:

```ts
router.post('/buildings', validate({ body: createBuildingSchema }), controller.create);
```

Reglas:
1. **Siempre `z.strictObject`**: un campo desconocido → `400` (contrato §1). `z.object` lo ignoraría en silencio. Cada endpoint tiene su test de "campo desconocido".
2. Si algo no pasa → `AppError('validation', …)` → `400` con el mensaje del **primer** problema. Para que coincida con el contrato, cada campo define su mensaje: `z.string({ error: 'name es obligatorio (1 a 100 caracteres)' })` (en Zod 4 ese `error` cubre falta, tipo, largo y formato). Lo no personalizado sale en español (`z.locales.es`).
3. El controller lee `req.params` / `req.query` / `req.body` **ya validados y convertidos** (p. ej. `id` como número). `req.query` se reemplaza con `Object.defineProperty` porque en Express 5 es de solo lectura. Sin cuerpo (o con un Content-Type que no es JSON), el cuerpo se valida como `{}`: el cliente recibe el mensaje del campo que falta.
   - **Tipos:** Express no pasa los tipos de un middleware al handler siguiente, así que el controller declara los suyos desde el schema: `Request<z.output<typeof idParams>, unknown, z.output<typeof createBody>>`. Así `tsc` detecta si el controller y el schema no coinciden.
   - **Ids de ruta y de consulta:** además de "solo dígitos", limitar a `1 … 2147483647` (`integer` de PostgreSQL). Si no, `/points/99999999999` llega a la base y responde `500` en vez de `400`.
4. Orden en la ruta (contrato §2: `401 → 403 → 400`): autenticación y rol **antes** de `validate`.
