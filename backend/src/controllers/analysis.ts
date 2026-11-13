import type { Request, Response } from 'express';
import * as analysis from '../services/analysis.ts';
import { queryIdOf } from './params.ts';

// req.user lo deja `authenticate`; `floor_id` y `phase` ya validados por validate({ query }).

export async function heatmap(req: Request, res: Response): Promise<void> {
  const { phase } = req.query as { phase: string };
  res.status(200).json(await analysis.heatmapOf(req.user!, queryIdOf(req, 'floor_id'), phase));
}

export async function emitters(req: Request, res: Response): Promise<void> {
  const { phase } = req.query as { phase: string };
  res.status(200).json(await analysis.emittersOf(req.user!, queryIdOf(req, 'floor_id'), phase));
}

export async function recommendation(req: Request, res: Response): Promise<void> {
  res.status(200).json(await analysis.recommendationOf(req.user!, queryIdOf(req, 'floor_id')));
}
