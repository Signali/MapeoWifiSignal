import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { loginBody } from '../schemas/auth.ts';
import * as authService from '../services/auth.ts';

export async function login(req: Request<unknown, unknown, z.output<typeof loginBody>>, res: Response): Promise<void> {
  const result = await authService.login(req.body.email, req.body.password);
  // Para el registro de accesos: el login no pasa por authenticate, así que no hay req.user.
  res.locals.userId = result.user.id;
  res.status(200).json(result);
}
