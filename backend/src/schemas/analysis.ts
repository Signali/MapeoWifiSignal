import { z } from 'zod';
import { textId } from './common.ts';

// Rutas 19 y 20 (heatmap y emitters) usan `measurementsQuery` (floor_id y phase), igual que la 16.
// GET /recommendation?floor_id= (contrato §6.21): solo floor_id; `phase` (o cualquier otro) → 400,
// porque la recomendación siempre se calcula con la fase «antes».
export const recommendationQuery = z.strictObject({
  floor_id: textId('floor_id es obligatorio y debe ser entero'),
});
