import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { createMeasurementBody } from '../schemas/measurements.ts';
import * as measurementsService from '../services/measurements.ts';
import { idOf, queryIdOf } from './params.ts';

type CreateBody = z.output<typeof createMeasurementBody>;

// req.user lo deja `authenticate`, que va antes en todas las rutas de mediciones.

// 201 + Location si es nueva; 200 con la ya guardada si el client_uuid se repite (§6.15).
export async function create(req: Request<unknown, unknown, CreateBody>, res: Response): Promise<void> {
  const { created, measurement } = await measurementsService.create(req.user!, req.body);
  if (created) res.status(201).location(`${req.baseUrl}/${measurement.id}`);
  else res.status(200);
  res.json(measurement);
}

// `floor_id` y `phase` ya validados por validate({ query: measurementsQuery }).
export async function list(req: Request, res: Response): Promise<void> {
  const { phase } = req.query as { phase: string };
  res.status(200).json(await measurementsService.listByFloor(req.user!, queryIdOf(req, 'floor_id'), phase));
}

// `reason` ya validado por validate({ query: voidQuery }).
export async function voidMeasurement(req: Request, res: Response): Promise<void> {
  const { reason } = req.query as { reason: string };
  await measurementsService.voidMeasurement(req.user!, idOf(req), reason);
  res.status(204).end();
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.status(200).json(await measurementsService.getById(req.user!, idOf(req)));
}
