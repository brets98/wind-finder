import { afterEach, describe, expect, it, vi } from 'vitest';
import { solarToUtc, utcToSolar } from '../../src/sources/http.js';
import { createLombardia } from '../../src/sources/lombardia.js';
import { createMeteotrentino } from '../../src/sources/meteotrentino.js';
import { on, stubFetch } from '../fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Solar time (UTC+1) "YYYY-MM-DDTHH:mm:00" for `m` minutes ago, on a 15-minute step. */
const solar = (m: number) =>
  utcToSolar(new Date(Math.floor((Date.now() - m * 60_000) / 900_000) * 900_000));

describe('solar time', () => {
  it('converts both ways', () => {
    expect(solarToUtc('2026-10-29T12:45:00')).toBe('2026-10-29T11:45:00.000Z');
    expect(solarToUtc('2026-07-01T00:30:00.000')).toBe('2026-06-30T23:30:00.000Z');
    expect(utcToSolar(new Date('2026-10-29T11:45:00Z'))).toBe('2026-10-29T12:45:00');
  });
});

const TRENTINO_LIST = `<?xml version="1.0" encoding="utf-8"?>
<ArrayOfAnagrafica xmlns="http://www.meteotrentino.it/">
  <anagrafica><codice>T0193</codice><nome>Torbole (Belvedere)</nome><latitudine>45.8717</latitudine><longitudine>10.8747</longitudine><inizio>01/01/1990</inizio></anagrafica>
  <anagrafica><codice>T0298</codice><nome>Riva</nome><latitudine>45.88</latitudine><longitudine>10.84</longitudine><inizio>01/01/1920</inizio><fine>31/12/1964</fine></anagrafica>
  <anagrafica><codice>T0179</codice><nome>Trento (Roncafort)</nome><latitudine>46.09</latitudine><longitudine>11.10</longitudine><inizio>01/01/1990</inizio></anagrafica>
</ArrayOfAnagrafica>`;

function trentinoData(winds: [age: number, v: number, vmax: number, d: number][] | null) {
  const venti = winds
    ? `<venti>${winds
        .map(
          ([age, v, vmax, d]) =>
            `<vento_al_suolo UM_VV="m/s" UM_VVMAX="m/s" UM_DV="gN"><data>${solar(age)}</data><v>${v}</v><vmax>${vmax}</vmax><d>${d}</d></vento_al_suolo>`,
        )
        .join('')}</venti>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?><datiOggi xmlns="http://www.meteotrentino.it/"><temperature><temperatura_aria UM="°C"><data>${solar(30)}</data><temperatura>8.1</temperatura></temperatura_aria></temperature>${venti}</datiOggi>`;
}

const xml = (text: string) => ({ raw: Buffer.from(text) });

describe('Meteotrentino adapter', () => {
  const list = on('https://dati.meteotrentino.it/service.asmx/listaStazioni', xml(TRENTINO_LIST));

  it('reads the latest wind with its gust, in knots, from solar time to UTC', async () => {
    stubFetch(
      list,
      on(
        'https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione?codice=T0193',
        xml(
          trentinoData([
            [45, 3.0, 4.5, 180],
            [30, 7.2, 9.3, 190],
          ]),
        ),
      ),
    );

    const result = await createMeteotrentino().check('T0193');

    expect(result).toMatchObject({
      usable: true,
      station: {
        source: 'meteotrentino',
        stationId: 'T0193',
        name: 'Torbole (Belvedere)',
        lat: 45.8717,
        lon: 10.8747,
      },
      latest: { wind: 14, gust: 18.1, dir: 190 },
    });
    const age = Date.now() - Date.parse((result as { latest: { time: string } }).latest.time);
    expect(age).toBeGreaterThanOrEqual(30 * 60_000);
    expect(age).toBeLessThan(46 * 60_000);
  });

  it('flags stations without wind, closed or unknown ones', async () => {
    stubFetch(
      list,
      on(
        'https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione?codice=T0179',
        xml(trentinoData(null)),
      ),
    );
    const trentino = createMeteotrentino();

    expect(await trentino.check('T0179')).toMatchObject({ usable: false, reason: 'no_wind' });
    expect(await trentino.check('T0298')).toEqual({ usable: false, reason: 'not_available' });
  });

  it('finds active stations within a radius and returns readings between two instants', async () => {
    stubFetch(
      list,
      on(
        'https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione',
        xml(
          trentinoData([
            [600, 1, 2, 10],
            [90, 3, 4, 20],
            [60, 5, 6, 30],
          ]),
        ),
      ),
    );
    const trentino = createMeteotrentino();

    expect(
      (await trentino.nearby!({ lat: 45.87, lon: 10.87 }, 20)).map((s) => s.stationId),
    ).toEqual(['T0193']);
    const readings = await trentino.history!(
      'T0193',
      new Date(Date.now() - 3 * 3_600_000),
      new Date(),
    );
    expect(readings?.map((r) => r.dir)).toEqual([20, 30]);
  });
});

const LOMBARDIA_REGISTRY = [
  {
    idsensore: '19109',
    tipologia: 'Velocità Vento',
    idstazione: '573',
    nomestazione: 'Colico v.La Madoneta',
    lat: '46.1347',
    lng: '9.3711',
  },
  {
    idsensore: '6008',
    tipologia: 'Direzione Vento',
    idstazione: '573',
    nomestazione: 'Colico v.La Madoneta',
    lat: '46.1347',
    lng: '9.3711',
  },
  {
    idsensore: '11811',
    tipologia: 'Velocità Vento',
    idstazione: '1202',
    nomestazione: 'Vercana',
    lat: '46.1818',
    lng: '9.3246',
  },
  {
    idsensore: '17502',
    tipologia: 'Velocità Vento',
    idstazione: '817',
    nomestazione: 'Pavia SS 35',
    lat: '45.18',
    lng: '9.15',
  },
];

const row = (idsensore: string, age: number, valore: number, idoperatore = '1', stato = 'VA') => ({
  idsensore,
  data: `${solar(age)}.000`,
  valore: String(valore),
  idoperatore,
  stato,
});

describe('ARPA Lombardia adapter', () => {
  const registry = on('https://www.dati.lombardia.it/resource/nf78-nj6b.json', {
    body: LOMBARDIA_REGISTRY,
  });

  it('combines speed, gust and direction sensors into readings in knots', async () => {
    const fetchMock = stubFetch(
      registry,
      on('https://www.dati.lombardia.it/resource/647i-nhxk.json', {
        body: [
          row('19109', 40, 4.2),
          row('6008', 40, 200),
          row('19109', 20, 5.144),
          row('19109', 20, 7.2, '3'),
          row('6008', 20, 210),
        ],
      }),
    );

    const lombardia = createLombardia('token-1');
    const result = await lombardia.check('573');
    await lombardia.check('1202');

    expect(result).toMatchObject({
      usable: true,
      station: {
        source: 'lombardia',
        stationId: '573',
        name: 'Colico v.La Madoneta',
        lat: 46.1347,
        lon: 9.3711,
      },
      latest: { wind: 10, gust: 14, dir: 210 },
    });
    // One shared request for the recent readings of every wind sensor, for both checks
    const dataCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('647i-nhxk'));
    expect(dataCalls).toHaveLength(1);
    const dataCall = dataCalls[0];
    const where = new URL(dataCall[0] as string).searchParams.get('$where')!;
    expect(where).toContain("idsensore in('19109','6008','11811','17502')");
    expect((dataCall[1]?.headers as Record<string, string>)['X-App-Token']).toBe('token-1');
  });

  it('drops missing and invalid values, and reads calm or variable as no direction', async () => {
    stubFetch(
      registry,
      on('https://www.dati.lombardia.it/resource/647i-nhxk.json', {
        body: [
          row('19109', 60, 3),
          row('6008', 60, 180),
          row('19109', 40, -9999),
          row('6008', 40, 190, '1', 'NA'),
          row('19109', 20, 0.3),
          row('6008', 20, 7777),
        ],
      }),
    );

    const readings = await createLombardia().history!(
      '573',
      new Date(Date.now() - 2 * 3_600_000),
      new Date(),
    );

    expect(readings?.map((r) => [r.wind, r.dir])).toEqual([
      [5.8, 180],
      [0.6, null],
    ]);
  });

  it('flags a station without a direction sensor, and unknown stations', async () => {
    stubFetch(
      registry,
      on('https://www.dati.lombardia.it/resource/647i-nhxk.json', { body: [row('11811', 20, 3)] }),
    );
    const lombardia = createLombardia();

    expect(await lombardia.check('1202')).toMatchObject({ usable: false, reason: 'no_wind' });
    expect(await lombardia.check('999')).toEqual({ usable: false, reason: 'not_available' });
  });

  it('reports throttling as an error, and finds stations within a radius', async () => {
    stubFetch(
      registry,
      on('https://www.dati.lombardia.it/resource/647i-nhxk.json', {
        status: 429,
        body: { message: 'Too many requests' },
      }),
    );
    const lombardia = createLombardia();

    expect(await lombardia.check('573')).toEqual({ usable: false, reason: 'error' });
    expect((await lombardia.nearby!({ lat: 46.15, lon: 9.35 }, 10)).map((s) => s.name)).toEqual([
      'Colico v.La Madoneta',
      'Vercana',
    ]);
  });
});
