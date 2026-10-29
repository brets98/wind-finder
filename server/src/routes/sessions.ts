import { Router, type Request, type Response } from 'express';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import { hourlyObserved } from '../domain/day.js';
import { parseSession } from '../domain/session.js';
import { DayModel, type Day } from '../models/day.js';
import { SessionModel, visibleTo, type Session } from '../models/session.js';
import { SpotModel } from '../models/spot.js';
import { UserModel } from '../models/user.js';
import type { DayService } from '../services/days.js';
import { FORECAST_MODELS } from '../sources/open-meteo.js';
import { findSpot } from './helpers.js';

type SessionDoc = HydratedDocument<Session>;

/** Display names of riders by user id (never their emails). */
export async function riderNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter(isValidObjectId);
  const users = await UserModel.find({ _id: { $in: ids } }, { name: 1, surname: 1 });
  return new Map(users.map((u) => [u.id as string, `${u.name} ${u.surname}`.trim()]));
}

export function serializeSession(s: SessionDoc, userId: string, names: Map<string, string>) {
  return {
    id: s.id as string,
    spotId: String(s.spotId),
    dayId: String(s.dayId),
    rider: { id: s.userId, name: names.get(s.userId) ?? '' },
    isOwn: s.userId === userId,
    date: s.date,
    start: s.start,
    end: s.end,
    sport: s.sport,
    size: s.size,
    board: s.board,
    perceivedWind: s.perceivedWind,
    gustiness: s.gustiness,
    seaState: s.seaState,
    rating: s.rating,
    comment: s.comment,
    visibility: s.visibility,
  };
}

/**
 * What a board card's small chart needs: the hourly forecast of one model (the first
 * high-resolution one with data, in `FORECAST_MODELS` order) for both runs, and the observed wind.
 */
export function cardChart(day: HydratedDocument<Day>) {
  const hours = day.hours.map((h) => h.toISOString());
  const d0 = (model: string) => day.forecasts.find((f) => f.model === model && f.run === 'd0');
  const model = FORECAST_MODELS.map((m) => m.id).find((id) =>
    d0(id)?.speed.some((v) => v !== null),
  );
  const readings = day.observed.times.map((t, i) => ({
    time: t.toISOString(),
    wind: day.observed.wind[i] ?? null,
    gust: day.observed.gust[i] ?? null,
    dir: day.observed.dir[i] ?? null,
  }));
  return {
    hours,
    model: model ?? null,
    forecastD1: model
      ? (day.forecasts.find((f) => f.model === model && f.run === 'd1')?.speed ?? [])
      : [],
    forecastD0: model ? d0(model)!.speed : [],
    observed: hourlyObserved(hours, readings).wind,
  };
}

async function findOwnSession(req: Request, res: Response) {
  const { id } = req.params;
  const session = isValidObjectId(id) ? await SessionModel.findById(id) : null;
  if (!session || (session.visibility === 'private' && session.userId !== req.user!.id)) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (session.userId !== req.user!.id) {
    res.status(403).json({ error: 'Only the rider can change a session' });
    return null;
  }
  return session;
}

const PAGE_SIZE = 20;

/** Logged outings and the group board. */
export function sessionsRouter(days: DayService) {
  const router = Router();

  /**
   * The board: the sessions the user may see, newest first, optionally by spot or rider, with
   * each card's spot, rider and small forecast-vs-observed chart. `offset` pages through them.
   */
  router.get('/', async (req, res) => {
    const filter: Record<string, unknown> = visibleTo(req.user!.id);
    if (typeof req.query.spotId === 'string' && isValidObjectId(req.query.spotId)) {
      filter.spotId = req.query.spotId;
    }
    if (typeof req.query.userId === 'string') filter.userId = req.query.userId;
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const sessions = await SessionModel.find(filter)
      .sort({ date: -1, start: -1, _id: -1 })
      .skip(offset)
      .limit(PAGE_SIZE + 1);
    const page = sessions.slice(0, PAGE_SIZE);
    const [names, spots, dayList] = await Promise.all([
      riderNames(page.map((s) => s.userId)),
      SpotModel.find({ _id: { $in: page.map((s) => s.spotId) } }, { name: 1, type: 1 }),
      DayModel.find({ _id: { $in: page.map((s) => s.dayId) } }),
    ]);

    res.json({
      sessions: page.map((s) => {
        const spot = spots.find((x) => x.id === String(s.spotId));
        const day = dayList.find((d) => d.id === String(s.dayId));
        return {
          ...serializeSession(s, req.user!.id, names),
          spot: spot ? { id: spot.id, name: spot.name, type: spot.type } : null,
          chart: day ? cardChart(day) : null,
        };
      }),
      hasMore: sessions.length > PAGE_SIZE,
    });
  });

  /** Spots and riders that appear in the sessions the user may see, for the board's filters. */
  router.get('/filters', async (req, res) => {
    const visible = visibleTo(req.user!.id);
    const [spotIds, userIds] = await Promise.all([
      SessionModel.distinct('spotId', visible),
      SessionModel.distinct('userId', visible),
    ]);
    const [spots, names] = await Promise.all([
      SpotModel.find({ _id: { $in: spotIds } }, { name: 1 }).sort({ name: 1 }),
      riderNames(userIds.map(String)),
    ]);
    res.json({
      spots: spots.map((s) => ({ id: s.id, name: s.name })),
      riders: [...names]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  });

  /** Logs a session; its Day (whole day of forecasts and observations) is saved with it. */
  router.post('/', async (req, res) => {
    const spot = await findSpot(req, res, req.body?.spotId);
    if (!spot) return;
    const { fields, issues } = parseSession(req.body ?? {});
    if (issues.length) {
      res.status(400).json({ error: 'Invalid session', issues });
      return;
    }
    const day = await days.ensureDay(spot, fields.date!, 'session');
    const session = await SessionModel.create({
      ...fields,
      userId: req.user!.id,
      spotId: spot._id,
      dayId: day._id,
    });
    const names = await riderNames([req.user!.id]);
    res.status(201).json(serializeSession(session, req.user!.id, names));
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const session = isValidObjectId(id) ? await SessionModel.findById(id) : null;
    if (!session || (session.visibility === 'private' && session.userId !== req.user!.id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const names = await riderNames([session.userId]);
    res.json(serializeSession(session, req.user!.id, names));
  });

  /** The rider edits their session; a new date moves it to that date's Day. */
  router.patch('/:id', async (req, res) => {
    const session = await findOwnSession(req, res);
    if (!session) return;
    const { fields, issues } = parseSession({ ...req.body, spotId: undefined }, { partial: true });
    const start = fields.start ?? session.start;
    const end = fields.end ?? session.end;
    if (!issues.some((i) => i.field === 'end') && end <= start) {
      issues.push({ code: 'BEFORE_START', field: 'end' });
    }
    if (issues.length) {
      res.status(400).json({ error: 'Invalid session', issues });
      return;
    }
    if (fields.date && fields.date !== session.date) {
      const spot = await SpotModel.findById(session.spotId).orFail();
      session.dayId = (await days.ensureDay(spot, fields.date, 'session'))._id;
    }
    session.set(fields);
    await session.save();
    const names = await riderNames([session.userId]);
    res.json(serializeSession(session, req.user!.id, names));
  });

  /** The rider deletes their session; the Day stays (its data is still worth keeping). */
  router.delete('/:id', async (req, res) => {
    const session = await findOwnSession(req, res);
    if (!session) return;
    await session.deleteOne();
    res.status(204).end();
  });

  return router;
}
