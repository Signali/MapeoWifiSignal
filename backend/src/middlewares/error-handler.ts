import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, type ErrorKind } from '../errors.ts';

const statusByKind: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  domain_rule: 422,
};

// Va después de todas las rutas: cualquier ruta o verbo no definido.
export const notFound: RequestHandler = () => {
  throw new AppError('not_found', 'Ruta no encontrada');
};

// Único lugar donde un error se convierte en respuesta: siempre { message }.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Si la respuesta ya empezó a enviarse, solo Express puede cortarla.
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    // Todo 401 indica cómo autenticarse (RFC 9110 §15.5.2, RFC 6750 §3).
    if (err.kind === 'unauthorized') res.set('WWW-Authenticate', 'Bearer');
    res.status(statusByKind[err.kind]).json({ message: err.message });
    return;
  }
  // Errores de express.json() (body-parser): son del cliente, no del servidor.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'JSON mal formado' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Cuerpo demasiado grande' });
    return;
  }
  // Un parámetro de ruta con un %-escape inválido (/buildings/%ZZ): el router lanza un
  // URIError con status 400, pero sin `expose`. Pasa antes de authenticate.
  if (err instanceof URIError && (err as URIError & { status?: number }).status === 400) {
    res.status(400).json({ message: 'Petición inválida' });
    return;
  }
  // Otros del parser (charset o codificación no soportados, subida cortada): marcan
  // `expose` y traen su código 4xx.
  if (err?.expose === true && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ message: 'Petición inválida' });
    return;
  }

  // Inesperado: al log solo el stack (incluye el mensaje). No el objeto entero, porque
  // un error de pg trae en `detail` valores de la fila (emails, nfc_uid). Nunca el
  // cuerpo de la petición: el login trae la clave.
  console.error(`Error inesperado en ${req.method} ${req.originalUrl}:`, err instanceof Error ? err.stack : err);
  res.status(500).json({ message: 'Error interno del servidor' });
};
