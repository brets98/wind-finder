import { Router } from 'express';
import { PreferencesModel, UNITS, type Unit } from '../models/preferences.js';

/** The signed-in user's own preferences. */
export const preferencesRouter = Router();

const DEFAULTS = { unit: 'knots' as Unit };

preferencesRouter.get('/', async (req, res) => {
  const prefs = await PreferencesModel.findOne({ userId: req.user!.id });
  res.json({ unit: prefs?.unit ?? DEFAULTS.unit });
});

preferencesRouter.patch('/', async (req, res) => {
  const { unit } = req.body ?? {};
  if (unit !== undefined && !UNITS.includes(unit)) {
    res.status(400).json({ error: 'Invalid unit', issues: [{ code: 'INVALID', field: 'unit' }] });
    return;
  }
  const prefs = await PreferencesModel.findOneAndUpdate(
    { userId: req.user!.id },
    unit === undefined ? {} : { unit },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ unit: prefs.unit });
});
