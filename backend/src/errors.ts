// Errores esperados que lanzan services y middlewares. No conocen HTTP: el
// manejador de errores (middlewares/error-handler.ts) traduce `kind` a código.
export type ErrorKind =
  | 'validation' // 400: formato inválido
  | 'unauthorized' // 401
  | 'forbidden' // 403: el rol no tiene permiso
  | 'not_found' // 404: no existe o no es visible para quien llama
  | 'conflict' // 409: duplicado o borrado bloqueado
  | 'domain_rule'; // 422: formato correcto, pero viola una regla de dominio

export class AppError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
  }
}
