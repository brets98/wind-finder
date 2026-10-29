import type { Request, Response } from 'express';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import { ROLES } from '../models/role.js';
import { SpotModel, type Spot } from '../models/spot.js';

export type SpotDoc = HydratedDocument<Spot>;

export const isAdmin = (req: Request) => req.user?.role === ROLES.admin;

/**
 * The spot with id `id` (default: the `:id` route parameter), if it exists and the user may
 * see it (only admins see spots still to verify); otherwise answers 404 and returns null.
 */
export async function findSpot(
  req: Request,
  res: Response,
  id: unknown = req.params.id,
): Promise<SpotDoc | null> {
  const spot = typeof id === 'string' && isValidObjectId(id) ? await SpotModel.findById(id) : null;
  if (!spot || (spot.status !== 'verified' && !isAdmin(req))) {
    res.status(404).json({ error: 'Spot not found' });
    return null;
  }
  return spot;
}
