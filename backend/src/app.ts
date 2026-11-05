import express from 'express';

// La app se arma aparte de server.ts para que los tests la usen sin abrir un puerto.
export const app = express();

app.use(express.json());

// Sin token. Sirve de healthcheck (y para el contenedor del Hito 3).
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
