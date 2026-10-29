import { on, type FakeHandler } from './fetch.js';

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
    // A date range (past days) gets every hour of it, otherwise one value
    const time = url.searchParams.has('start_date')
      ? hoursBetween(url.searchParams.get('start_date')!, url.searchParams.get('end_date')!)
      : [Math.floor(Date.now() / 1000)];
    const one = (lat: number) => {
      const v = dry.includes(lat) ? null : 0.6;
      const values = time.map(() => v);
      return { hourly: { time, wave_height: values, wave_period: values, wave_direction: values } };
    };
    return { body: lats.length === 1 ? one(lats[0]) : lats.map(one) };
  };
}

/** Every hour (unix seconds, UTC) from `start` 00:00 to `end` 23:00. */
function hoursBetween(start: string, end: string): number[] {
  const first = Date.parse(`${start}T00:00:00Z`) / 1000;
  const last = Date.parse(`${end}T23:00:00Z`) / 1000;
  const hours = [];
  for (let t = first; t <= last; t += 3600) hours.push(t);
  return hours;
}

/**
 * A fake Previous Runs API: every requested model, every hour of the dates asked, the latest
 * run at `speed` knots and the run of the day before at `d1Speed`, both from `dir` degrees.
 * Models in `noD1` have no previous-day values (e.g. outside their horizon).
 */
export function previousRuns({
  speed = 18,
  d1Speed = 12,
  dir = 60,
  noD1 = [] as string[],
} = {}): FakeHandler {
  return (url) => {
    if (!url.toString().startsWith('https://previous-runs-api.open-meteo.com/')) return undefined;
    const models = url.searchParams.get('models')!.split(',');
    const time = hoursBetween(
      url.searchParams.get('start_date')!,
      url.searchParams.get('end_date')!,
    );
    const hourly: Record<string, (number | null)[]> = { time };
    for (const model of models) {
      const suffix = models.length === 1 ? '' : `_${model}`;
      for (const [variable, value] of [
        ['wind_speed_10m', speed],
        ['wind_gusts_10m', speed + 6],
        ['wind_direction_10m', dir],
      ] as const) {
        hourly[`${variable}${suffix}`] = time.map(() => value);
        hourly[`${variable}_previous_day1${suffix}`] = time.map(() =>
          noD1.includes(model)
            ? null
            : variable === 'wind_direction_10m'
              ? value
              : value - (speed - d1Speed),
        );
      }
    }
    return { body: { hourly } };
  };
}

/** A fake Windy station with a reading every 10 minutes from `from` to `to`. */
export function windyHistory(id: string, from: Date, to: Date, wind = 7.7): FakeHandler {
  return (url) => {
    if (
      !url
        .toString()
        .startsWith(`https://stations.windy.com/api/v2/opendata/station/${id}/observation`)
    ) {
      return undefined;
    }
    const ts: number[] = [];
    for (let t = from.getTime(); t < to.getTime(); t += 600_000) ts.push(t);
    return {
      body: {
        header: { id, name: `Windy ${id}`, lat: 45.21, lon: 12.3 },
        data: {
          ts,
          wind: ts.map(() => wind),
          wind_gust: ts.map(() => wind + 3),
          wind_dir: ts.map(() => 70),
        },
      },
    };
  };
}

/** METAR, ARPAV, Meteotrentino and ARPA Lombardia stations for searches: none, unless given. */
export function otherStations({
  metar = [] as { icaoId: string; site: string; lat: number; lon: number }[],
  arpav = '',
} = {}): FakeHandler[] {
  return [
    on('https://dati.meteotrentino.it/service.asmx/listaStazioni', {
      raw: Buffer.from('<ArrayOfAnagrafica/>'),
    }),
    on('https://www.dati.lombardia.it/resource/nf78-nj6b.json', { body: [] }),
    on('https://aviationweather.gov/api/data/stationinfo', {
      body: metar.map((m) => ({ ...m, siteType: ['METAR'] })),
    }),
    (url) =>
      url.toString().startsWith('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/stazioni.xml')
        ? { raw: Buffer.from(`<METEOGRAMMI>${arpav}</METEOGRAMMI>`, 'latin1') }
        : undefined,
  ];
}
