import type { FakeHandler } from './fetch.js';

/**
 * A fake Open-Meteo forecast API: for every point and requested model (except `uncovered`),
 * `days` days of hourly wind from today 00:00 UTC, at `speed` knots from `dir` degrees.
 */
export function openMeteo({
  speed = 18,
  dir = 60,
  uncovered = [] as string[],
  now = new Date(),
} = {}): FakeHandler {
  return (url) => {
    if (!url.toString().startsWith('https://api.open-meteo.com/v1/forecast')) return undefined;
    const models = url.searchParams.get('models')!.split(',');
    const points = url.searchParams.get('latitude')!.split(',').length;
    const hours = Number(url.searchParams.get('forecast_days')) * 24;
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
    const time = Array.from({ length: hours }, (_, i) => start + i * 3600);
    const one = () => {
      const hourly: Record<string, number[]> = { time };
      for (const model of models.filter((m) => !uncovered.includes(m))) {
        const suffix = models.length === 1 ? '' : `_${model}`;
        hourly[`wind_speed_10m${suffix}`] = time.map(() => speed);
        hourly[`wind_gusts_10m${suffix}`] = time.map(() => speed + 6);
        hourly[`wind_direction_10m${suffix}`] = time.map(() => dir);
      }
      return { hourly };
    };
    return { body: points === 1 ? one() : Array.from({ length: points }, one) };
  };
}

/** A fake Marine API: waves everywhere, or nowhere (lakes) for points listed in `dry`. */
export function marine({ dry = [] as number[] } = {}): FakeHandler {
  return (url) => {
    if (!url.toString().startsWith('https://marine-api.open-meteo.com/')) return undefined;
    const lats = url.searchParams.get('latitude')!.split(',').map(Number);
    const time = [Math.floor(Date.now() / 1000)];
    const one = (lat: number) => {
      const v = dry.includes(lat) ? null : 0.6;
      return { hourly: { time, wave_height: [v], wave_period: [v], wave_direction: [v] } };
    };
    return { body: lats.length === 1 ? one(lats[0]) : lats.map(one) };
  };
}
