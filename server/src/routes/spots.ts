import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { dayIndicator, goodHours } from '../domain/good-wind.js';
import { parseSpot } from '../domain/spot.js';
import { addDays, localDate } from '../domain/time.js';
import { favoriteIds, FavoritesModel } from '../models/favorite.js';
import { getSettings, SettingsModel } from '../models/settings.js';
import { SpotModel, type StationRef } from '../models/spot.js';
import { forecastsFor, marineFor } from '../services/forecasts.js';
import { importOsmSpots } from '../services/osm-import.js';
import { isStale, type StationService } from '../services/stations.js';
import { modelGroup } from '../sources/open-meteo.js';
import { STATION_SOURCES, type StationSource } from '../sources/types.js';
import { findSpot, isAdmin } from './helpers.js';

export function spotsRouter(stations: StationService) {
  const router = Router();

  /**
   * Every visible spot with the good-wind indicator for today and tomorrow and, when a recent
   * reading is already at hand, the live wind (the list never waits for stations).
   */
  router.get('/', async (req, res) => {
    const filter = isAdmin(req) ? {} : { status: 'verified' as const };
    const spots = await SpotModel.find(filter).sort({ name: 1 });
    const [favorites, settings, forecasts] = await Promise.all([
      favoriteIds(req.user!.id),
      getSettings(),
      forecastsFor(spots),
    ]);
    const today = localDate(new Date());

    res.json(
      spots.map((spot) => {
        const forecast = forecasts.get(spot.id);
        const indicator = (date: string) =>
          forecast ? dayIndicator(forecast, date, spot, settings.goodWind) : null;
        const cached = spot.station ? stations.cached(spot.station) : null;
        return {
          id: spot.id,
          name: spot.name,
          lat: spot.lat,
          lon: spot.lon,
          type: spot.type,
          status: spot.status,
          region: spot.region,
          isFavorite: favorites.has(spot.id),
          today: indicator(today),
          tomorrow: indicator(addDays(today, 1)),
          live:
            cached?.usable && !isStale(cached.latest)
              ? { ...cached.latest, source: spot.station!.source }
              : null,
        };
      }),
    );
  });

  router.get('/:id', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const favorites = await favoriteIds(req.user!.id);
    res.json({ ...spot.toJSON(), isFavorite: favorites.has(spot.id) });
  });

  /** Every model's hourly wind with its good hours, waves for sea spots, and each day's indicator. */
  router.get('/:id/forecast', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const [settings, forecasts, marine] = await Promise.all([
      getSettings(),
      forecastsFor([spot]),
      marineFor(spot),
    ]);
    const forecast = forecasts.get(spot.id);
    if (!forecast) {
      res.status(502).json({ error: 'Forecast not available right now' });
      return;
    }
    const dates = [...new Set(forecast.times.map((t) => localDate(t)))];
    res.json({
      times: forecast.times,
      models: forecast.models.map((m) => ({
        ...m,
        group: modelGroup(m.model) ?? 'global',
        good: goodHours(m, spot, settings.goodWind),
      })),
      marine,
      goodWind: settings.goodWind,
      days: dates.map((date) => ({
        date,
        indicator: dayIndicator(forecast, date, spot, settings.goodWind),
      })),
    });
  });

  router.get('/:id/live', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    res.json(await stations.live(spot));
  });

  router.put('/:id/favorite', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    await FavoritesModel.updateOne(
      { userId: req.user!.id },
      { $addToSet: { spotIds: spot._id } },
      { upsert: true },
    );
    res.status(204).end();
  });

  router.delete('/:id/favorite', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    await FavoritesModel.updateOne({ userId: req.user!.id }, { $pull: { spotIds: spot._id } });
    res.status(204).end();
  });

  // --- Admin only ---

  router.post('/', requireAdmin, async (req, res) => {
    const { fields, issues } = parseSpot(req.body ?? {});
    if (issues.length) {
      res.status(400).json({ error: 'Invalid spot', issues });
      return;
    }
    const spot = await SpotModel.create(fields);
    res.status(201).json({ ...spot.toJSON(), isFavorite: false });
  });

  router.post('/import-osm', requireAdmin, async (_req, res) => {
    try {
      res.json(await importOsmSpots());
    } catch (err) {
      console.error('OSM import failed:', err);
      res.status(502).json({ error: 'OpenStreetMap is not reachable right now' });
    }
  });

  router.patch('/:id', requireAdmin, async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const { fields, issues } = parseSpot(req.body ?? {}, { partial: true });
    if (issues.length) {
      res.status(400).json({ error: 'Invalid spot', issues });
      return;
    }
    const moved =
      (fields.lat !== undefined && fields.lat !== spot.lat) ||
      (fields.lon !== undefined && fields.lon !== spot.lon);
    spot.set(fields);
    if (moved) spot.forecastModels = [];
    await spot.save();
    const favorites = await favoriteIds(req.user!.id);
    res.json({ ...spot.toJSON(), isFavorite: favorites.has(spot.id) });
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    await spot.deleteOne();
    await FavoritesModel.updateMany({}, { $pull: { spotIds: spot._id } });
    if (spot.osmId) {
      await getSettings();
      await SettingsModel.updateOne(
        { key: 'global' },
        { $addToSet: { ignoredOsmIds: spot.osmId } },
      );
    }
    res.status(204).end();
  });

  router.get('/:id/station-suggestions', requireAdmin, async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    res.json(await stations.suggestions(spot));
  });

  router.get('/:id/station-check', requireAdmin, async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const source = String(req.query.source) as StationSource;
    const stationId = String(req.query.stationId ?? '').trim();
    if (!STATION_SOURCES.includes(source) || !stationId) {
      res.status(400).json({ error: 'Invalid station', issues: [{ code: 'STATION_INVALID' }] });
      return;
    }
    res.json(await stations.checkStation(spot, source, stationId));
  });

  /**
   * Sets (or with null removes) the main and backup stations. Each one is looked up at its
   * source, which gives its name and position; unknown stations are refused.
   */
  router.put('/:id/stations', requireAdmin, async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const refs: Partial<Record<'station' | 'backupStation', StationRef | null>> = {};

    for (const key of ['station', 'backupStation'] as const) {
      const value = req.body?.[key];
      if (value === undefined) continue;
      if (value === null) {
        refs[key] = null;
        continue;
      }
      const source = value.source as StationSource;
      const stationId = String(value.stationId ?? '').trim();
      if (!STATION_SOURCES.includes(source) || !stationId) {
        res
          .status(400)
          .json({ error: 'Invalid station', issues: [{ code: 'STATION_INVALID', field: key }] });
        return;
      }
      const found = await stations.checkStation(spot, source, stationId);
      if (!('name' in found)) {
        res.status(400).json({
          error: 'Station not found',
          issues: [{ code: 'STATION_NOT_FOUND', field: key }],
        });
        return;
      }
      refs[key] = {
        source,
        stationId: found.stationId,
        name: found.name,
        lat: found.lat,
        lon: found.lon,
        distanceKm: found.distanceKm,
        notes: typeof value.notes === 'string' ? value.notes.trim().slice(0, 500) : '',
      };
    }

    spot.set(refs);
    await spot.save();
    const favorites = await favoriteIds(req.user!.id);
    res.json({ ...spot.toJSON(), isFavorite: favorites.has(spot.id) });
  });

  return router;
}
