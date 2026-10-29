import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArpav } from '../../src/sources/arpav.js';
import { createMetar } from '../../src/sources/metar.js';
import { on, stubFetch, type FakeHandler } from '../fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const minutesAgo = (m: number) => Math.floor((Date.now() - m * 60_000) / 1000);

const metarReport = (age: number, extra: Record<string, unknown> = {}) => ({
  icaoId: 'LIPZ',
  obsTime: minutesAgo(age),
  wdir: 90,
  wspd: 12,
  lat: 45.505,
  lon: 12.352,
  name: 'Venice/Polo Arpt, VE, IT',
  ...extra,
});

describe('METAR adapter', () => {
  const metar = createMetar();

  it('reads the latest report in knots, with the airport name and ICAO code', async () => {
    const fetchMock = stubFetch(
      on('https://aviationweather.gov/api/data/metar', {
        body: [metarReport(10, { wgst: 22 }), metarReport(40, { wspd: 9 })],
      }),
    );

    expect(await metar.check('lipz')).toEqual({
      usable: true,
      station: {
        source: 'metar',
        stationId: 'LIPZ',
        name: 'Venice/Polo Arpt (METAR LIPZ)',
        lat: 45.505,
        lon: 12.352,
      },
      latest: { time: expect.any(String), wind: 12, gust: 22, dir: 90 },
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ids: 'LIPZ',
      format: 'json',
      hours: '3',
    });
  });

  it('keeps a station with a variable light wind usable, without a direction', async () => {
    stubFetch(
      on('https://aviationweather.gov/', {
        body: [metarReport(10, { wdir: 'VRB', wspd: 2 }), metarReport(40)],
      }),
    );

    expect(await metar.check('LIPZ')).toMatchObject({
      usable: true,
      latest: { wind: 2, dir: null },
    });
  });

  it('reports a station without recent reports or without wind', async () => {
    stubFetch(
      on('https://aviationweather.gov/api/data/metar?ids=LIPP', { status: 204 }),
      on('https://aviationweather.gov/api/data/metar?ids=XXXX', {
        body: [metarReport(10, { icaoId: 'XXXX', wdir: null, wspd: null })],
      }),
    );

    expect(await metar.check('LIPP')).toEqual({ usable: false, reason: 'no_data' });
    expect(await metar.check('XXXX')).toMatchObject({ usable: false, reason: 'no_wind' });
  });

  it('returns the reports between two instants, oldest first', async () => {
    const fetchMock = stubFetch(
      on('https://aviationweather.gov/api/data/metar', {
        body: [metarReport(30), metarReport(150), metarReport(90)],
      }),
    );

    const list = await metar.history!(
      'LIPZ',
      new Date(Date.now() - 2 * 3_600_000),
      new Date(Date.now() - 20 * 60_000),
    );

    expect(list).toHaveLength(2);
    expect(list![0].time < list![1].time).toBe(true);
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('hours')).toBe('3');
  });

  it('finds airports that issue METARs within a radius', async () => {
    const fetchMock = stubFetch(
      on('https://aviationweather.gov/api/data/stationinfo', {
        body: [
          {
            icaoId: 'LIPZ',
            site: 'Venice/Polo Arpt',
            lat: 45.505,
            lon: 12.352,
            siteType: ['METAR', 'TAF'],
          },
          { icaoId: 'LIPP', site: 'Padova Area Contr', lat: 45.4, lon: 11.87, siteType: ['TAF'] },
          { icaoId: 'LIPH', site: 'Treviso Arpt', lat: 45.648, lon: 12.194, siteType: ['METAR'] },
        ],
      }),
    );

    const list = await metar.nearby!({ lat: 45.2, lon: 12.31 }, 40);

    expect(list.map((s) => s.stationId)).toEqual(['LIPZ']);
    const bbox = new URL(fetchMock.mock.calls[0][0] as string).searchParams
      .get('bbox')!
      .split(',')
      .map(Number);
    expect(bbox[0]).toBeCloseTo(44.84, 1);
    expect(bbox[2]).toBeCloseTo(45.56, 1);
  });
});

/** ARPAV's XML, in its own shape: CDATA names, one SENSORE block per measure, solar time. */
const STATIONS_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<METEOGRAMMI><STAZIONE><IDSTAZ>168</IDSTAZ><NOME><![CDATA[Chioggia - Sant'Anna]]></NOME><X>12.27596996</X><Y>45.14632401</Y><LINKSTAZ>0168.xml</LINKSTAZ></STAZIONE><STAZIONE><IDSTAZ>613</IDSTAZ><NOME><![CDATA[Chioggia (centro)]]></NOME><X>12.283051</X><Y>45.218127</Y><LINKSTAZ>0613.xml</LINKSTAZ></STAZIONE><STAZIONE><IDSTAZ>1</IDSTAZ><NOME><![CDATA[Fiames di Cortina]]></NOME><X>12.1398756</X><Y>46.5703678</Y><LINKSTAZ>0001.xml</LINKSTAZ></STAZIONE></METEOGRAMMI>`;

/** "YYYYMMDDHHmm" in solar time (UTC+1) for an instant `m` minutes ago, rounded to 30 min. */
function solar(m: number) {
  const t = new Date(Math.floor((Date.now() - m * 60_000) / 1_800_000) * 1_800_000 + 3_600_000);
  return t.toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

/** A station file; each reading is [minutes ago, wind m/s, direction]. */
function stationXml(
  withWind: boolean,
  readings: [number, number, number][] = [
    [60, 3.5, 66],
    [30, 5.144, 53],
  ],
) {
  const data = (pick: (r: [number, number, number]) => number) =>
    readings.map((r) => `<DATI ISTANTE="${solar(r[0])}"><VM>${pick(r)}</VM></DATI>`).join('');
  const temp = `<SENSORE><ID>1</ID><PARAMNM>Temperatura aria a 2m</PARAMNM><TYPE>TEMP</TYPE><UNITNM>°C</UNITNM>${data(() => 8)}</SENSORE>`;
  const wind = withWind
    ? `<SENSORE><ID>2</ID><PARAMNM>Velocità vento a 10m</PARAMNM><TYPE>VVENTO</TYPE><UNITNM>m/s</UNITNM>${data((r) => r[1])}</SENSORE><SENSORE><ID>3</ID><PARAMNM>Direzione vento a 10m</PARAMNM><TYPE>DVENTO</TYPE><UNITNM>gradi</UNITNM>${data((r) => r[2])}</SENSORE>`
    : '';
  return `<?xml version="1.0" encoding="ISO-8859-1"?><CONTENITORE><LICENZA><![CDATA[Dati rilasciati con licenza CC BY 4.0]]></LICENZA><STAZIONE><IDSTAZ>168</IDSTAZ>${temp}${wind}</STAZIONE></CONTENITORE>`;
}

/** Answers with `text` encoded as ISO-8859-1, like ARPAV. */
function latin1(prefix: string, text: string): FakeHandler {
  return (url) =>
    url.toString().startsWith(prefix) ? { raw: Buffer.from(text, 'latin1') } : undefined;
}

describe('ARPAV adapter', () => {
  it('reads the latest wind in knots from the station file, converting solar time to UTC', async () => {
    stubFetch(
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/stazioni.xml', STATIONS_XML),
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/0168.xml', stationXml(true)),
    );

    const result = await createArpav().check('168');

    expect(result).toMatchObject({
      usable: true,
      station: {
        source: 'arpav',
        stationId: '168',
        name: "Chioggia - Sant'Anna",
        lat: 45.14632401,
        lon: 12.27596996,
      },
      latest: { wind: 10, gust: null, dir: 53 },
    });
    // Solar time is UTC+1: the reading is 30-60 minutes old in UTC
    const age = Date.now() - Date.parse((result as { latest: { time: string } }).latest.time);
    expect(age).toBeGreaterThanOrEqual(30 * 60_000);
    expect(age).toBeLessThan(61 * 60_000);
  });

  it('flags stations without a wind sensor, and unknown stations', async () => {
    stubFetch(
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/stazioni.xml', STATIONS_XML),
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/0613.xml', stationXml(false)),
    );
    const arpav = createArpav();

    expect(await arpav.check('613')).toMatchObject({
      usable: false,
      reason: 'no_wind',
      station: { name: 'Chioggia (centro)' },
    });
    expect(await arpav.check('9999')).toEqual({ usable: false, reason: 'not_available' });
  });

  it('finds stations within a radius from the station list, loaded once', async () => {
    const fetchMock = stubFetch(
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/stazioni.xml', STATIONS_XML),
    );
    const arpav = createArpav();

    const first = await arpav.nearby!({ lat: 45.2, lon: 12.31 }, 20);
    await arpav.nearby!({ lat: 45.2, lon: 12.31 }, 20);

    expect(first.map((s) => s.name)).toEqual(["Chioggia - Sant'Anna", 'Chioggia (centro)']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the readings between two instants', async () => {
    stubFetch(
      latin1('https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/stazioni.xml', STATIONS_XML),
      latin1(
        'https://meteo.arpa.veneto.it/meteo/dati_meteo/xml/0168.xml',
        stationXml(true, [
          [600, 1, 10],
          [90, 3.5, 66],
          [30, 5.144, 53],
        ]),
      ),
    );

    const list = await createArpav().history!(
      '168',
      new Date(Date.now() - 3 * 3_600_000),
      new Date(),
    );

    expect(list?.map((r) => [r.wind, r.dir])).toEqual([
      [6.8, 66],
      [10, 53],
    ]);
  });
});
