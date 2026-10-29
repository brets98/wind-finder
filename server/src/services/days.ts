import type { HydratedDocument } from 'mongoose';
import { hourlyObserved, isDayOver, observedReachable, type DayReason } from '../domain/day.js';
import { localHours } from '../domain/time.js';
import { DayModel, type Day, type DayObserved, type ObservedReason } from '../models/day.js';
import { SpotModel, type Spot } from '../models/spot.js';
import { fetchMarineDay, fetchPastForecast, probeModelsMany } from '../sources/open-meteo.js';
import type { StationService } from './stations.js';

type SpotDoc = HydratedDocument<Spot>;
export type DayDoc = HydratedDocument<Day>;

/** A Day still missing data is completed again at most this often. */
export const REFILL_MS = 30 * 60 * 1000;

const unavailable = (reason: ObservedReason, final: boolean): DayObserved => ({
  status: 'unavailable',
  reason,
  station: null,
  usedBackup: false,
  times: [],
  wind: [],
  gust: [],
  dir: [],
  final,
});

export function createDayService(stations: StationService) {
  /** The station's readings of the day: main station first, then the backup. */
  async function observe(spot: SpotDoc, date: string, hours: string[], now: Date) {
    if (!observedReachable(date, now)) return unavailable('too_old', true);
    if (!spot.station) return unavailable('no_station', false);

    const from = new Date(hours[0]);
    const to = new Date(new Date(hours.at(-1)!).getTime() + 3_600_000);
    const over = isDayOver(date, now);
    let reason: ObservedReason = 'no_data';
    for (const [ref, usedBackup] of [
      [spot.station, false],
      [spot.backupStation, true],
    ] as const) {
      if (!ref) continue;
      const result = await stations.history(ref, from, to);
      if ('readings' in result && result.readings.length > 0) {
        const r = result.readings;
        return {
          status: over ? 'ok' : 'partial',
          reason: null,
          station: {
            source: ref.source,
            stationId: ref.stationId,
            name: ref.name,
            distanceKm: ref.distanceKm,
          },
          usedBackup,
          times: r.map((x) => new Date(x.time)),
          wind: r.map((x) => x.wind),
          gust: r.map((x) => x.gust),
          dir: r.map((x) => x.dir),
          final: over,
        } satisfies DayObserved;
      }
      if ('reason' in result && !usedBackup) reason = result.reason;
    }
    return unavailable(reason, false);
  }

  /**
   * Completes a Day: both forecast runs of every model covering the spot (and waves for sea
   * spots) until they are final, then the station's readings while they can still be fetched.
   * Sources that fail leave the data missing; the next fill tries again.
   */
  async function fill(day: DayDoc, spot: SpotDoc, now = new Date(), { force = false } = {}) {
    const complete = day.forecastsFinal && day.observed.final;
    const recent = day.filledAt && now.getTime() - day.filledAt.getTime() < REFILL_MS;
    if (complete || (recent && !force)) return day;

    const hours = localHours(day.date);
    day.hours = hours.map((h) => new Date(h));

    if (!day.forecastsFinal) {
      try {
        if (spot.forecastModels.length === 0) {
          [spot.forecastModels] = await probeModelsMany([spot]);
          await SpotModel.updateOne({ _id: spot._id }, { forecastModels: spot.forecastModels });
        }
        const past = await fetchPastForecast(spot, spot.forecastModels, day.date);
        day.forecasts = [
          ...past.d1.map((m) => ({ ...m, run: 'd1' as const })),
          ...past.d0.map((m) => ({ ...m, run: 'd0' as const })),
        ];
        if (spot.type === 'sea') {
          const marine = await fetchMarineDay(spot, day.date);
          day.marine = {
            waveHeight: marine.waveHeight,
            wavePeriod: marine.wavePeriod,
            waveDir: marine.waveDir,
          };
        }
        day.forecastsFinal = isDayOver(day.date, now);
      } catch (err) {
        console.error(`Could not fetch the forecasts of ${day.date}:`, err);
      }
    }

    if (!day.observed.final) day.observed = await observe(spot, day.date, hours, now);

    day.filledAt = now;
    await day.save();
    return day;
  }

  /** The Day of a spot and date, created if needed, with `reason` added and its data filled. */
  async function ensureDay(spot: SpotDoc, date: string, reason: DayReason, now = new Date()) {
    const day = await DayModel.findOneAndUpdate(
      { spotId: spot._id, date },
      { $addToSet: { reasons: reason } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).orFail();
    return fill(day, spot, now);
  }

  return { ensureDay, fill };
}

export type DayService = ReturnType<typeof createDayService>;

/** A Day as the client sees it: ISO times and the readings summed up per hour. */
export function serializeDay(day: DayDoc) {
  const hours = day.hours.map((h) => h.toISOString());
  const o = day.observed;
  const readings = o.times.map((t, i) => ({
    time: t.toISOString(),
    wind: o.wind[i] ?? null,
    gust: o.gust[i] ?? null,
    dir: o.dir[i] ?? null,
  }));
  return {
    id: day.id as string,
    spotId: String(day.spotId),
    date: day.date,
    reasons: day.reasons,
    hours,
    forecasts: day.forecasts.map((f) => ({
      model: f.model,
      run: f.run,
      speed: f.speed,
      gust: f.gust,
      dir: f.dir,
    })),
    forecastsFinal: day.forecastsFinal,
    marine: day.marine
      ? {
          waveHeight: day.marine.waveHeight,
          wavePeriod: day.marine.wavePeriod,
          waveDir: day.marine.waveDir,
        }
      : null,
    observed: {
      status: o.status,
      reason: o.reason,
      station: o.station,
      usedBackup: o.usedBackup,
      final: o.final,
      readings,
      hourly: hourlyObserved(hours, readings),
    },
    updatedAt: (day as unknown as { updatedAt: Date }).updatedAt,
  };
}
