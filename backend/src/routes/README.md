# routes/
Define rutas y verbos HTTP y los conecta a los controladores. Solo ruteo.

Cada archivo exporta un `Router` que `app.ts` monta bajo `/api/v1` (`auth.ts` → `/api/v1/auth`). En cada ruta, los middlewares van en el orden del contrato: `authenticate` → `requireRole` → `validate` → controller.
