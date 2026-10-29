import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { FIRST_ARCHIVED_DATE, isDate } from '../domain/day.js';
import { localDate } from '../domain/time.js';
import { DayModel } from '../models/day.js';
import { SessionModel, visibleTo } from '../models/session.js';
import { SpotModel } from '../models/spot.js';
import { serializeDay, type DayService } from '../services/days.js';
import { riderNames, serializeSession } from './sessions.js';
import { findSpot, isAdmin } from './helpers.js';

/** Saved Days: "save this day", a spot's history, one Day with its sessions. */
export function daysRouter(days: DayService) {
  const router = Router();

  /** Saves a whole day (default today, or a past date from 2024) at the spot. */
  router.post('/spots/:id/days', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const date = req.body?.date ?? localDate(new Date());
    if (!isDate(date) || date > localDate(new Date()) || date < FIRST_ARCHIVED_DATE) {
      res
        .status(400)
        .json({ error: 'Invalid date', issues: [{ code: 'OUT_OF_RANGE', field: 'date' }] });
      return;
    }
    const day = await days.ensureDay(spot, date, 'manual');
    res.status(201).json(serializeDay(day));
  });

  /** The spot's saved Days, newest first, each with the sessions the user may see. */
  router.get('/spots/:id/days', async (req, res) => {
    const spot = await findSpot(req, res);
    if (!spot) return;
    const list = await DayModel.find({ spotId: spot._id }).sort({ date: -1 }).limit(100);
    const sessions = await SessionModel.find({
      dayId: { $in: list.map((d) => d._id) },
      ...visibleTo(req.user!.id),
    }).sort({ start: 1 });
    const names = await riderNames(sessions.map((s) => s.userId));

    res.json(
      list.map((day) => {
        const wind = day.observed.wind.filter((w): w is number => w !== null);
        return {
          id: day.id,
          date: day.date,
          reasons: day.reasons,
          observedStatus: day.observed.status,
          maxObserved: wind.length ? Math.max(...wind) : null,
          sessions: sessions
            .filter((s) => String(s.dayId) === day.id)
            .map((s) => serializeSession(s, req.user!.id, names)),
        };
      }),
    );
  });

  /** One Day with every series, completed again first if it is still missing data. */
  router.get('/days/:id', async (req, res) => {
    const { id } = req.params;
    const day = isValidObjectId(id) ? await DayModel.findById(id) : null;
    const spot = day ? await SpotModel.findById(day.spotId) : null;
    if (!day || !spot || (spot.status !== 'verified' && !isAdmin(req))) {
      res.status(404).json({ error: 'Day not found' });
      return;
    }
    await days.fill(day, spot);
    const sessions = await SessionModel.find({ dayId: day._id, ...visibleTo(req.user!.id) }).sort({
      start: 1,
    });
    const names = await riderNames(sessions.map((s) => s.userId));
    res.json({
      ...serializeDay(day),
      spot: { id: spot.id, name: spot.name, type: spot.type },
      sessions: sessions.map((s) => serializeSession(s, req.user!.id, names)),
    });
  });

  return router;
}
