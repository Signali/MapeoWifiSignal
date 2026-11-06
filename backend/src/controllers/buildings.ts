import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { buildingBody } from '../schemas/buildings.ts';
import * as buildingsService from '../services/buildings.ts';
import { idOf } from './params.ts';

type Body = z.output<typeof buildingBody>;

// req.user lo deja `authenticate`, que va antes en todas las rutas de edificios.

export async function list(req: Request, res: Response): Promise<void> {
  res.status(200).json(await buildingsService.list(req.user!));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.status(200).json(await buildingsService.getById(req.user!, idOf(req)));
}

export async function create(req: Request<unknown, unknown, Body>, res: Response): Promise<void> {
  const building = await buildingsService.create(req.user!, req.body.name);
  res.status(201).location(`${req.baseUrl}/${building.id}`).json(building);
}

export async function update(req: Request<{ id: string }, unknown, Body>, res: Response): Promise<void> {
  res.status(200).json(await buildingsService.update(req.user!, idOf(req), req.body.name));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await buildingsService.remove(req.user!, idOf(req));
  res.status(204).end();
}
