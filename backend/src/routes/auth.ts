import { Router } from 'express';
import * as auth from '../controllers/auth.ts';
import { validate } from '../middlewares/validate.ts';
import { loginBody } from '../schemas/auth.ts';

// Público: es la ruta que entrega el token.
export const authRouter = Router();

authRouter.post('/login', validate({ body: loginBody }), auth.login);
