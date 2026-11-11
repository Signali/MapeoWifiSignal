import { fileURLToPath } from 'node:url';
import express from 'express';
import { errorHandler, notFound } from './middlewares/error-handler.ts';
import { authRouter } from './routes/auth.ts';
import { buildingsRouter } from './routes/buildings.ts';
import { floorsRouter } from './routes/floors.ts';
import { measurementsRouter } from './routes/measurements.ts';
import { pointsRouter } from './routes/points.ts';

// La app se arma aparte de server.ts para que los tests la usen sin abrir un puerto.
export const app = express();

app.use(express.json());

// Sin token. Sirve de healthcheck (y para el contenedor del Hito 3).
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/buildings', buildingsRouter);
app.use('/api/v1/floors', floorsRouter);
app.use('/api/v1/points', pointsRouter);
app.use('/api/v1/measurements', measurementsRouter);

// Todo /api sin ruta sigue siendo 404 JSON, aunque exista la web compilada.
app.use('/api', notFound);
// La web compilada (frontend/dist). Si no existe (tests, desarrollo), no hace nada.
app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));

// Las rutas de la API van arriba de estas dos líneas.
app.use(notFound);
app.use(errorHandler);
