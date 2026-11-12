import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { isClockTime } from '../domain/schedule.js';
import { getSettings, type Settings } from '../models/settings.js';
import { WindyStationModel } from '../models/windy-station.js';
import type { StationService } from '../services/stations.js';

const serialize = (settings: Settings) => ({
  goodWind: { minKnots: settings.goodWind.minKnots, minHours: settings.goodWind.minHours },
  notifications: {
    pushAt: settings.notifications.pushAt,
    emailAt: settings.notifications.emailAt,
  },
});

/**
 * Global settings: everyone reads the good-wind definition and notification times, only the
 * admin changes them (each group optional in a PATCH).
 */
export function settingsRouter(stations: StationService) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(serialize(await getSettings()));
  });

  router.patch('/', requireAdmin, async (req, res) => {
    const { goodWind, notifications } = req.body ?? {};
    const issues = [];
    const minKnots = Number(goodWind?.minKnots);
    const minHours = Number(goodWind?.minHours);
    if (goodWind !== undefined) {
      if (!Number.isFinite(minKnots) || minKnots < 1 || minKnots > 60) {
        issues.push({ code: 'INVALID', field: 'minKnots' });
      }
      if (!Number.isInteger(minHours) || minHours < 1 || minHours > 24) {
        issues.push({ code: 'INVALID', field: 'minHours' });
      }
    }
    if (notifications !== undefined) {
      for (const field of ['pushAt', 'emailAt'] as const) {
        if (!isClockTime(notifications?.[field])) issues.push({ code: 'INVALID', field });
      }
    }
    if (issues.length) {
      res.status(400).json({ error: 'Invalid settings', issues });
      return;
    }
    const settings = await getSettings();
    if (goodWind !== undefined) settings.goodWind = { minKnots, minHours };
    if (notifications !== undefined) {
      settings.notifications = { pushAt: notifications.pushAt, emailAt: notifications.emailAt };
    }
    await settings.save();
    res.json(serialize(settings));
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
