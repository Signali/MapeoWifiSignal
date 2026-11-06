import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { createPointBody, updatePointBody } from '../schemas/points.ts';
import * as pointsService from '../services/points.ts';
import { idOf, queryIdOf } from './params.ts';

type CreateBody = z.output<typeof createPointBody>;
type UpdateBody = z.output<typeof updatePointBody>;

// req.user lo deja `authenticate`, que va antes en todas las rutas de puntos.

export async function list(req: Request, res: Response): Promise<void> {
  res.status(200).json(await pointsService.listByFloor(req.user!, queryIdOf(req, 'floor_id')));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.status(200).json(await pointsService.getById(req.user!, idOf(req)));
}

export async function create(req: Request<unknown, unknown, CreateBody>, res: Response): Promise<void> {
  const point = await pointsService.create(req.user!, req.body);
  res.status(201).location(`${req.baseUrl}/${point.id}`).json(point);
}

export async function update(req: Request<{ id: string }, unknown, UpdateBody>, res: Response): Promise<void> {
  const { code, x, y, nfc_uid } = req.body;
  res.status(200).json(await pointsService.update(req.user!, idOf(req), { code, x, y, nfc_uid }));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await pointsService.remove(req.user!, idOf(req));
  res.status(204).end();
}
