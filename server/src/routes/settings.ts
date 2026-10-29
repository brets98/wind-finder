import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { getSettings } from '../models/settings.js';
import { WindyStationModel } from '../models/windy-station.js';
import type { StationService } from '../services/stations.js';

/** Global settings: everyone reads the good-wind definition, only the admin changes it. */
export function settingsRouter(stations: StationService) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const settings = await getSettings();
    res.json({ goodWind: settings.goodWind });
  });

  router.patch('/', requireAdmin, async (req, res) => {
    const minKnots = Number(req.body?.goodWind?.minKnots);
    const minHours = Number(req.body?.goodWind?.minHours);
    const issues = [];
    if (!Number.isFinite(minKnots) || minKnots < 1 || minKnots > 60) {
      issues.push({ code: 'INVALID', field: 'minKnots' });
    }
    if (!Number.isInteger(minHours) || minHours < 1 || minHours > 24) {
      issues.push({ code: 'INVALID', field: 'minHours' });
    }
    if (issues.length) {
      res.status(400).json({ error: 'Invalid settings', issues });
      return;
    }
    const settings = await getSettings();
    settings.goodWind = { minKnots, minHours };
    await settings.save();
    res.json({ goodWind: settings.goodWind });
  });

  /** Admin: the local copy of Windy's station catalogue. */
  router.get('/windy-catalogue', requireAdmin, async (_req, res) => {
    const settings = await getSettings();
    res.json({
      stations: await WindyStationModel.countDocuments(),
      syncedAt: settings.windyCatalogueSyncedAt,
    });
  });

  router.post('/windy-catalogue/sync', requireAdmin, async (_req, res) => {
    try {
      res.json(await stations.syncWindyCatalogue());
    } catch (err) {
      console.error('Windy catalogue sync failed:', err);
      res.status(502).json({ error: 'Windy is not reachable right now (is WINDY_API_KEY set?)' });
    }
  });

  return router;
}
