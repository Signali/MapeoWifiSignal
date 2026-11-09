# postman/ — colección de la demo en vivo

Entregable de la rúbrica (Hito 2, Paso 9): las peticiones de la demostración, guardadas, en orden y listas para importar.

| Archivo | Qué es |
|---|---|
| `signalmap-hito2.postman_collection.json` | La colección (Collection v2.1) |
| `signalmap-local.postman_environment.example.json` | Plantilla del environment: `base_url`, `admin_email` y `admin_password` **vacía** |

> **Estado:** la colección está probada con el Postman CLI y, a mano, en la app de escritorio (Pc-Portatil, 2026-11-06): login y las 4 peticiones dieron `201`, `200`, `204` y `404`.

La colección tiene dos carpetas:

- **`0 · Antes de la demo`**: el login del admin. Es preparación, **no** es una de las 4 peticiones. Guarda el token solo en la variable `token`.
- **`Demo en vivo`**: exactamente 4 peticiones sobre `/points`, en este orden.

| # | Petición | Resultado | Qué comprueba el script |
|---|---|---|---|
| 1 | `POST /points` | `201` | Cuerpo (`P-25`, `x=30`, `y=12.5`, `nfc_uid`), cabecera `Location`; guarda el `id` en `point_id` |
| 2 | `PATCH /points/{{point_id}}` | `200` | `x=13`, `y=8.5`; `code` y `nfc_uid` no cambian |
| 3 | `DELETE /points/{{point_id}}` | `204` | Código y cuerpo vacío |
| 4 | `GET /points/{{point_id}}` | `404` | `{ "message": "Punto no encontrado" }` (el borrado fue real) |

El `403` del rol `cliente` no va en la demo: lo cubren los tests (`npm test`).

## Seguridad

Ninguna clave ni token entra al repo. La plantilla del environment trae `admin_password` vacía y la colección trae `token` vacío. La clave real es la de `SEED_ADMIN_PASSWORD` de **tu** `.env`.

- Un environment con la clave real, guardado como `postman/*.postman_environment.json`, queda ignorado por git (`.gitignore`). Solo se sube la plantilla `.example.json`.
- El `token` es una variable de **colección**: tras el login queda con valor en tu Postman, y puede sincronizarse si usás cuenta o entrar en un export. **Antes de volver a exportar la colección**, vaciá `token` y `point_id` (pestaña *Variables* de la colección → *Current value* y *Initial value*) y revisá `git diff`.

## Antes de empezar

1. Servicio y base listos según [`backend/README.md`](../backend/README.md): `npm run seed` y `npm start` (puerto 3000). `GET http://localhost:3000/health` debe dar `{"status":"ok"}`.
2. Usuario `admin@demo.cl` (lo crea el seed).

## Cómo funciona Postman (en 2 minutos)

- **Servidor y cliente.** La API es un programa que espera pedidos; **Postman es el cliente** que se los manda y muestra lo que contesta. El navegador solo sabe hacer lecturas (`GET`) al escribir una URL; Postman manda cualquier verbo, con cuerpo y cabeceras, y guarda los pedidos.
- **Petición.** Verbo (`POST` crear · `GET` leer · `PATCH` modificar · `DELETE` borrar) + URL + cabeceras + cuerpo.
- **Respuesta.** Un código (`2xx` salió bien · `4xx` el pedido tiene un problema) + cabeceras + cuerpo. En la demo, **el `404` final es el resultado correcto**: prueba que el punto ya no existe.
- **Colección.** Carpeta de peticiones guardadas, en orden. Este repo trae una.
- **Variables `{{así}}`.** Se reemplazan al enviar. `base_url`, `admin_email` y `admin_password` viven en el **environment** (el conjunto que se elige arriba a la derecha); `token`, `point_id` y `floor_id`, en la colección. Cada variable tiene *Initial value* (se sincroniza con la nube) y *Current value* (queda en tu PC): **la clave va solo en *Current value***.
- **Token.** Las rutas de `/points` exigen identificarse. El login devuelve un token (un pase que dura 8 h para el admin) y la colección lo envía solo en `Authorization: Bearer {{token}}`.
- **Scripts.** Los *Tests* corren después de cada respuesta y marcan `PASS`/`FAIL` en la pestaña **Test Results**; el *Pre-request* del `POST` borra un `P-25` sobrante. Lo que hacen se ve en la **Console** de Postman.

```
Login ──▶ guarda {{token}}
1 POST   crea P-25 ──▶ guarda {{point_id}}   → 201
2 PATCH  cambia x e y de ese punto           → 200
3 DELETE borra ese punto                     → 204
4 GET    lo pide de nuevo                    → 404  (ya no existe)
```

## Con la app de escritorio de Postman

1. Instalar Postman: <https://www.postman.com/downloads/> e **iniciar sesión** (cuenta gratuita). Sin cuenta, Postman queda en modo reducido (*Lightweight API Client*) y pide iniciar sesión para importar colecciones. Elegir un workspace **Personal** y no compartirlo.
2. **Import** → botón **Files** (no escribas la ruta en el cuadro de texto: la toma como URL) y elegir los dos archivos de esta carpeta, uno por vez si falla. Plan B: abrir el `.json` con el Bloc de notas, copiar todo y pegarlo en el cuadro de Import.
3. Arriba a la derecha, elegir el environment **SignalMap local (plantilla)** y abrir el ícono del ojo → *Edit*: completar `admin_password` en el valor **actual** (*Current value*) con `SEED_ADMIN_PASSWORD` de tu `.env`. El valor actual no se sincroniza.
4. **Login previo (una vez, antes de presentar):** carpeta `0 · Antes de la demo` → *Send*. Debe dar `200` y pasar sus 2 tests. El token queda guardado solo (el admin dura 8 h).
5. **La demo:** en la carpeta `Demo en vivo`, *Send* en cada petición, en orden 1 → 4. En el panel inferior, pestaña **Test Results**, se ven los tests en verde.
   También se puede correr toda la carpeta de una vez: menú de la carpeta → *Run*.
6. Cómo leer el resultado: arriba el código y el tiempo (`201 Created`…), en *Body* la respuesta, en *Headers* el `Location` del POST, en *Test Results* cada comprobación en `PASS`/`FAIL`.

## Con el Postman CLI

Sirve para ensayar sin abrir la app. Se instala con `npm install -g postman-cli` (en la raíz del repo, con el servicio levantado):

```bash
# environment local con tu clave (el nombre sin ".example" lo ignora git)
cp postman/signalmap-local.postman_environment.example.json postman/signalmap-local.postman_environment.json
# completar admin_password en ese archivo, y después:
postman collection run postman/signalmap-hito2.postman_collection.json -e postman/signalmap-local.postman_environment.json
```

Esperado: `failed 0` en `requests` y en `assertions` (**11 aserciones**). El total de `requests` es 6, o 7 si había un `P-25` sobrante: el POST hace antes una consulta de limpieza (ver abajo) que el CLI también cuenta. Si algo falla, el comando termina con código distinto de 0. En el CLI 1.86.0 no hizo falta `postman login`.

## Repetir la demo

Una corrida completa deja la base como estaba: `POST` crea `P-25` y `DELETE` lo borra. Solo el contador de ids sigue subiendo (25, 26, 27…), y las peticiones usan el `id` que devolvió el POST, no uno fijo.

Si una corrida quedó cortada entre el `POST` y el `DELETE`, queda `P-25` vivo. El `POST` lo detecta antes de crear: consulta los puntos del piso y borra el `P-25` sobrante (es el único script que hace algo más que comprobar; deja su aviso en la consola de Postman y, si no pudo consultar, también). Por eso la demo se hace sobre la base de desarrollo del seed: ahí un `P-25` es siempre de una corrida anterior.

**Siempre empezar por la petición 1.** Es la única que renueva `point_id`; después de una corrida completa `point_id` conserva el id ya borrado. Si se envían 2, 3 o 4 sin pasar por la 1, el `PATCH` y el `DELETE` dan `404` y la 4 pasa sin probar nada. Para repetir la demo: volver a la 1. Si aun así hubiera que volver al estado inicial: `npm run seed` (borra y recarga todo; solo desarrollo).

## Si algo falla en vivo

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Error de conexión (`ECONNREFUSED`) | Servicio caído | `npm start` en `backend/`; verificar `/health` |
| Login `401` "Credenciales inválidas" | `admin_password` mal en el environment | Revisar el valor actual contra `SEED_ADMIN_PASSWORD` de tu `.env` y que el environment elegido sea el de arriba a la derecha |
| Petición 1 con `401` "Token requerido" o "Token vencido" | No se hizo el login, o pasaron más de 8 h | Repetir el login previo |
| Petición 1 con `409` | Quedó un `P-25` o la tira NFC repetida | Volver a enviar: el script borra el sobrante. Si persiste, `npm run seed` |
| Petición 2 o 3 con `404`, o la 4 pasa "sin querer" | `point_id` es el de la corrida anterior (ya borrado), o está vacío (primera vez; con vacío la 4 da `400` "floor_id es obligatorio") | Enviar la 1 y seguir el orden |
| Todo da `404 Ruta no encontrada` | `base_url` mal (falta el puerto) | Revisar el environment |
| `405 Not Allowed` con HTML de `openresty`, o la Console muestra una URL rara (`...%0A...`, otro dominio) | Se pegó texto de varias filas en una celda del environment: la petición no llega a nuestra API | Borrar el environment y reimportar la plantilla; completar solo `admin_password` a mano en *Current value* |
| El environment importado muestra una sola fila `key` en vez de `base_url`, `admin_email` y `admin_password` | El import salió mal (se pegó la ruta o el texto en el cuadro de Import en vez de usar **Files**) | Borrar ese environment y reimportar la plantilla con **Import → Files**. Plan B: crear a mano las tres variables, cada valor en su celda y sin saltos de línea |
| Login `401` aunque la clave "se ve igual" | Se copió otra línea del `.env` o la copia quedó cortada | Comparar el largo: la cantidad de puntos de `admin_password` debe igualar los caracteres de `SEED_ADMIN_PASSWORD` |

## Ensayo en otro equipo (Pc-Casa)

Seguir **solo** `backend/README.md` y esta carpeta, sin ayuda:

1. `git switch main` + `git pull`. Node 26, PostgreSQL 17 y Postman (o su CLI) instalados.
2. Rol y bases según `db/README.md`; `cp .env.example .env` y completar claves propias, **generar** `JWT_SECRET` (el de ejemplo no arranca).
3. `cd backend && npm install && npm run seed && npm start`; `/health` → `ok`. En Windows PowerShell 5.1 (`&&` no existe ahí), correrlos uno por uno.
4. `npm test` en verde.
5. Importar los dos archivos, completar `admin_password`, login previo y las 4 peticiones: 201 → 200 → 204 → 404.
6. Repetir las 4 una segunda vez, **empezando de nuevo por la 1**. Anotar qué pasos del README faltaban o no se entendían.
