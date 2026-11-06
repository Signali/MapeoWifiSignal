# routes/
Define rutas y verbos HTTP y los conecta a los controladores. Solo ruteo.

Cada archivo exporta un `Router` que `app.ts` monta bajo `/api/v1` (`auth.ts` → `/api/v1/auth`, `buildings.ts` → `/api/v1/buildings`). En cada ruta, los middlewares van en el orden del contrato: `authenticate` → `requireRole` → `validate` → controller.

`buildings.ts` es el **molde** de un recurso con CRUD:

```ts
router.get('/:id', authenticate, validate({ params: idParams, query: noQuery }), controller.getById);           // leen todos
router.post('/', authenticate, requireRole('admin'), validate({ query: noQuery, body }), controller.create);   // escribe admin
```

Las rutas de lectura no llevan `requireRole`: lo que ve cada rol (el `cliente`, solo sus edificios asignados) lo decide el service.
