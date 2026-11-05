# services/
Lógica de negocio. No conocen HTTP (ni `req`/`res`) ni escriben consultas SQL.

Un problema esperado se comunica lanzando un `AppError` (`src/errors.ts`) con su `kind`, nunca un código HTTP:

```ts
throw new AppError('not_found', 'Edificio no encontrado');   // el manejador responde 404
throw new AppError('domain_rule', 'Las coordenadas quedan fuera del piso (40 x 25 m)'); // 422
```

Cualquier otro error (un fallo de la base, un bug) llega al cliente como `500` genérico y su detalle queda en el log.
