import type { Request, Response } from 'express';
import * as floorsService from '../services/floors.ts';
import { queryIdOf } from './params.ts';

// req.user lo deja `authenticate`; ?building_id= ya viene validado y convertido (validate).
export async function list(req: Request, res: Response): Promise<void> {
  res.status(200).json(await floorsService.listByBuilding(req.user!, queryIdOf(req, 'building_id')));
}
