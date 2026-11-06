import { Router } from 'express';
import * as floors from '../controllers/floors.ts';
import { authenticate } from '../middlewares/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { floorsQuery } from '../schemas/floors.ts';

// Contrato §5 fila 8. Solo lectura, todos los roles (el service filtra lo que ve el cliente).
export const floorsRouter = Router();

floorsRouter.get('/', authenticate, validate({ query: floorsQuery }), floors.list);
