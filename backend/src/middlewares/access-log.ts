import type { RequestHandler } from 'express';

// Registro de accesos (Ley 21.719, principio de seguridad): una línea por petición a la API, a la
// salida estándar, con quién (id de usuario, o «-» sin token válido), qué (método y ruta), cuándo
// y con qué resultado. Por minimización no se escribe la IP, el email, el cuerpo (el login trae
// la clave) ni los parámetros de consulta (el motivo de una anulación es texto libre).
export function accessLog(write: (line: string) => void = console.log): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    // Al terminar la respuesta, authenticate ya dejó req.user (si el token era válido); un login
    // exitoso deja el id en res.locals.userId.
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0];
      const ms = Math.round(performance.now() - start);
      write(`acceso ${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} usuario=${req.user?.id ?? res.locals.userId ?? '-'} ${ms}ms`);
    });
    next();
  };
}
