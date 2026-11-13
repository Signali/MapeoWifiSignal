import { readFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { createServer, type Server as HttpsServer } from 'node:https';
import { app } from './app.ts';
import { config } from './config.ts';
import { pool } from './repositories/db.ts';

// Docker espera 10 s después de SIGTERM y luego mata el proceso: cerramos antes.
const SHUTDOWN_TIMEOUT_MS = 8_000;

const protocol = config.tls ? 'HTTPS' : 'HTTP';
const onListening = () => console.log(`SignalMap API escuchando en el puerto ${config.port} (${config.env}, ${protocol})`);

// 0.0.0.0 y no localhost: así también responde desde fuera de un contenedor.
// Con TLS_CERT_FILE y TLS_KEY_FILE habla HTTPS; sin ellas, HTTP (el uso por cable con adb reverse).
const server: HttpServer | HttpsServer = config.tls
  ? createServer({ cert: readFileSync(config.tls.certFile), key: readFileSync(config.tls.keyFile) }, app).listen(
      config.port,
      '0.0.0.0',
      onListening,
    )
  : app.listen(config.port, '0.0.0.0', (error) => {
      if (error) throw error;
      onListening();
    });

let shuttingDown = false;

function forceExit(reason: string): void {
  console.error(`${reason}: se cortan las conexiones abiertas`);
  server.closeAllConnections();
  process.exit(1);
}

// Apagado ordenado: no acepta conexiones nuevas, espera las peticiones en curso,
// cierra el pool de pg y sale. Una segunda señal (Ctrl+C otra vez) corta al instante.
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return forceExit(`Segunda señal (${signal})`);
  shuttingDown = true;
  console.log(`${signal} recibido: cerrando el servicio...`);

  setTimeout(() => forceExit(`El cierre superó ${SHUTDOWN_TIMEOUT_MS / 1000} s`), SHUTDOWN_TIMEOUT_MS).unref();

  // Sin process.exit(): el proceso termina solo cuando no queda nada abierto, y así
  // los mensajes alcanzan a escribirse (en Windows la salida a un pipe es asíncrona).
  server.close(async (closeError) => {
    try {
      if (closeError) throw closeError;
      await pool.end();
      console.log('Servicio cerrado');
    } catch (error) {
      console.error('Error al cerrar el servicio:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
