import { Router } from 'express';
import * as analysis from '../controllers/analysis.ts';
import { authenticate } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { recommendationQuery } from '../schemas/analysis.ts';
import { measurementsQuery } from '../schemas/measurements.ts';

// Contrato §5 filas 19 a 21: análisis del piso (solo lectura; leen todos los roles y el service
// filtra lo que ve el cliente). Orden: authenticate → validate. Cada ruta se monta en su propia URL.
export const heatmapRouter = Router();
heatmapRouter.get('/', authenticate, validate({ query: measurementsQuery }), analysis.heatmap);

export const emittersRouter = Router();
emittersRouter.get('/', authenticate, validate({ query: measurementsQuery }), analysis.emitters);

export const recommendationRouter = Router();
recommendationRouter.get('/', authenticate, validate({ query: recommendationQuery }), analysis.recommendation);
