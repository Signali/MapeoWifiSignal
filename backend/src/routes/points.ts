import { Router } from 'express';
import * as points from '../controllers/points.ts';
import { authenticate, requireRole } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { idParams, noQuery } from '../schemas/common.ts';
import { createPointBody, pointsQuery, updatePointBody } from '../schemas/points.ts';

// Contrato §5 filas 9 a 13. Leen todos los roles (el service filtra lo que ve el cliente);
// crean y editan admin y tecnico; borra solo admin. Orden: authenticate → requireRole → validate.
export const pointsRouter = Router();

pointsRouter.get('/', authenticate, validate({ query: pointsQuery }), points.list);
pointsRouter.get('/:id', authenticate, validate({ params: idParams, query: noQuery }), points.getById);
pointsRouter.post(
  '/',
  authenticate,
  requireRole('admin', 'tecnico'),
  validate({ query: noQuery, body: createPointBody }),
  points.create,
);
pointsRouter.patch(
  '/:id',
  authenticate,
  requireRole('admin', 'tecnico'),
  validate({ params: idParams, query: noQuery, body: updatePointBody }),
  points.update,
);
pointsRouter.delete('/:id', authenticate, requireRole('admin'), validate({ params: idParams, query: noQuery }), points.remove);
