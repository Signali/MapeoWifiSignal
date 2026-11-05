import { app } from './app.ts';
import { config } from './config.ts';

// 0.0.0.0 y no localhost: así también responde desde fuera de un contenedor.
app.listen(config.port, '0.0.0.0', (error) => {
  if (error) throw error;
  console.log(`SignalMap API escuchando en el puerto ${config.port} (${config.env})`);
});
