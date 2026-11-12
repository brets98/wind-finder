import { Router } from 'express';
import { DEFAULT_PREFERENCES, PreferencesModel, UNITS } from '../models/preferences.js';

/** The signed-in user's own preferences. */
export const preferencesRouter = Router();

preferencesRouter.get('/', async (req, res) => {
  const prefs = await PreferencesModel.findOne({ userId: req.user!.id });
  res.json({
    unit: prefs?.unit ?? DEFAULT_PREFERENCES.unit,
    email: prefs?.email ?? DEFAULT_PREFERENCES.email,
  });
});

preferencesRouter.patch('/', async (req, res) => {
  const { unit, email } = req.body ?? {};
  const issues = [];
  if (unit !== undefined && !UNITS.includes(unit)) issues.push({ code: 'INVALID', field: 'unit' });
  if (email !== undefined && typeof email !== 'boolean') {
    issues.push({ code: 'INVALID', field: 'email' });
  }
  if (issues.length) {
    res.status(400).json({ error: 'Invalid preferences', issues });
    return;
  }
  const prefs = await PreferencesModel.findOneAndUpdate(
    { userId: req.user!.id },
    { ...(unit === undefined ? {} : { unit }), ...(email === undefined ? {} : { email }) },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ unit: prefs.unit, email: prefs.email });
});
