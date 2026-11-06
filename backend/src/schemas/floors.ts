import { z } from 'zod';
import { textId } from './common.ts';

// GET /floors?building_id= (contrato §6.8): obligatorio y entero; otro parámetro → 400.
export const floorsQuery = z.strictObject({
  building_id: textId('building_id es obligatorio y debe ser entero'),
});
