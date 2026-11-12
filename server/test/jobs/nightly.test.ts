import { afterEach, describe, expect, it, vi } from 'vitest';
import { nightlyJob } from '../../src/jobs/nightly.js';
import { addDays, localDate, localHours } from '../../src/domain/time.js';
import { DayModel } from '../../src/models/day.js';
import { SpotModel } from '../../src/models/spot.js';
import { createTestApp } from '../app.js';
import { useTestDatabase } from '../db.js';
import { stubFetch } from '../fetch.js';
import { marine, previousRuns, windyHistory } from '../sources-stubs.js';

const spot = (fields: Record<string, unknown> = {}) =>
  SpotModel.create({
    name: 'Sottomarina',
    lat: 45.2,
    lon: 12.31,
    type: 'sea',
    status: 'verified',
    isStudySpot: true,
    goodDirections: [{ from: 30, to: 120 }],
    forecastModels: ['icon_d2', 'ecmwf_ifs'],
    station: {
      source: 'windy',
      stationId: 'near',
      name: 'Station near',
      lat: 45.21,
      lon: 12.3,
      distanceKm: 1.4,
      notes: '',
    },
    ...fields,
  });

const now = new Date();
const yesterday = addDays(localDate(now), -1);

/** Forecasts at `forecast` knots and Windy readings at `stationMs` m/s for yesterday. */
function stubYesterday({ forecast, stationMs }: { forecast: number; stationMs: number }) {
  const hours = localHours(yesterday);
  const from = new Date(hours[0]);
  const to = new Date(new Date(hours.at(-1)!).getTime() + 3_600_000);
  stubFetch(
    previousRuns({ speed: forecast, d1Speed: forecast }),
    marine(),
    windyHistory('near', from, to, stationMs),
  );
}

describe('nightly job', () => {
  useTestDatabase();
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = () => nightlyJob(createTestApp().days).run(now);

  it('saves a study day when both the forecast and the station had good wind', async () => {
    const s = await spot();
    stubYesterday({ forecast: 18, stationMs: 8 });
    await run();

    const day = await DayModel.findOne({ spotId: s._id, date: yesterday });
    expect(day?.reasons).toEqual(['auto_forecast', 'auto_observed']);
    expect(day?.forecastsFinal).toBe(true);
    expect(day?.observed).toMatchObject({ status: 'ok', final: true });
  });

  it('saves the days the models under-predicted, from the station alone', async () => {
    const s = await spot();
    stubYesterday({ forecast: 8, stationMs: 8 });
    await run();
    expect((await DayModel.findOne({ spotId: s._id }))?.reasons).toEqual(['auto_observed']);
  });

  it('saves nothing without good wind, and ignores spots that are not study spots', async () => {
    await spot();
    await spot({ name: 'Other', lat: 45.3, isStudySpot: false });
    stubYesterday({ forecast: 18, stationMs: 3 });
    await run();
    // Only the study spot, and only because of the forecast
    const days = await DayModel.find();
    expect(days.map((d) => d.reasons)).toEqual([['auto_forecast']]);

    await DayModel.deleteMany({});
    stubYesterday({ forecast: 8, stationMs: 3 });
    await run();
    expect(await DayModel.countDocuments()).toBe(0);
  });

  it('completes the Days saved during the day, keeping their reasons', async () => {
    const s = await spot({ isStudySpot: false });
    await DayModel.create({ spotId: s._id, date: yesterday, reasons: ['session'] });
    stubYesterday({ forecast: 8, stationMs: 3 });
    await run();

    const day = await DayModel.findOne({ spotId: s._id, date: yesterday });
    expect(day?.reasons).toEqual(['session']);
    expect(day?.forecastsFinal).toBe(true);
    expect(day?.observed.final).toBe(true);
    expect(day?.forecasts).toHaveLength(4);
  });

  it('adds the study reasons to a Day that already exists', async () => {
    const s = await spot();
    await DayModel.create({ spotId: s._id, date: yesterday, reasons: ['manual'] });
    stubYesterday({ forecast: 18, stationMs: 3 });
    await run();
    expect((await DayModel.findOne({ spotId: s._id }))?.reasons).toEqual([
      'manual',
      'auto_forecast',
    ]);
  });

  it('goes on with the other spots when a source fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await spot();
    stubFetch(() => ({ status: 500 }));
    await expect(run()).resolves.toBeUndefined();
    expect(await DayModel.countDocuments()).toBe(0);
  });
});
