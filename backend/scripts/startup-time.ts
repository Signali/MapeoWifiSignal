// `npm run startup-time`: mide cuánto tarda el servicio en aceptar peticiones.
// Lanza `node src/server.ts` varias veces y cuenta hasta que GET /health responde 200.
// /health no consulta la base: el número no incluye la conexión a PostgreSQL.
// Herramienta de desarrollo (como el seed), no parte del servicio.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../src/config.ts';

const RUNS = 10;
const HEALTH = `http://127.0.0.1:${config.port}/health`;

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(HEALTH, { signal: AbortSignal.timeout(200) })).ok;
  } catch {
    return false;
  }
}

async function measure(): Promise<number> {
  const start = performance.now();
  const child = spawn(process.execPath, ['src/server.ts'], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  while (!(await healthy())) {
    if (child.exitCode !== null) throw new Error('El servicio terminó sin responder: probar con `npm start` para ver el error');
    await sleep(2);
  }
  const elapsed = performance.now() - start;
  child.kill();
  await exited;
  while (await healthy()) await sleep(20); // el puerto queda libre antes del siguiente arranque
  return elapsed;
}

if (await healthy()) {
  throw new Error(`Ya hay un servicio respondiendo en el puerto ${config.port}: detenerlo antes de medir`);
}

const times: number[] = [];
for (let i = 0; i < RUNS; i++) times.push(await measure());

const sorted = [...times].sort((a, b) => a - b);
const median = (sorted[RUNS / 2 - 1] + sorted[RUNS / 2]) / 2;
const ms = (value: number) => `${Math.round(value)} ms`;
console.log(`Arranques (en orden): ${times.map(ms).join(' · ')}`);
console.log(`Mínimo ${ms(sorted[0])} · mediana ${ms(median)} · máximo ${ms(sorted[RUNS - 1])}`);
