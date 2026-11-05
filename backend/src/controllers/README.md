# controllers/
Reciben la petición, llaman a un servicio y devuelven la respuesta con el código de estado HTTP correcto. **No contienen lógica de negocio.** Un error nunca se devuelve con `200 OK`.

- Leen la entrada ya validada por `middlewares/validate.ts` (no validan de nuevo).
- **No capturan errores**: si el servicio lanza un `AppError`, Express 5 lo pasa solo (también desde funciones `async`) a `middlewares/error-handler.ts`, que arma la respuesta.
