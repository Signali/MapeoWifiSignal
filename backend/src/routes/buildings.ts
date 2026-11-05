import { Router } from 'express';
import * as buildings from '../controllers/buildings.ts';
import { authenticate, requireRole } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { buildingBody } from '../schemas/buildings.ts';
import { idParams, noQuery } from '../schemas/common.ts';

// Contrato §5 filas 3 a 7. Leen todos los roles (el service filtra lo que ve el
// cliente); escribe solo admin. Orden: authenticate → requireRole → validate.
export const buildingsRouter = Router();

buildingsRouter.get('/', authenticate, validate({ query: noQuery }), buildings.list);
buildingsRouter.get('/:id', authenticate, validate({ params: idParams, query: noQuery }), buildings.getById);
buildingsRouter.post('/', authenticate, requireRole('admin'), validate({ query: noQuery, body: buildingBody }), buildings.create);
buildingsRouter.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate({ params: idParams, query: noQuery, body: buildingBody }),
  buildings.update,
);
buildingsRouter.delete('/:id', authenticate, requireRole('admin'), validate({ params: idParams, query: noQuery }), buildings.remove);
