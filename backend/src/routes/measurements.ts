import { Router } from 'express';
import * as measurements from '../controllers/measurements.ts';
import { authenticate, requireRole } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { idParams, noQuery } from '../schemas/common.ts';
import { createMeasurementBody, measurementsQuery, voidQuery } from '../schemas/measurements.ts';

// Contrato §5 filas 15 a 18. Registra admin o tecnico; leen todos los roles (el service
// filtra lo que ve el cliente); anula solo admin. Orden: authenticate → requireRole → validate.
export const measurementsRouter = Router();

measurementsRouter.post(
  '/',
  authenticate,
  requireRole('admin', 'tecnico'),
  validate({ query: noQuery, body: createMeasurementBody }),
  measurements.create,
);
measurementsRouter.get('/', authenticate, validate({ query: measurementsQuery }), measurements.list);
measurementsRouter.get('/:id', authenticate, validate({ params: idParams, query: noQuery }), measurements.getById);
measurementsRouter.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate({ params: idParams, query: voidQuery }),
  measurements.voidMeasurement,
);
