import { Router } from 'express';
import * as measurements from '../controllers/measurements.ts';
import { authenticate, requireRole } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { idParams, noQuery } from '../schemas/common.ts';
import { createMeasurementBody } from '../schemas/measurements.ts';

// Contrato §5 filas 15 y 17. Registra admin o tecnico; leen todos los roles (el service
// filtra lo que ve el cliente). Orden: authenticate → requireRole → validate.
export const measurementsRouter = Router();

measurementsRouter.post(
  '/',
  authenticate,
  requireRole('admin', 'tecnico'),
  validate({ query: noQuery, body: createMeasurementBody }),
  measurements.create,
);
measurementsRouter.get('/:id', authenticate, validate({ params: idParams, query: noQuery }), measurements.getById);
