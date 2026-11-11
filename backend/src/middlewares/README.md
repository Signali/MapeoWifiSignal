# middlewares/
Autenticación (JWT), validación de entrada y manejo centralizado de errores. Sin lógica de negocio.

## `error-handler.ts`: errores centralizados

Único lugar donde un error se convierte en respuesta HTTP. Toda respuesta de error es `{ "message": "..." }` (contrato §2).

| Error que llega | Respuesta |
|---|---|
| `AppError` (ver `src/errors.ts`) | El código de su `kind`: `validation` 400 · `unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `domain_rule` 422, con su `message`. Todo `401` lleva además `WWW-Authenticate: Bearer` (RFC 9110 §15.5.2) |
| JSON mal formado (`express.json`) | `400 "JSON mal formado"` |
| Cuerpo mayor a 100 kB | `413 "Cuerpo demasiado grande"` |
| `URIError` del router con `status 400` (parámetro de ruta con escape inválido, `/buildings/%ZZ`; ocurre antes de `authenticate`) | `400 "Petición inválida"` |
| Otro error 4xx del parser (charset o codificación no soportados → `415`, subida cortada → `400`) | Su código, con `"Petición inválida"` |
| Cualquier otro (inesperado) | `500 "Error interno del servidor"`. Al log (`console.error`) van método, ruta y **solo el stack**: ni el objeto entero (un error de pg trae en `detail` valores de la fila, como emails o `nfc_uid`) ni el cuerpo (el login trae la clave) |

`notFound` va después de todas las rutas: ruta o verbo inexistente → `404 "Ruta no encontrada"`.

En `app.ts`, las rutas de la API van **antes** de `notFound` y `errorHandler`. Después de ellas, `app.use('/api', notFound)` mantiene el `404` JSON de todo `/api` sin ruta y luego `express.static` sirve la web compilada.

## `validate.ts`: validación con Zod

Un schema por endpoint, para `params`, `query` y/o `body`:

```ts
router.post('/buildings', validate({ body: createBuildingSchema }), controller.create);
```

Reglas:
1. **Siempre `z.strictObject`**: un campo desconocido → `400` (contrato §1). `z.object` lo ignoraría en silencio. Cada endpoint tiene su test de "campo desconocido".
2. Si algo no pasa → `AppError('validation', …)` → `400` con el mensaje del **primer** problema. Para que coincida con el contrato, cada campo define su mensaje: `z.string({ error: 'name es obligatorio (1 a 100 caracteres)' })` (en Zod 4 ese `error` cubre falta, tipo, largo y formato). Lo no personalizado sale en español (`z.locales.es`).
3. El controller lee `req.params` / `req.query` / `req.body` **ya validados y convertidos** (p. ej. `id` como número). `req.query` se reemplaza con `Object.defineProperty` porque en Express 5 es de solo lectura. Sin cuerpo (o con un Content-Type que no es JSON), el cuerpo se valida como `{}`: el cliente recibe el mensaje del campo que falta.
   - **Tipos:** Express no pasa los tipos de un middleware al handler siguiente, así que el controller declara los suyos desde el schema: `Request<unknown, unknown, z.output<typeof buildingBody>>`. Así `tsc` detecta si el controller y el schema no coinciden.
   - **Excepción, parámetros de ruta:** Express deduce el tipo de `:id` del texto de la ruta (`{ id: string }`) y `tsc` rechaza declararlo `number` en el handler. Lo mismo pasa con `req.query` (siempre texto). El controller los lee con `idOf(req)` y `queryIdOf(req, name)` de `controllers/params.ts`, que comprueban en ejecución que el valor ya sea número (`500` si la ruta olvidó `validate`).
   - **Ids de ruta y de consulta:** además de "solo dígitos", limitar a `1 … 2147483647` (`integer` de PostgreSQL). Si no, `/points/99999999999` llega a la base y responde `500` en vez de `400`. Ya está hecho para `:id`: `idParams` en `schemas/common.ts`.
   - **Rutas sin parámetros de consulta:** `validate({ query: noQuery })` (`schemas/common.ts`), así `?org_id=2` → `400` (contrato §1).
   - **Texto libre que va a la base:** rechazar caracteres de control. PostgreSQL no acepta `\u0000` (error `22021`) y respondería `500`. En edificios lo cubre la lista de caracteres permitidos de `name`; en puntos, la de `code` y el formato hexadecimal de `nfc_uid`.
4. Orden en la ruta (contrato §2: `401 → 403 → 400`): autenticación y rol **antes** de `validate`.

## `auth.ts`: token y rol

```ts
router.post('/points', authenticate, requireRole('admin', 'tecnico'), validate({ body: createPointBody }), controller.create);
router.get('/points/:id', authenticate, validate({ params: idParams }), controller.getById); // todos los roles
```

- **`authenticate`**: lee `Authorization: Bearer <token>` y lo verifica con `services/token.ts`. Deja `req.user = { id, orgId, role }` (los repositorios filtran por `orgId`). Respuestas (contrato §7):

  | Caso | `401` |
  |---|---|
  | Sin cabecera o vacía | `Token requerido` |
  | Otro esquema (`Basic`), `Bearer` sin token, espacios de más, firma mala, cabecera del JWT distinta de la nuestra, payload deforme | `Token inválido` |
  | Firma correcta pero `exp` ya pasó | `Token vencido` |

  El esquema `Bearer` no distingue mayúsculas (RFC 9110 §11.1). La firma se revisa antes que el vencimiento: un token vencido y alterado es "inválido".
- **`requireRole(...roles)`**: `403 "No tiene permiso para esta acción"` si `req.user.role` no está en la lista. Va siempre **después** de `authenticate` (si no, es un bug y responde `500`).
- Las rutas públicas (`/health`, `POST /auth/login`) no llevan `authenticate`.
- El token no lleva los edificios asignados del `cliente`: el servicio de cada recurso los consulta en cada petición (contrato §3).
