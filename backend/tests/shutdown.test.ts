import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';

// Apagado ordenado con una señal real (proceso aparte). En Windows, kill('SIGTERM')
// termina el proceso sin ejecutar el manejador: este test corre en el CI (Linux).
// En Windows se prueba a mano con Ctrl+C (ver backend/README.md).

let child: ChildProcess | undefined;
let socket: Socket | undefined;
afterEach(() => {
  socket?.destroy();
  child?.kill('SIGKILL');
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer(): Promise<{ port: number; output: () => string; exit: Promise<number | null> }> {
  const port = await freePort();
  const proc = spawn(process.execPath, ['src/server.ts'], { env: { ...process.env, PORT: String(port) } });
  child = proc;
  let output = '';
  proc.stdout.on('data', (chunk) => (output += chunk));
  proc.stderr.on('data', (chunk) => (output += chunk));
  const exit = new Promise<number | null>((resolve) => proc.on('exit', resolve));
  await new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', () => output.includes('escuchando') && resolve());
    proc.on('exit', () => reject(new Error(`El servidor no arrancó:\n${output}`)));
  });
  return { port, output: () => output, exit };
}

// Petición con las cabeceras a medio enviar: la conexión no queda "inactiva" y
// server.close() la espera. La pausa da tiempo a que los bytes lleguen al servidor
// antes de la señal; sin ella, la conexión puede llegar vacía y cerrarse al instante.
async function openHangingRequest(port: number): Promise<void> {
  socket = connect(port, '127.0.0.1');
  socket.on('error', () => {}); // el corte forzado la resetea (ECONNRESET): es lo esperado
  await new Promise((resolve) => socket!.on('connect', resolve));
  socket.write('GET /health HTTP/1.1\r\nHost: localhost\r\n');
  await new Promise((resolve) => setTimeout(resolve, 300));
}

describe.skipIf(process.platform === 'win32')('apagado ordenado', () => {
  test('SIGTERM → cierra el servidor y el pool, y sale con código 0', async () => {
    const server = await startServer();
    child!.kill('SIGTERM');
    expect(await server.exit).toBe(0);
    expect(server.output()).toContain('Servicio cerrado');
  });

  test('una petición que no termina → a los 8 s corta las conexiones y sale con código 1', { timeout: 15_000 }, async () => {
    const server = await startServer();
    await openHangingRequest(server.port);

    child!.kill('SIGTERM');
    expect(await server.exit).toBe(1);
    expect(server.output()).toContain('El cierre superó 8 s: se cortan las conexiones');
  });

  test('segunda señal durante el cierre → sale al instante con código 1', async () => {
    const server = await startServer();
    await openHangingRequest(server.port);

    const start = Date.now();
    child!.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => server.output().includes('cerrando el servicio') && (clearInterval(wait), resolve()), 20);
    });
    child!.kill('SIGINT');
    expect(await server.exit).toBe(1);
    expect(Date.now() - start).toBeLessThan(3_000);
    expect(server.output()).toContain('Segunda señal (SIGINT)');
  });
});
